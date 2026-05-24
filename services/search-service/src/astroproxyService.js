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
        // Использование встроенного глобального fetch (доступен в Node.js v18+)
        // Устанавливаем таймаут запроса в 5 секунд с помощью AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`https://api.astroproxy.com/v1/stats?api_key=${encodeURIComponent(apiKey)}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
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
