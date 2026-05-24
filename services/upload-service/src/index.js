const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');
const { connectQueue, publishJob } = require('./queue');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

app.use(express.json());

// Настройка хранилища Multer (пока локально в volume, позже можно S3)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '/usr/src/app/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // Лимит 500 МБ
});

// Инициализация RabbitMQ
connectQueue();

// Мидлвар для извлечения ID пользователя из токена
// API Gateway уже проверил токен на валидность, но нам нужен ID юзера для БД
const getUserFromToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.userId = decoded.userId;
        } catch (e) {
            console.error("Не удалось декодировать токен в Upload Service");
        }
    }
    next();
};

// Мидлвар для проверки блокировки (бана) пользователя
const checkUserBan = async (req, res, next) => {
    const userId = req.userId;
    if (!userId) return next();

    try {
        const userRes = await db.query(
            'SELECT banned_until, is_permanently_banned FROM users WHERE id = $1',
            [userId]
        );
        if (userRes.rows.length === 0) return next();

        const { banned_until, is_permanently_banned } = userRes.rows[0];

        if (is_permanently_banned) {
            const lang = req.headers['accept-language'] || 'ru';
            let msg = 'Ваш аккаунт заблокирован навсегда.';
            if (lang.startsWith('en')) msg = 'Your account has been permanently blocked.';
            if (lang.startsWith('kk')) msg = 'Сіздің аккаунтыңыз біржола блокталған.';
            return res.status(403).json({ message: msg, banned: true });
        }

        if (banned_until && new Date(banned_until) > new Date()) {
            const lang = req.headers['accept-language'] || 'ru';
            const banDateStr = new Date(banned_until).toLocaleString(
                lang.startsWith('ru') ? 'ru-RU' : lang.startsWith('kk') ? 'kk-KZ' : 'en-US'
            );
            let msg = `Ваш аккаунт заблокирован. Временная блокировка истекает: ${banDateStr}`;
            if (lang.startsWith('en')) msg = `Your account is blocked. Temporary ban expires on: ${banDateStr}`;
            if (lang.startsWith('kk')) msg = `Сіздің аккаунтыңыз блокталған. Уақытша блоктау ${banDateStr} дейін жарамды.`;
            return res.status(403).json({ message: msg, banned: true, bannedUntil: banned_until });
        }

        next();
    } catch (err) {
        console.error('Ошибка проверки бана в Upload Service:', err);
        next();
    }
};

// Мидлвар для лимитирования частоты запросов на анализ (rate-limiting)
const checkRateLimit = async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ message: 'Доступ запрещен. Пользователь не аутентифицирован.' });
    }

    const createLimitsExceededNotification = async (uid) => {
        try {
            const checkRes = await db.query(
                "SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'LIMITS_EXCEEDED' AND created_at >= NOW() - INTERVAL '12 hours'",
                [uid]
            );
            if (checkRes.rows.length === 0) {
                const notifData = {
                    message_en: 'You have reached your analysis limit (0 requests remaining). Upgrade to PRO for unlimited access!',
                    message_ru: 'Вы исчерпали доступный лимит анализов (осталось 0 запросов). Перейдите на PRO для безлимитного доступа!',
                    message_kk: 'Талдаудың қолжетімді лимиті таусылды (0 сұраныс қалды). Шектеусіз кіру үшін PRO-ға өтіңіз!'
                };
                await db.query(
                    'INSERT INTO notifications (user_id, type, data) VALUES ($1, $2, $3)',
                    [uid, 'LIMITS_EXCEEDED', JSON.stringify(notifData)]
                );
                console.log(`🔔 Создано уведомление LIMITS_EXCEEDED для пользователя ${uid}`);
            }
        } catch (error) {
            console.error('Ошибка создания уведомления о лимитах:', error);
        }
    };

    try {
        // 1. Получаем актуальную роль и кастомные запросы пользователя из базы данных
        const userRes = await db.query('SELECT role, custom_requests FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден.' });
        }
        const { role, custom_requests } = userRes.rows[0];

        // Pro и admin имеют безлимитный доступ
        if (role === 'Pro' || role === 'admin') {
            return next();
        }

        // 2. Считаем количество анализов за последние 12 часов
        const jobsCountRes = await db.query(
            "SELECT COUNT(*) FROM jobs WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '12 hours'",
            [userId]
        );
        const requestCount = parseInt(jobsCountRes.rows[0].count, 10);

        // 3. Лимиты по ролям
        const limits = {
            'Standard': 2,
            'Lite': 10
        };
        const limit = limits[role] !== undefined ? limits[role] : 2;

        if (requestCount >= limit) {
            // Если стандартный лимит превышен, проверяем кастомные запросы
            if (custom_requests > 0) {
                await db.query('UPDATE users SET custom_requests = custom_requests - 1 WHERE id = $1', [userId]);
                console.log(`🎟️ Использован 1 кастомный запрос для пользователя ${userId}. Осталось: ${custom_requests - 1}`);
                
                if (custom_requests - 1 === 0) {
                    await createLimitsExceededNotification(userId);
                }
                
                return next();
            }

            return res.status(429).json({
                message: `Лимит запросов на анализ исчерпан. Для вашей роли (${role}) лимит составляет ${limit} запроса(ов) в 12 часов. Вы уже отправили ${requestCount} запрос(ов). Дополнительных кастомных запросов: ${custom_requests || 0}.`
            });
        }

        if (limit - requestCount === 1 && (!custom_requests || custom_requests === 0)) {
            await createLimitsExceededNotification(userId);
        }

        next();
    } catch (err) {
        console.error('Ошибка проверки лимитов в Upload Service:', err);
        res.status(500).json({ message: 'Внутренняя ошибка сервера при проверке лимитов частоты запросов.' });
    }
};

