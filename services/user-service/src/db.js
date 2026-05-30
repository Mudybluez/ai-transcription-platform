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
        username VARCHAR(100) NOT NULL,
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

          -- 7. Создание таблицы отзывов (feedbacks)
          CREATE TABLE IF NOT EXISTS feedbacks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            rating VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- 8. Создание таблицы ответов на отзывы (feedback_replies)
          CREATE TABLE IF NOT EXISTS feedback_replies (
            id SERIAL PRIMARY KEY,
            feedback_id INTEGER REFERENCES feedbacks(id) ON DELETE CASCADE,
            admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reply_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- 9. Создание таблицы уведомлений (notifications)
          CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(100) NOT NULL,
            data JSONB NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          -- 10. Триггер готовности анализа (Analysis Ready)
          CREATE OR REPLACE FUNCTION notify_analysis_ready()
          RETURNS TRIGGER AS $$
          BEGIN
              IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
                  IF NOT EXISTS (
                      SELECT 1 FROM notifications 
                      WHERE user_id = NEW.user_id 
                        AND type = 'ANALYSIS_READY' 
                        AND (data->>'job_id')::int = NEW.id
                  ) THEN
                      INSERT INTO notifications (user_id, type, data)
                      VALUES (
                          NEW.user_id,
                          'ANALYSIS_READY',
                          json_build_object(
                              'job_id', NEW.id,
                              'file_name', NEW.file_name,
                              'message_en', 'Analysis of "' || NEW.file_name || '" is ready!',
                              'message_ru', 'Анализ файла "' || NEW.file_name || '" готов!',
                              'message_kk', '"' || NEW.file_name || '" файлының талдауы дайын!'
                          )
                      );
                  END IF;
              END IF;
              RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;

          DROP TRIGGER IF EXISTS trigger_analysis_ready ON jobs;
          CREATE TRIGGER trigger_analysis_ready
          AFTER UPDATE ON jobs
          FOR EACH ROW
          EXECUTE FUNCTION notify_analysis_ready();

          -- 11. Триггер для PG LISTEN/NOTIFY при вставке уведомлений (Live)
          CREATE OR REPLACE FUNCTION notify_new_notification()
          RETURNS TRIGGER AS $$
          BEGIN
              PERFORM pg_notify('new_notification', json_build_object(
                  'id', NEW.id,
                  'user_id', NEW.user_id,
                  'type', NEW.type,
                  'data', NEW.data,
                  'is_read', NEW.is_read,
                  'created_at', NEW.created_at
              )::text);
              RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;

          DROP TRIGGER IF EXISTS trigger_new_notification ON notifications;
          CREATE TRIGGER trigger_new_notification
          AFTER INSERT ON notifications
          FOR EACH ROW
          EXECUTE FUNCTION notify_new_notification();

          -- 12. Удаление ограничения уникальности для username
          ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
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