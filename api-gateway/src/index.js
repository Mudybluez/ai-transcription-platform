const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const proxy = require('express-http-proxy');
const jwt = require('jsonwebtoken');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

// Мидлвары безопасности и логирования
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Мидлвар для проверки JWT токена (авторизация)
const authenticateToken = (req, res, next) => {
    // Пропускаем роуты авторизации и верификации
    if (
        req.path.includes('/api/users/login') || 
        req.path.includes('/api/users/register') ||
        req.path.includes('/api/users/verify-email') ||
        req.path.includes('/api/users/resend-verification') ||
        req.path.includes('/api/users/recaptcha-site-key')
    ) {
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

// Мидлвар для проверки CSRF токена (защита от спама/DDoS)
const verifyCsrfToken = (req, res, next) => {
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken) {
        return res.status(403).json({ message: 'CSRF токен отсутствует.' });
    }
    try {
        const decoded = jwt.verify(csrfToken, JWT_SECRET);
        if (decoded.purpose !== 'csrf' || decoded.userId !== req.user.userId) {
            return res.status(403).json({ message: 'Недействительный CSRF токен.' });
        }
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Недействительный или истекший CSRF токен.' });
    }
};

// Применяем проверку токена ко всем запросам
app.use(authenticateToken);

// Эндпоинт для получения CSRF токена перед отправкой отзыва
app.get('/api/csrf-token', (req, res) => {
    const csrfToken = jwt.sign(
        { userId: req.user.userId, purpose: 'csrf' },
        JWT_SECRET,
        { expiresIn: '5m' } // Токен действителен в течение 5 минут
    );
    res.json({ csrfToken });
});

// --- МАРШРУТИЗАЦИЯ (ПРОКСИ) ---

// Запросы к микросервису пользователей
app.use('/api/users/change-password', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: () => '/change-password'
}));
app.use('/api/users', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001'));

// Запросы к микросервису загрузки файлов
app.use('/api/upload/youtube', proxy(process.env.UPLOAD_SERVICE_URL || 'http://localhost:3002', {
    proxyReqPathResolver: () => '/youtube'
}));
app.use('/api/upload', proxy(process.env.UPLOAD_SERVICE_URL || 'http://localhost:3002', {
    proxyReqPathResolver: () => '/',
    parseReqBody: false
}));

// Запросы к микросервису поиска
app.use('/api/search/admin/stats', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: () => '/admin/stats'
}));
app.use('/api/search/admin/proxy-stats', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: () => '/admin/proxy-stats'
}));
app.use('/api/search/admin/transcriptions/bulk', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: () => '/admin/transcriptions/bulk'
}));
app.use('/api/search/admin/transcriptions', proxy(process.env.SEARCH_SERVICE_URL || 'http://localhost:3003', {
    proxyReqPathResolver: () => '/admin/transcriptions'
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

// Прокси для MindMap Service
app.use('/api/mindmap', proxy(process.env.MINDMAP_SERVICE_URL || 'http://mindmap-service:3005'));

// Прокси для Feedbacks (user-service)
app.post('/api/feedbacks', verifyCsrfToken, proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: () => '/feedbacks'
}));
app.get('/api/feedbacks', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: () => '/feedbacks'
}));
app.post('/api/feedbacks/:id/reply', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: (req) => `/feedbacks/${req.params.id}/reply`
}));

// Прокси для Notifications (user-service)
app.get('/api/notifications', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: () => '/notifications'
}));
app.post('/api/notifications/read-all', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: () => '/notifications/read-all'
}));
app.post('/api/notifications/:id/read', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: (req) => `/notifications/${req.params.id}/read`
}));
app.delete('/api/notifications', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: () => '/notifications'
}));
app.delete('/api/notifications/:id', proxy(process.env.USER_SERVICE_URL || 'http://localhost:3001', {
    proxyReqPathResolver: (req) => `/notifications/${req.params.id}`
}));


// Базовый роут для проверки работоспособности
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'API Gateway is running' });
});