// Мидлвар для проверки подтверждения почты (email verification guard)
const checkEmailVerification = async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ message: 'Доступ запрещен. Пользователь не аутентифицирован.' });
    }

    try {
        // Проверяем статус верификации в базе данных
        const userRes = await db.query('SELECT is_verified FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден.' });
        }

        const isVerified = userRes.rows[0].is_verified;
        if (!isVerified) {
            return res.status(403).json({
                message: 'Доступ заблокирован. Пожалуйста, подтвердите ваш email-адрес. Мы отправили ссылку для активации аккаунта на вашу почту.',
                emailUnverified: true
            });
        }

        next();
    } catch (err) {
        console.error('Ошибка проверки подтверждения почты в Upload Service:', err);
        res.status(500).json({ message: 'Внутренняя ошибка сервера при проверке статуса верификации.' });
    }
};

// Роут для загрузки файла
app.post('/', getUserFromToken, checkUserBan, checkEmailVerification, checkRateLimit, upload.single('mediaFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Файл не загружен' });
    }

    const userId = req.userId || 0; // В идеале здесь должен быть реальный ID из токена
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const { language } = req.body;

    try {
        // 1. Создаем запись в БД 
        const jobResult = await db.query(
            'INSERT INTO jobs (user_id, file_name, file_path, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, fileName, filePath, 'PENDING']
        );
        const jobId = jobResult.rows[0].id;

        // 2. Отправляем задачу в очередь 
        const jobData = {
            jobId: jobId,
            userId: userId,
            filePath: filePath,
            fileName: fileName,
            language: language || 'ru'
        };
        
        await publishJob(jobData);

        // 3. Возвращаем HTTP 202 Accepted 
        res.status(202).json({ 
            message: 'Файл принят в обработку',
            job_id: jobId 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка при обработке загрузки' });
    }
});

// Роут проверки статуса задачи
app.get('/status/:jobId', async (req, res) => {
    try {
        const jobResult = await db.query('SELECT id, file_name, status, created_at FROM jobs WHERE id = $1', [req.params.jobId]);
        if (jobResult.rows.length === 0) {
            return res.status(404).json({ message: 'Задача не найдена' });
        }
        res.json(jobResult.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});
app.get('/jobs/all', async (req, res) => {
    try {
        const jobsResult = await db.query('SELECT id, user_id, file_name, status, created_at FROM jobs ORDER BY created_at DESC');
        res.status(200).json(jobsResult.rows);
    } catch (error) {
        console.error('Ошибка при получении списка задач:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});
// Хелпер для извлечения ID видео из YouTube ссылки
const extractYoutubeId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
};

// Роут для обработки YouTube ссылок
app.post('/youtube', getUserFromToken, checkUserBan, checkEmailVerification, checkRateLimit, async (req, res) => {
    const { url } = req.body; 
    const userId = req.userId || 1;

    const videoId = extractYoutubeId(url);
    if (!videoId) {
        return res.status(400).json({ message: 'Некорректная ссылка YouTube. Не удалось извлечь ID видео.' });
    }

    try {
        // --- Оптимизация: Поиск кешированного результата по ID видео ---
        // Теперь ищем любой завершенный анализ, так как он содержит все 3 языка
        const existingTranscription = await db.query(
            `SELECT t.raw_text, t.structured_analysis 
             FROM transcriptions t
             JOIN jobs j ON t.job_id = j.id
             WHERE j.file_path ILIKE $1 
             AND j.status = 'COMPLETED'
             LIMIT 1`,
            [`%${videoId}%`]
        );

        if (existingTranscription.rows.length > 0) {
            console.log(`♻️ [Cache Hit] Найдена готовая мультиязычная аналитика для: ${videoId}`);
            const cached = existingTranscription.rows[0];

            const jobResult = await db.query(
                'INSERT INTO jobs (user_id, file_name, file_path, status) VALUES ($1, $2, $3, $4) RETURNING id',
                [userId, `YouTube Video (Cached: ${videoId})`, url, 'COMPLETED']
            );
            const newJobId = jobResult.rows[0].id;

            await db.query(
                'INSERT INTO transcriptions (job_id, user_id, raw_text, structured_analysis) VALUES ($1, $2, $3, $4)',
                [newJobId, userId, cached.raw_text, cached.structured_analysis]
            );

            return res.status(200).json({ 
                message: 'Анализ получен из базы данных (кеш)', 
                job_id: newJobId,
                cached: true 
            });
        }
        
        console.log(`🔍 [Cache Miss] Видео ${videoId} не найдено, запускаем полный мультиязычный анализ...`);
        // --- Конец оптимизации ---

        const jobResult = await db.query(
            'INSERT INTO jobs (user_id, file_name, file_path, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, 'YouTube Video', url, 'PENDING']
        );
        const jobId = jobResult.rows[0].id;

        await publishJob({
            jobId: jobId,
            userId: userId,
            filePath: url,
            fileName: 'YouTube Video',
            isYoutube: true 
        });

        res.status(202).json({ message: 'YouTube ссылка принята в обработку', job_id: jobId });
    } catch (error) {
        console.error('Ошибка при обработке YouTube ссылки:', error);
        res.status(500).json({ message: 'Ошибка обработки ссылки' });
    }
});

app.listen(PORT, () => {
    console.log(`📁 Upload Service запущен на порту ${PORT}`);
});