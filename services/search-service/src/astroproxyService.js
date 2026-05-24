const axios = require('axios');

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
            source: 'placeholder'
        };
    }

    try {
        // Официальный эндпоинт AstroProxy API для получения трафика портов
        // Например: https://api.astroproxy.com/v1/stats?api_key=YOUR_KEY
        // Пользователь может заменить URL и параметры под структуру своего тарифа
        const response = await axios.get(`https://api.astroproxy.com/v1/stats`, {
            params: { api_key: apiKey },
            timeout: 5000
        });

        const data = response.data;
        const spentBytes = data.traffic_used || data.used || 0;
        const limitBytes = data.traffic_limit || data.limit || 1073741824;

        return {
            spentBytes,
            limitBytes,
            spentMB: parseFloat((spentBytes / (1024 * 1024)).toFixed(2)),
            limitMB: parseFloat((limitBytes / (1024 * 1024)).toFixed(2)),
            percentUsed: parseFloat(((spentBytes / limitBytes) * 100).toFixed(2)),
            source: 'api'
        };
    } catch (error) {
        console.warn(`[AstroProxy] Error fetching stats (using fallback): ${error.message}`);
        return {
            spentBytes: 257418240,
            limitBytes: 1073741824,
            spentMB: 245.5,
            limitMB: 1024.0,
            percentUsed: 23.97,
            source: 'fallback'
        };
    }
};

module.exports = {
    getProxyStats
};
