const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    host: process.env.POSTGRES_HOST || 'postgres',
    database: process.env.POSTGRES_DB || 'transcription_db',
    password: process.env.POSTGRES_PASSWORD || 'secretpassword',
    port: 5432,
});

const initDB = async () => {
    const queryText = `
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    try {
        await pool.query(queryText);
        console.log('✅ Таблица jobs (задач) готова');
    } catch (err) {
        console.error('❌ Ошибка инициализации БД (jobs):', err);
    }
};

initDB();

module.exports = {
    query: (text, params) => pool.query(text, params),
};