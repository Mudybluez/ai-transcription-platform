const amqp = require('amqplib');

let channel;

const connectQueue = async () => {
    try {
        const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
        const connection = await amqp.connect(rabbitUrl);
        channel = await connection.createChannel();
        
        // Создаем очередь, если её нет
        await channel.assertQueue('transcription_jobs', { durable: true });
        console.log('✅ Успешное подключение к RabbitMQ');
    } catch (error) {
        console.error('❌ Ошибка подключения к RabbitMQ:', error);
        // Пробуем переподключиться через 5 секунд (полезно при старте Docker)
        setTimeout(connectQueue, 5000);
    }
};

const publishJob = async (jobData) => {
    if (!channel) {
        console.error('Канал RabbitMQ не готов');
        return false;
    }
    
    try {
        channel.sendToQueue(
            'transcription_jobs', 
            Buffer.from(JSON.stringify(jobData)),
            { persistent: true }
        );
        return true;
    } catch (error) {
        console.error('Ошибка при отправке задачи в очередь:', error);
        return false;
    }
};

module.exports = {
    connectQueue,
    publishJob
};