const { Pool } = require('pg');

// Инициализируем тестовый пул БД
const pool = new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: process.env.POSTGRES_DB || 'transcription_db',
    password: process.env.POSTGRES_PASSWORD || 'secretpassword',
    port: 5432,
});

// Регулярное выражение для валидации никнейма
const usernameRegex = /^[a-zA-Z0-9\-_@]+$/;

function validateUsername(username) {
    return !!username && usernameRegex.test(username) && username.length < 13;
}

async function runUsernameValidationTests() {
    console.log('🧪 Запуск тестов валидации и повторяемости никнеймов...');

    // 1. Тестирование валидации регулярного выражения (Unit тесты)
    console.log('\n--- 1. Тесты валидации формата никнейма (regex) ---');
    
    const testCases = [
        { username: 'john_doe', expected: true, desc: 'Латиница с подчеркиванием' },
        { username: 'admin-123', expected: true, desc: 'Латиница с цифрами и дефисом' },
        { username: 'user@name', expected: true, desc: 'Латиница с символом @' },
        { username: 'SimpleName', expected: true, desc: 'Просто латиница разного регистра' },
        { username: 'john_doe_long', expected: false, desc: 'Длина 13 символов (не меньше 13)' },
        { username: 'verylongusername', expected: false, desc: 'Длина 16 символов (не меньше 13)' },
        { username: 'john doe', expected: false, desc: 'Наличие пробела (не одно слово)' },
        { username: 'иван_иванов', expected: false, desc: 'Кириллица' },
        { username: 'user.name', expected: false, desc: 'Неразрешенный символ .' },
        { username: 'user#1', expected: false, desc: 'Неразрешенный символ #' },
        { username: '', expected: false, desc: 'Пустая строка' },
        { username: null, expected: false, desc: 'null значение' }
    ];

    let unitFailed = false;
    for (const tc of testCases) {
        const result = validateUsername(tc.username);
        if (result === tc.expected) {
            console.log(`✅ Валидация для "${tc.username}" (${tc.desc}) -> ${result} (как и ожидалось)`);
        } else {
            console.error(`❌ Ошибка валидации для "${tc.username}" (${tc.desc}) -> получено: ${result}, ожидалось: ${tc.expected}`);
            unitFailed = true;
        }
    }

    if (unitFailed) {
        console.error('❌ Юнит-тесты валидации провалены!');
        process.exit(1);
    }
    console.log('✅ Все юнит-тесты валидации формата пройдены успешно!');

    // 2. Тестирование базы данных на повторяемость никнеймов (Integration тесты)
    console.log('\n--- 2. Тесты базы данных на повторяемость никнеймов ---');
    try {
        // Очистка старых тестов
        await pool.query("DELETE FROM users WHERE email IN ('test_dup1@example.com', 'test_dup2@example.com')");

        console.log('📡 Вставка первого пользователя с никнеймом "dup_nick"...');
        const user1 = await pool.query(
            "INSERT INTO users (username, email, password, role, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id",
            ['dup_nick', 'test_dup1@example.com', 'hashed_pass_placeholder', 'Standard']
        );
        console.log(`   Успешно! ID: ${user1.rows[0].id}`);

        console.log('📡 Вставка второго пользователя с ТЕМ ЖЕ никнеймом "dup_nick"...');
        const user2 = await pool.query(
            "INSERT INTO users (username, email, password, role, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id",
            ['dup_nick', 'test_dup2@example.com', 'hashed_pass_placeholder', 'Standard']
        );
        console.log(`   Успешно! ID: ${user2.rows[0].id}`);
        console.log('✅ База данных успешно позволила сохранить дублирующийся никнейм!');

    } catch (err) {
        console.error('❌ Ошибка интеграционного теста базы данных:', err.message);
        process.exit(1);
    } finally {
        // Очистка данных
        await pool.query("DELETE FROM users WHERE email IN ('test_dup1@example.com', 'test_dup2@example.com')");
        await pool.end();
    }

    console.log('\n🎉 ВСЕ ТЕСТЫ ВАЛИДАЦИИ И ПОВТОРЯЕМОСТИ НИКНЕЙМОВ ПРОЙДЕНЫ УСПЕШНО!');
}

runUsernameValidationTests();
