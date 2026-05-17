const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'admin',
    host: process.env.POSTGRES_HOST || 'postgres',
    database: process.env.POSTGRES_DB || 'transcription_db',
    password: process.env.POSTGRES_PASSWORD || 'secretpassword',
    port: 5432,
});

const initDB = async () => {
    const jobsTable = `
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
    const transcriptionsTable = `
      CREATE TABLE IF NOT EXISTS transcriptions (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        structured_analysis JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    try {
        await pool.query(jobsTable);
        await pool.query(transcriptionsTable);
        console.log('✅ Таблицы БД (jobs, transcriptions) готовы');
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err);
    }
};

initDB();

module.exports = {
    query: (text, params) => pool.query(text, params),
};