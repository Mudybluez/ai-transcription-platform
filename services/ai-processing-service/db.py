import os
import psycopg2
from psycopg2.extras import RealDictCursor
import json

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        database=os.getenv("POSTGRES_DB", "transcription_db"),
        user=os.getenv("POSTGRES_USER", "admin"),
        password=os.getenv("POSTGRES_PASSWORD", "secretpassword")
    )

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    # Создаем таблицу для хранения результатов транскрипции и аналитики
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transcriptions (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            raw_text TEXT NOT NULL,
            structured_analysis JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ Таблица transcriptions готова")

def update_job_status(job_id, status):
    """Обновляет статус задачи (PROCESSING, COMPLETED, FAILED)"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE jobs SET status = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
        (status, job_id)
    )
    conn.commit()
    cur.close()
    conn.close()

def save_result(job_id, user_id, raw_text, analysis_json):
    """Сохраняет финальный результат в БД"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO transcriptions (job_id, user_id, raw_text, structured_analysis)
        VALUES (%s, %s, %s, %s)
        """,
        (job_id, user_id, raw_text, json.dumps(analysis_json, ensure_ascii=False))
    )
    conn.commit()
    cur.close()
    conn.close()

def create_analysis_ready_notification(job_id, user_id, file_name):
    """Создает запись уведомления о готовности анализа в таблице notifications"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Проверяем, существует ли уже уведомление
    cur.execute(
        "SELECT 1 FROM notifications WHERE user_id = %s AND type = 'ANALYSIS_READY' AND (data->>'job_id')::int = %s",
        (user_id, job_id)
    )
    if cur.fetchone() is None:
        notif_data = {
            'job_id': job_id,
            'file_name': file_name,
            'message_en': f'Analysis of "{file_name}" is ready!',
            'message_ru': f'Анализ файла "{file_name}" готов!',
            'message_kk': f'"{file_name}" файлының талдауы дайын!'
        }
        cur.execute(
            """
            INSERT INTO notifications (user_id, type, data) 
            VALUES (%s, %s, %s) 
            RETURNING id, user_id, type, data, is_read, created_at
            """,
            (user_id, 'ANALYSIS_READY', json.dumps(notif_data, ensure_ascii=False))
        )
        new_notif = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return new_notif
    
    cur.close()
    conn.close()
    return None