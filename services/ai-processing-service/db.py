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