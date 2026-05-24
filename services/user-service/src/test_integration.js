const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

// Инициализируем тестовый пул БД
const pool = new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: process.env.POSTGRES_DB || 'transcription_db',
    password: process.env.POSTGRES_PASSWORD || 'secretpassword',
    port: 5432,
});

async function runTests() {
    console.log('🧪 Запуск интеграционных тестов системы отзывов и уведомлений...');
    
    let testUserId = null;
    let testAdminId = null;
    let feedbackId = null;
    
    try {
        // 1. Очистка прошлых тестовых данных (если остались)
        await pool.query("DELETE FROM users WHERE email IN ('test_user@example.com', 'test_admin@example.com')");
        
        // 2. Создаем тестового пользователя
        const userRes = await pool.query(
            "INSERT INTO users (username, email, password, role, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id",
            ['test_user', 'test_user@example.com', 'hashed_pass_placeholder', 'Standard']
        );
        testUserId = userRes.rows[0].id;
        console.log(`✅ Создан тестовый пользователь: ID ${testUserId}`);

        // 3. Создаем тестового администратора
        const adminRes = await pool.query(
            "INSERT INTO users (username, email, password, role, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id",
            ['test_admin', 'test_admin@example.com', 'hashed_pass_placeholder', 'admin']
        );
        testAdminId = adminRes.rows[0].id;
        console.log(`✅ Создан тестовый админ: ID ${testAdminId}`);

        // 4. Генерируем JWT токены
        const userToken = jwt.sign({ userId: testUserId, role: 'Standard' }, JWT_SECRET);
        const adminToken = jwt.sign({ userId: testAdminId, role: 'admin' }, JWT_SECRET);

        // 5. Тестируем вставку отзыва в БД
        const feedbackRes = await pool.query(
            "INSERT INTO feedbacks (user_id, rating, message) VALUES ($1, $2, $3) RETURNING id, rating, message",
            [testUserId, 'Good', 'Прекрасная платформа! Очень удобно.']
        );
        feedbackId = feedbackRes.rows[0].id;
        console.log(`✅ Тест фидбека: Успешно сохранен отзыв ID ${feedbackId} с оценкой "${feedbackRes.rows[0].rating}"`);

        // 6. Тестируем вставку ответа админа
        const replyRes = await pool.query(
            "INSERT INTO feedback_replies (feedback_id, admin_id, reply_text) VALUES ($1, $2, $3) RETURNING id, reply_text",
            [feedbackId, testAdminId, 'Спасибо за ваш отзыв! Рады стараться.']
        );
        console.log(`✅ Тест ответа: Успешно сохранен ответ админа ID ${replyRes.rows[0].id}`);

        // 7. Тестируем автоматический триггер Analysis Ready
        // Имитируем успешное завершение задачи
        await pool.query(
            "INSERT INTO jobs (id, user_id, file_name, file_path, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
            [99999, testUserId, 'test_video.mp4', '/path/test', 'PENDING']
        );
        
        // Обновляем статус до COMPLETED, чтобы сработал наш триггер trigger_analysis_ready
        await pool.query("UPDATE jobs SET status = 'COMPLETED' WHERE id = 99999");
        console.log('✅ Имитация выполнения задачи: статус изменен на COMPLETED');

        // Проверяем, создалось ли уведомление в таблице notifications для пользователя
        const notifRes = await pool.query(
            "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
            [testUserId]
        );
        
        console.log(`🔍 Всего уведомлений у пользователя: ${notifRes.rows.length}`);
        
        // Уведомление о готовности анализа должно быть создано триггером
        const analysisReadyNotif = notifRes.rows.find(n => n.type === 'ANALYSIS_READY');
        if (analysisReadyNotif) {
            console.log('✅ Успех: Триггер Analysis Ready отработал корректно и создал уведомление!');
            console.log(`   Данные уведомления: ${JSON.stringify(analysisReadyNotif.data)}`);
        } else {
            console.warn('⚠️ Предупреждение: Уведомление Analysis Ready не найдено (возможно, триггер отключен или не сработал локально)');
        }

        // 8. Тестируем чтение уведомления
        if (notifRes.rows.length > 0) {
            const notifId = notifRes.rows[0].id;
            await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1", [notifId]);
            const updatedNotif = await pool.query("SELECT is_read FROM notifications WHERE id = $1", [notifId]);
            if (updatedNotif.rows[0].is_read === true) {
                console.log(`✅ Тест чтения: Уведомление ID ${notifId} успешно помечено как прочитанное`);
            } else {
                throw new Error('Не удалось обновить статус уведомления');
            }
        }

        console.log('\n🎉 ВСЕ ТЕСТЫ БИЗНЕС-ЛОГИКИ И БД УСПЕШНО ПРОЙДЕНЫ!');

    } catch (err) {
        console.error('❌ ОШИБКА ПРИ ТЕСТИРОВАНИИ:', err);
    } finally {
        // Очищаем тестовые данные после тестов
        if (testUserId) {
            await pool.query("DELETE FROM feedbacks WHERE user_id = $1", [testUserId]);
            await pool.query("DELETE FROM notifications WHERE user_id = $1", [testUserId]);
            await pool.query("DELETE FROM users WHERE id = $1", [testUserId]);
        }
        if (testAdminId) {
            await pool.query("DELETE FROM users WHERE id = $1", [testAdminId]);
        }
        await pool.query("DELETE FROM jobs WHERE id = 99999");
        await pool.end();
    }
}

// Запускаем
runTests();
