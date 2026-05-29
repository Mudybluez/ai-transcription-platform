require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./db');
const redisClient = require('./redisClient');
const astroproxyService = require('./astroproxyService');

const app = express();
const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

app.use(express.json());

// Мидлвар для проверки токена и проверки блокировки (бана)
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Нет токена' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;

        // Проверяем блокировку (бан) пользователя в базе данных
        const userRes = await db.query(
            'SELECT banned_until, is_permanently_banned FROM users WHERE id = $1',
            [req.userId]
        );
        if (userRes.rows.length > 0) {
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
        }

        next();
    } catch (e) {
        return res.status(401).json({ message: 'Недействительный токен' });
    }
};

// Мидлвар для проверки прав администратора
const requireAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'Доступ запрещен. Токен не предоставлен.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: 'Доступ запрещен. Требуются права администратора.' });
        }
        req.userId = decoded.userId;
        next();
    } catch (e) {
        return res.status(403).json({ message: 'Недействительный или просроченный токен.' });
    }
};

app.get('/', authenticateUser, async (req, res) => {
    const searchQuery = req.query.q;
    const userId = req.userId;

    if (!searchQuery) {
        return res.status(400).json({ message: 'Пустой поисковый запрос' });
    }

    try {
        // Формируем уникальный ключ для кэша: 'search:ID_ПОЛЬЗОВАТЕЛЯ:ЗАПРОС'
        const cacheKey = `search:${userId}:${searchQuery.toLowerCase()}`;

        // 1. Проверяем кэш Redis (Cache Hit / Miss)
        const cachedResults = await redisClient.get(cacheKey);

        if (cachedResults) {
            console.log(`⚡ Возвращаем из кэша для запроса: "${searchQuery}"`);
            return res.status(200).json({
                source: 'cache',
                results: JSON.parse(cachedResults)
            });
        }

        // 2. Если кэша нет, ищем в PostgreSQL с помощью ILIKE (или FTS)
        console.log(`🔍 Ищем в базе данных: "${searchQuery}"`);
        
        // Ищем совпадения в сыром тексте или в JSON аналитике пользователя
        const dbQuery = `
            SELECT id, job_id, raw_text, structured_analysis, created_at 
            FROM transcriptions 
            WHERE user_id = $1 
            AND (raw_text ILIKE $2 OR structured_analysis::text ILIKE $2)
            ORDER BY created_at DESC
        `;
        
        // Используем символы % для поиска подстроки
        const queryParams = [userId, `%${searchQuery}%`];
        const result = await db.query(dbQuery, queryParams);

        // Форматируем результаты, чтобы не отдавать гигантские тексты целиком (создаем snippets) [cite: 257]
        const formattedResults = result.rows.map(row => {
            // Находим позицию слова и вырезаем кусочек текста вокруг него (snippet)
            const textLower = row.raw_text.toLowerCase();
            const index = textLower.indexOf(searchQuery.toLowerCase());
            let snippet = row.raw_text;
            
            if (index !== -1) {
                const start = Math.max(0, index - 50);
                const end = Math.min(row.raw_text.length, index + 50);
                snippet = "..." + row.raw_text.substring(start, end) + "...";
            }

            return {
                transcription_id: row.id,
                job_id: row.job_id,
                snippet: snippet,
                created_at: row.created_at
            };
        });

        // 3. Сохраняем результат в Redis на 5 минут (300 секунд)
        await redisClient.setEx(cacheKey, 300, JSON.stringify(formattedResults));

        // 4. Возвращаем результат
        res.status(200).json({
            source: 'database',
            results: formattedResults
        });

    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера при поиске' });
    }
});
// Роут для получения всей истории всех разборов пользователя
app.get('/history', authenticateUser, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT t.id, t.job_id, t.raw_text, t.structured_analysis, t.created_at, j.file_path, j.file_name 
             FROM transcriptions t 
             LEFT JOIN jobs j ON t.job_id = j.id 
             WHERE t.user_id = $1 
             ORDER BY t.created_at DESC`,
            [req.userId]
        );

        res.status(200).json({
            items: result.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка получения истории' });
    }
});

// Удаление конкретной записи
app.delete('/history/:id', authenticateUser, async (req, res) => {
    try {
        const result = await db.query(
            'DELETE FROM transcriptions WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Запись не найдена' });
        }
        res.status(200).json({ message: 'Запись удалена' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при удалении записи' });
    }
});

// Полная очистка истории пользователя
app.delete('/history/all/clear', authenticateUser, async (req, res) => {
    try {
        await db.query('DELETE FROM transcriptions WHERE user_id = $1', [req.userId]);
        res.status(200).json({ message: 'Вся история очищена' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при очистке истории' });
    }
});

// Статистика для админ-панели (расширенная)
app.get('/admin/stats', requireAdmin, async (req, res) => {
    try {
        const totalTranscriptions = await db.query('SELECT COUNT(*) FROM transcriptions');
        // Общий подсчет пользователей: теперь берем зарегистрированных пользователей из таблицы users!
        const totalUsers = await db.query('SELECT COUNT(*) FROM users');
        const totalLength = await db.query('SELECT SUM(LENGTH(raw_text)) as total_chars FROM transcriptions');
        
        // Подсчет за последние 24 часа
        const total24h = await db.query("SELECT COUNT(*) FROM transcriptions WHERE created_at >= NOW() - INTERVAL '24 hours'");
        
        // Подсчет общего количества слов через пробелы (быстрый и легкий способ для больших объемов)
        const totalWordsQuery = await db.query("SELECT SUM(LENGTH(raw_text) - LENGTH(REPLACE(raw_text, ' ', '')) + 1) as total_words FROM transcriptions");
        const totalWords = parseInt(totalWordsQuery.rows[0].total_words || 0);

        // Активность по дням (последние 7 дней)
        const dailyActivity = await db.query(`
            SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as count 
            FROM transcriptions 
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY day 
            ORDER BY day ASC
        `);

        // Распределение по языкам
        const langDistribution = await db.query(`
            SELECT 
                json_extract_path_text(structured_analysis::json, 'language') as lang,
                COUNT(*) as count
            FROM transcriptions 
            GROUP BY lang
        `);

        res.status(200).json({
            totalTranscriptions: parseInt(totalTranscriptions.rows[0].count),
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalChars: parseInt(totalLength.rows[0].total_chars || 0),
            totalWords: totalWords,
            total24h: parseInt(total24h.rows[0].count || 0),
            dailyActivity: dailyActivity.rows.map(r => ({
                day: r.day.toISOString().split('T')[0],
                count: parseInt(r.count)
            })),
            langDistribution: langDistribution.rows.map(r => ({
                label: r.lang || 'unknown',
                count: parseInt(r.count)
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка при получении статистики' });
    }
});

// Статистика использования прокси AstroProxy (только для администраторов)
app.get('/admin/proxy-stats', requireAdmin, async (req, res) => {
    try {
        const stats = await astroproxyService.getProxyStats();
        res.status(200).json(stats);
    } catch (error) {
        console.error('Ошибка при получении статистики AstroProxy:', error);
        res.status(500).json({ message: 'Ошибка получения метрик прокси' });
    }
});

// Получение списка всех разборов на платформе (только для администраторов)
app.get('/admin/transcriptions', requireAdmin, async (req, res) => {
    try {
        const queryText = `
            SELECT 
                t.id, 
                t.job_id, 
                t.user_id, 
                t.raw_text, 
                t.structured_analysis, 
                t.created_at,
                j.file_name,
                j.file_path as youtube_link,
                u.username as user_name
            FROM transcriptions t
            LEFT JOIN jobs j ON t.job_id = j.id
            LEFT JOIN users u ON t.user_id = u.id
            ORDER BY t.created_at DESC
        `;
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Ошибка при получении списка всех анализов:', error);
        res.status(500).json({ message: 'Ошибка сервера при получении списка разборов' });
    }
});

// Массовое удаление разборов (только для администраторов)
app.delete('/admin/transcriptions/bulk', requireAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Не предоставлен список ID для удаления' });
    }

    try {
        await db.query('DELETE FROM transcriptions WHERE id = ANY($1::int[])', [ids]);
        res.status(200).json({ message: 'Выбранные разборы успешно удалены' });
    } catch (error) {
        console.error('Ошибка массового удаления разборов:', error);
        res.status(500).json({ message: 'Ошибка сервера при массовом удалении' });
    }
});

// Детальная статистика пользователя
app.get('/user/stats/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Проверяем, что пользователь запрашивает свою статистику (или он админ)
        if (req.userId != userId) {
            // В идеале тут проверка на админа, но пока упростим
            return res.status(403).json({ message: 'Нет прав доступа' });
        }

        const total = await db.query('SELECT COUNT(*) FROM transcriptions WHERE user_id = $1', [userId]);
        const totalWords = await db.query('SELECT SUM(ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(raw_text, \'\\s+\'), 1)) as words FROM transcriptions WHERE user_id = $1', [userId]);
        
        const langUsage = await db.query(`
            SELECT 
                json_extract_path_text(structured_analysis::json, 'language') as lang,
                COUNT(*) as count
            FROM transcriptions 
            WHERE user_id = $1
            GROUP BY lang
        `, [userId]);

        res.status(200).json({
            totalTranscriptions: parseInt(total.rows[0].count),
            totalWords: parseInt(totalWords.rows[0].words || 0),
            languages: langUsage.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при получении личной статистики' });
    }
});

app.listen(PORT, () => {
    console.log(`🔎 Search Service запущен на порту ${PORT}`);
});