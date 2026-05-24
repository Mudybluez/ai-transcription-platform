const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    host: process.env.POSTGRES_HOST || 'postgres',
    database: process.env.POSTGRES_DB || 'transcription_db',
    password: process.env.POSTGRES_PASSWORD || 'secretpassword',
    port: 5432,
});

// Инициализация таблицы пользователей
const initDB = async () => {
    const queryText = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    try {
        await pool.query(queryText);
        console.log('✅ Таблица пользователей готова');

        // Миграция схемы БД для 3-уровневой системы ролей и монетизации
        const migrations = `
          -- 1. Смена дефолтного значения роли на Standard
          ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Standard';

          -- 2. Обновление старых ролей 'user' и NULL на 'Standard'
          UPDATE users SET role = 'Standard' WHERE role = 'user' OR role IS NULL;

          -- 3. Добавление колонок подписки/монетизации (для будущего расширения)
          ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'inactive';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_customer_id VARCHAR(255);

          -- 4. Добавление колонок для верификации почты
          ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
          ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

          -- 5. Обновление старых пользователей до верифицированных, чтобы не заблокировать их
          UPDATE users SET is_verified = TRUE WHERE is_verified IS NULL;

          -- 6. Добавление колонок для кастомных запросов и блокировки (модерации)
          ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_requests INTEGER DEFAULT 0;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP DEFAULT NULL;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS is_permanently_banned BOOLEAN DEFAULT FALSE;
        `;
        await pool.query(migrations);
        console.log('✅ Схема базы данных пользователей успешно обновлена');
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err);
    }
};

initDB();

module.exports = {
    query: (text, params) => pool.query(text, params),
};