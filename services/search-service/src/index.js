const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./db');
const redisClient = require('./redisClient');

const app = express();
const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

app.use(express.json());

// Мидлвар для проверки токена (API Gateway уже пропустил валидный запрос, но нам нужен ID пользователя для изоляции данных)
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Нет токена' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (e) {
        return res.status(401).json({ message: 'Недействительный токен' });
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
// Роут для получения истории всех разборов пользователя
app.get('/history', authenticateUser, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, job_id, raw_text, structured_analysis, created_at FROM transcriptions WHERE user_id = $1 ORDER BY created_at DESC',
            [req.userId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Ошибка получения истории' });
    }
});

app.listen(PORT, () => {
    console.log(`🔎 Search Service запущен на порту ${PORT}`);
});