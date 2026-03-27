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
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err);
    }
};

initDB();

module.exports = {
    query: (text, params) => pool.query(text, params),
};