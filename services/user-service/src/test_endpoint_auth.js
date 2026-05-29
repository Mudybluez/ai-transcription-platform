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

async function runEndpointAuthTests() {
    console.log('🧪 Запуск интеграционных тестов безопасности эндпоинта GET /all...');

    let testUserId = null;
    let testAdminId = null;

    try {
        // 1. Очистка прошлых тестовых данных (если остались)
        await pool.query("DELETE FROM users WHERE email IN ('test_endpoint_user@example.com', 'test_endpoint_admin@example.com')");

        // 2. Создаем тестового стандартного пользователя
        const userRes = await pool.query(
            "INSERT INTO users (username, email, password, role, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id",
            ['test_endpoint_user', 'test_endpoint_user@example.com', 'hashed_pass_placeholder', 'Standard']
        );
        testUserId = userRes.rows[0].id;
        console.log(`✅ Создан стандартный пользователь: ID ${testUserId}`);

        // 3. Создаем тестового администратора
        const adminRes = await pool.query(
            "INSERT INTO users (username, email, password, role, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id",
            ['test_endpoint_admin', 'test_endpoint_admin@example.com', 'hashed_pass_placeholder', 'admin']
        );
        testAdminId = adminRes.rows[0].id;
        console.log(`✅ Создан администратор: ID ${testAdminId}`);

        // 4. Генерируем JWT токены
        const userToken = jwt.sign({ userId: testUserId, role: 'Standard' }, JWT_SECRET);
        const adminToken = jwt.sign({ userId: testAdminId, role: 'admin' }, JWT_SECRET);

        const targetUrl = 'http://localhost:3001/all';

        // 5. Тест 1: Запрос без токена
        console.log('📡 Тест 1: Запрос без заголовка Authorization...');
        const resNoToken = await fetch(targetUrl, {
            method: 'GET'
        });
        console.log(`   Статус ответа: ${resNoToken.status} (Ожидалось: 401)`);
        if (resNoToken.status !== 401) {
            throw new Error(`Недопустимый статус при запросе без токена: ${resNoToken.status}`);
        }
        console.log('✅ Тест 1 пройден успешно!');

        // 6. Тест 2: Запрос со стандартным токеном
        console.log('📡 Тест 2: Запрос со стандартным токеном (роль Standard)...');
        const resStandardToken = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        console.log(`   Статус ответа: ${resStandardToken.status} (Ожидалось: 403)`);
        if (resStandardToken.status !== 403) {
            throw new Error(`Недопустимый статус при запросе с ролью Standard: ${resStandardToken.status}`);
        }
        console.log('✅ Тест 2 пройден успешно!');

        // 7. Тест 3: Запрос с админским токеном
        console.log('📡 Тест 3: Запрос с административным токеном (роль admin)...');
        const resAdminToken = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        console.log(`   Статус ответа: ${resAdminToken.status} (Ожидалось: 200)`);
        if (resAdminToken.status !== 200) {
            throw new Error(`Недопустимый статус при запросе с ролью admin: ${resAdminToken.status}`);
        }
        const data = await resAdminToken.json();
        console.log(`   Получено пользователей: ${data.length}`);
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Ожидался непустой массив пользователей');
        }
        console.log('✅ Тест 3 пройден успешно!');

        console.log('\n🎉 ВСЕ ТЕСТЫ БЕЗОПАСНОСТИ ЭНДПОИНТА GET /all УСПЕШНО ПРОЙДЕНЫ!');

    } catch (err) {
        console.error('❌ ОШИБКА ПРИ ТЕСТИРОВАНИИ БЕЗОПАСНОСТИ:', err.message);
        process.exit(1);
    } finally {
        // Очищаем тестовые данные после тестов
        if (testUserId) {
            await pool.query("DELETE FROM users WHERE id = $1", [testUserId]);
        }
        if (testAdminId) {
            await pool.query("DELETE FROM users WHERE id = $1", [testAdminId]);
        }
        await pool.end();
    }
}

runEndpointAuthTests();
