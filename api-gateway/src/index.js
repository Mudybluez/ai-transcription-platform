const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const proxy = require('express-http-proxy');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

// Мидлвары безопасности и логирования
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Мидлвар для проверки JWT токена (авторизация)
const authenticateToken = (req, res, next) => {
    // Пропускаем роуты авторизации
    if (req.path.includes('/api/users/login') || req.path.includes('/api/users/register')) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Доступ запрещен. Токен не предоставлен.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Недействительный или просроченный токен.' });
        req.user = user;
        next();
    });
};

// Применяем проверку токена ко всем запросам
app.use(authenticateToken);

// --- МАРШРУТИЗАЦИЯ (ПРОКСИ) ---

// Запросы к микросервису пользователей
app.use('/api/users/change-password', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: () => '/change-password'
}));
app.use('/api/users', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001'));

// ... (existing code) ...

// Запросы к микросервису поиска
app.use('/api/search/admin/stats', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: () => '/admin/stats'
}));
app.use('/api/search', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003'));

app.use('/api/history/all/clear', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: () => '/history/all/clear'
}));

app.delete('/api/history/:id', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: (req) => `/history/${req.params.id}`
}));

app.get('/api/history', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: () => '/history'
}));

app.get('/api/user/stats/:id', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: (req) => `/user/stats/${req.params.id}`
}));

// Базовый роут для проверки работоспособности
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'API Gateway is running' });
});

app.listen(PORT, () => {
    console.log(`🚀 API Gateway запущен на порту ${PORT}`);
});