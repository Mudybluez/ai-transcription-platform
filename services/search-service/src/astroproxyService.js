const db = require('./db');

const getProxyStats = async () => {
    try {
        // Запрос суммарной длины транскрибированных символов из нашей БД
        const result = await db.query('SELECT SUM(LENGTH(raw_text)) as total_chars FROM transcriptions');
        const totalChars = parseInt(result.rows[0]?.total_chars || 0);

        // Оцениваем трафик: ~1 КБ (1024 байт) на один обработанный символ
        const spentBytes = totalChars * 1024;
        
        // Задаем локальный фиксированный лимит платформы в 10 ГБ (10 * 1024 * 1024 * 1024)
        const limitBytes = 10737418240; 

        const spentMB = parseFloat((spentBytes / (1024 * 1024)).toFixed(2));
        const limitMB = parseFloat((limitBytes / (1024 * 1024)).toFixed(2));
        const percentUsed = parseFloat(((spentBytes / limitBytes) * 100).toFixed(2));

        return {
            spentBytes,
            limitBytes,
            spentMB,
            limitMB,
            percentUsed,
            source: 'local'
        };
    } catch (error) {
        console.error('[AstroProxy Local] Error calculating proxy stats:', error);
        return {
            spentBytes: 0,
            limitBytes: 10737418240,
            spentMB: 0.00,
            limitMB: 10240.00,
            percentUsed: 0.00,
            source: 'local_error'
        };
    }
};

module.exports = {
    getProxyStats
};
