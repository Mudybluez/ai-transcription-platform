const apiCache = {};

// Сброс кэша
const clearApiCache = () => {
    console.log('[AstroProxy Cache] Clearing all cached entries due to mutation');
    for (const key in apiCache) {
        delete apiCache[key];
    }
};

// Функция кеширования GET-запросов к AstroProxy с TTL в 45 секунд
const cachedAstroProxyGet = async (urlStr, signal = null, ttlSeconds = 45) => {
    const now = Date.now();
    
    if (apiCache[urlStr] && (now - apiCache[urlStr].timestamp < ttlSeconds * 1000)) {
        console.log(`[AstroProxy Cache] Hit for ${urlStr}`);
        return apiCache[urlStr].data;
    }
    
    console.log(`[AstroProxy Cache] Miss for ${urlStr}. Fetching live...`);
    const options = {};
    if (signal) {
        options.signal = signal;
    }
    
    const response = await fetch(urlStr, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Кешируем только успешные ответы
    if (data && data.status === 'ok') {
        apiCache[urlStr] = {
            timestamp: now,
            data: data
        };
    }
    
    return data;
};

const getProxyStats = async () => {
    const apiKey = process.env.ASTROPROXY_API_KEY;
    if (!apiKey) {
        // Возвращаем реалистичные демо-данные в режиме плейсхолдера, если ключ API отсутствует
        return {
            spentBytes: 257418240, // ~245.5 MB
            limitBytes: 1073741824, // ~1024 MB (1 GB)
            spentMB: 245.5,
            limitMB: 1024.0,
            percentUsed: 23.97,
            balance: 15.50,
            currency: 'USD',
            source: 'placeholder'
        };
    }

    try {
        // Таймаут запроса в 5 секунд
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // 1. Запрос баланса по API с кешированием
        const balancePromise = cachedAstroProxyGet(
            `https://astroproxy.com/api/v1/balance?token=${encodeURIComponent(apiKey)}`,
            controller.signal
        ).catch(() => null);

        // 2. Запрос портов по API с кешированием
        const portsPromise = cachedAstroProxyGet(
            `https://astroproxy.com/api/v1/ports?token=${encodeURIComponent(apiKey)}`,
            controller.signal
        ).catch(() => null);

        const [balanceData, portsData] = await Promise.all([balancePromise, portsPromise]);
        clearTimeout(timeoutId);

        // Парсинг баланса
        let balance = 0.00;
        let currency = 'USD';
        if (balanceData && balanceData.status === 'ok' && balanceData.data) {
            balance = parseFloat(balanceData.data.balance || 0);
            currency = balanceData.data.currency === 2 ? 'RUB' : 'USD'; 
        }

        // Парсинг трафика портов
        let spentBytes = 0;
        let limitBytes = 0;

        if (portsData && portsData.status === 'ok' && Array.isArray(portsData.data)) {
            // Суммируем трафик по всем вашим активным прокси-портам
            portsData.data.forEach(port => {
                const used = port.traffic_used || port.used || 0;
                const limit = port.traffic_limit || port.limit || 0;
                spentBytes += parseInt(used);
                limitBytes += parseInt(limit);
            });
        }

        // Фолбек на 1 ГБ, если лимиты портов не заданы, для исключения деления на ноль
        if (limitBytes === 0) {
            limitBytes = 1073741824; 
        }

        return {
            spentBytes,
            limitBytes,
            spentMB: parseFloat((spentBytes / (1024 * 1024)).toFixed(2)),
            limitMB: parseFloat((limitBytes / (1024 * 1024)).toFixed(2)),
            percentUsed: parseFloat(((spentBytes / limitBytes) * 100).toFixed(2)),
            balance: balance,
            currency: currency,
            source: 'api'
        };
    } catch (error) {
        console.warn(`[AstroProxy] Error calling endpoints (using fallback): ${error.message}`);
        return {
            spentBytes: 257418240,
            limitBytes: 1073741824,
            spentMB: 245.5,
            limitMB: 1024.0,
            percentUsed: 23.97,
            balance: 15.50,
            currency: 'USD',
            source: 'fallback'
        };
    }
};

const handleMockResponse = (method, path, req, res) => {
    console.log(`[AstroProxy Demo] Mocking ${method} ${path}`);
    
    // Normalize path by removing trailing slash if any
    const cleanPath = path.replace(/\/$/, '');
    
    // 1. GET /balance
    if (cleanPath === '/balance' && method === 'GET') {
        return res.status(200).json({
            status: "ok",
            data: {
                balance: 15.50,
                currency: 2
            }
        });
    }
    
    // 6. POST /ports/{id}/renew
    if (/\/ports\/[^\/]+\/renew$/.test(cleanPath) && method === 'POST') {
        const portId = cleanPath.split('/')[2];
        return res.status(200).json({
            status: "ok",
            message: `Port ${portId} renewed successfully (Demo Mode)`
        });
    }

    // 7. GET /ports/{id}/newip
    if (/\/ports\/[^\/]+\/newip$/.test(cleanPath) && method === 'GET') {
        const portId = cleanPath.split('/')[2];
        return res.status(200).json({
            status: "ok",
            data: {
                new_ip: `185.15.112.${Math.floor(Math.random() * 250) + 2}`
            }
        });
    }

    // 4. DELETE /ports/{id}
    if (/\/ports\/[^\/]+$/.test(cleanPath) && method === 'DELETE') {
        const portId = cleanPath.split('/')[2];
        return res.status(200).json({
            status: "ok",
            message: `Port ${portId} deleted successfully (Demo Mode)`
        });
    }

    // 5. PATCH /ports/{id}
    if (/\/ports\/[^\/]+$/.test(cleanPath) && method === 'PATCH') {
        const portId = cleanPath.split('/')[2];
        return res.status(200).json({
            status: "ok",
            message: `Port ${portId} updated successfully (Demo Mode)`
        });
    }

    // 2. GET /ports
    if (cleanPath === '/ports' && method === 'GET') {
        return res.status(200).json({
            status: "ok",
            data: [
                {
                    id: "11111",
                    name: "Proxy Port 1 - Moscow",
                    ip: "185.15.112.45",
                    port: 10001,
                    status: "active",
                    traffic_used: 257418240,
                    traffic_limit: 1073741824,
                    country: "RU",
                    city: "Moscow",
                    operator: "MTS",
                    expires: "2026-06-25T12:00:00Z"
                },
                {
                    id: "22222",
                    name: "Proxy Port 2 - Almaty",
                    ip: "95.56.234.12",
                    port: 10002,
                    status: "active",
                    traffic_used: 128709120,
                    traffic_limit: 536870912,
                    country: "KZ",
                    city: "Almaty",
                    operator: "Beeline",
                    expires: "2026-06-28T15:30:00Z"
                }
            ]
        });
    }

    // 3. POST /ports
    if (cleanPath === '/ports' && method === 'POST') {
        return res.status(200).json({
            status: "ok",
            message: "Port purchased successfully (Demo Mode)",
            data: {
                id: `demo-${Math.floor(Math.random() * 90000) + 10000}`,
                name: req.body.name || "New Demo Port",
                ip: "192.168.1.100",
                port: 10003,
                status: "active",
                traffic_used: 0,
                traffic_limit: 1073741824,
                country: req.body.country || "RU",
                city: req.body.city || "Moscow",
                operator: req.body.operator || "MTS",
                expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            }
        });
    }

    // 8. GET /countries
    if (cleanPath === '/countries' && method === 'GET') {
        return res.status(200).json({
            status: "ok",
            data: [
                {"code": "RU", "name": "Russia"},
                {"code": "KZ", "name": "Kazakhstan"},
                {"code": "US", "name": "United States"}
            ]
        });
    }

    // 9. GET /cities
    if (cleanPath === '/cities' && method === 'GET') {
        return res.status(200).json({
            status: "ok",
            data: [
                {"id": "moscow", "name": "Moscow", "country": "RU"},
                {"id": "almaty", "name": "Almaty", "country": "KZ"},
                {"id": "astana", "name": "Astana", "country": "KZ"}
            ]
        });
    }

    // 10. GET /operators
    if (cleanPath === '/operators' && method === 'GET') {
        return res.status(200).json({
            status: "ok",
            data: [
                {"id": "mts", "name": "MTS", "country": "RU"},
                {"id": "beeline", "name": "Beeline", "country": "KZ"},
                {"id": "kcell", "name": "Kcell", "country": "KZ"}
            ]
        });
    }

    // 11. GET /lists
    if (cleanPath === '/lists' && method === 'GET') {
        return res.status(200).json({
            status: "ok",
            data: [
                {"id": "list-1", "name": "Default List"}
            ]
        });
    }

    // 12. POST /calculate
    if (cleanPath === '/calculate' && method === 'POST') {
        return res.status(200).json({
            status: "ok",
            data: {
                price: 2.50,
                currency: "USD"
            }
        });
    }

    return res.status(404).json({
        status: "error",
        message: `Unknown endpoint in Demo Mode: ${method} ${path}`
    });
};

const handleAstroProxyRequest = async (req, res) => {
    const apiKey = process.env.ASTROPROXY_API_KEY;
    
    // Получаем путь относительно /admin/proxy
    let apiPath = req.path.replace(/^\/admin\/proxy/, '');
    if (!apiPath.startsWith('/')) {
        apiPath = '/' + apiPath;
    }

    if (!apiKey) {
        // Режим заглушки (демо)
        return handleMockResponse(req.method, apiPath, req, res);
    }

    try {
        const targetUrl = new URL(`https://astroproxy.com/api/v1${apiPath}`);
        
        // Переносим все входящие query-параметры
        for (const [key, val] of Object.entries(req.query)) {
            targetUrl.searchParams.set(key, val);
        }
        
        // Обязательно добавляем token
        targetUrl.searchParams.set('token', apiKey);

        // Проверяем, можно ли обслужить GET-запрос из кэша
        if (req.method === 'GET' && !apiPath.includes('newip')) {
            try {
                const responseData = await cachedAstroProxyGet(targetUrl.toString(), null, 45);
                return res.status(200).json(responseData);
            } catch (cacheError) {
                console.warn(`[AstroProxy Cache] GET failed (falling back to live): ${cacheError.message}`);
            }
        }

        // В случае мутации (POST, DELETE, PATCH, newip) сбрасываем весь кэш
        clearApiCache();

        const options = {
            method: req.method,
            headers: {
                'Accept': 'application/json'
            }
        };

        // Если есть тело запроса (POST, PATCH), пересылаем его
        if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(req.body);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-секундный таймаут
        options.signal = controller.signal;

        const response = await fetch(targetUrl.toString(), options);
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`[AstroProxy] External API returned error status ${response.status} for ${apiPath}. Returning safe fallback.`);
            
            let fallbackData = [];
            if (apiPath.includes('balance')) {
                fallbackData = { balance: 0.00, currency: 2 };
            } else if (apiPath.includes('ports')) {
                fallbackData = [];
            } else if (apiPath.includes('countries')) {
                fallbackData = [
                    {"code": "RU", "name": "Russia"},
                    {"code": "KZ", "name": "Kazakhstan"},
                    {"code": "US", "name": "United States"}
                ];
            } else if (apiPath.includes('cities')) {
                fallbackData = [
                    {"id": "moscow", "name": "Moscow", "country": "RU"},
                    {"id": "almaty", "name": "Almaty", "country": "KZ"},
                    {"id": "astana", "name": "Astana", "country": "KZ"}
                ];
            } else if (apiPath.includes('operators')) {
                fallbackData = [
                    {"id": "mts", "name": "MTS", "country": "RU"},
                    {"id": "beeline", "name": "Beeline", "country": "KZ"},
                    {"id": "kcell", "name": "Kcell", "country": "KZ"}
                ];
            }
            
            return res.status(200).json({
                status: "ok",
                data: fallbackData,
                warning: `External AstroProxy API returned ${response.status}. Using local geo fallback.`
            });
        }

        const responseData = await response.json();
        return res.status(response.status).json(responseData);
    } catch (error) {
        console.error(`[AstroProxy] Error proxying ${req.method} ${apiPath}:`, error);
        return res.status(500).json({
            status: "error",
            message: `Ошибка обращения к AstroProxy API: ${error.message}`
        });
    }
};

module.exports = {
    getProxyStats,
    handleAstroProxyRequest
};