// --- WEBSOCKET SERVER & LIVE NOTIFICATIONS ---
const activeClients = new Map();

const wss = new WebSocket.Server({ noServer: true });

// Внутренний эндпоинт для рассылки уведомлений
app.post('/internal/notify', (req, res) => {
    const { userId, notification } = req.body;
    if (!userId || !notification) {
        return res.status(400).json({ error: 'Missing userId or notification' });
    }

    const clients = activeClients.get(parseInt(userId, 10)) || activeClients.get(userId.toString());
    if (clients && clients.size > 0) {
        const payload = JSON.stringify({
            type: 'notification',
            notification
        });
        clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
            }
        });
        console.log(`📡 Отправлено WebSocket уведомление пользователю ${userId}`);
    }

    res.status(200).json({ success: true });
});

function getJobStatus(jobId) {
    return new Promise((resolve, reject) => {
        const uploadServiceUrl = process.env.UPLOAD_SERVICE_URL || 'http://localhost:3002';
        let url;
        try {
            url = new URL(`${uploadServiceUrl}/status/${jobId}`);
        } catch (e) {
            return reject(e);
        }

        const options = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method: 'GET',
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON'));
                    }
                } else {
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
        req.end();
    });
}

wss.on('connection', (ws) => {
    console.log(`🔌 WebSocket connection established for user ${ws.userId}`);
    let pollInterval = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'subscribe') {
                const jobId = data.jobId;
                if (!jobId) return;

                console.log(`👤 User ${ws.userId} subscribed to job ${jobId}`);
                if (pollInterval) clearInterval(pollInterval);

                const checkStatus = async () => {
                    try {
                        const job = await getJobStatus(jobId);
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'status',
                                jobId: jobId,
                                status: job.status
                            }));
                        }

                        if (job.status === 'COMPLETED' || job.status.startsWith('FAILED')) {
                            clearInterval(pollInterval);
                        }
                    } catch (err) {
                        console.error(`Error fetching job status for ${jobId}:`, err.message);
                    }
                };

                checkStatus();
                pollInterval = setInterval(checkStatus, 2000);
            }
        } catch (err) {
            console.error('Error handling WebSocket message:', err);
        }
    });

    ws.on('close', () => {
        console.log(`🔌 WebSocket connection closed for user ${ws.userId}`);
        if (pollInterval) clearInterval(pollInterval);
        
        // Удаляем из активных клиентов
        if (activeClients.has(ws.userId)) {
            activeClients.get(ws.userId).delete(ws);
            if (activeClients.get(ws.userId).size === 0) {
                activeClients.delete(ws.userId);
            }
        }
    });

    ws.on('error', (err) => {
        console.error(`WebSocket error for user ${ws.userId}:`, err);
        if (pollInterval) clearInterval(pollInterval);
        
        // Удаляем из активных клиентов
        if (activeClients.has(ws.userId)) {
            activeClients.get(ws.userId).delete(ws);
            if (activeClients.get(ws.userId).size === 0) {
                activeClients.delete(ws.userId);
            }
        }
    });
});

server.on('upgrade', (request, socket, head) => {
    try {
        const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
        const pathname = parsedUrl.pathname;

        if (pathname === '/api/ws') {
            const token = parsedUrl.searchParams.get('token');
            if (!token) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            jwt.verify(token, JWT_SECRET, (err, decoded) => {
                if (err) {
                    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    socket.destroy();
                    return;
                }

                wss.handleUpgrade(request, socket, head, (ws) => {
                    ws.userId = decoded.userId;
                    
                    // Добавляем в активные клиенты
                    if (!activeClients.has(ws.userId)) {
                        activeClients.set(ws.userId, new Set());
                    }
                    activeClients.get(ws.userId).add(ws);
                    
                    wss.emit('connection', ws, request);
                });
            });
        } else {
            socket.destroy();
        }
    } catch (err) {
        console.error('Error handling upgrade:', err);
        socket.destroy();
    }
});

server.listen(PORT, () => {
    console.log(`🚀 API Gateway запущен на порту ${PORT}`);
});