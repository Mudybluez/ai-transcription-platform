const { createClient } = require('redis');

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.log('❌ Ошибка Redis Client', err));
redisClient.on('connect', () => console.log('✅ Успешное подключение к Redis'));

const connectRedis = async () => {
    await redisClient.connect();
};

connectRedis();

module.exports = redisClient;