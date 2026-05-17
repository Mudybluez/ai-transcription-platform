import os
import time
import json
import pika
from db import init_db, update_job_status, save_result
from ai_core import transcribe_audio, analyze_content, download_youtube_audio

# Инициализируем БД при старте
init_db()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

def connect_to_rabbitmq():
    """Подключение к RabbitMQ с механизмом повторных попыток (для старта Docker)"""
    while True:
        try:
            connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
            channel = connection.channel()
            channel.queue_declare(queue='transcription_jobs', durable=True)
            print("Успешное подключение к RabbitMQ")
            return connection, channel
        except Exception as e:
            print(f"Ожидание RabbitMQ... Ошибка: {e}")
            time.sleep(5)

def callback(ch, method, properties, body):
    job_data = json.loads(body)
    job_id = job_data['jobId']
    user_id = job_data['userId']
    file_path = job_data['filePath']
    is_youtube = job_data.get('isYoutube', False)

    # 1. Достаем язык
    language = job_data.get('language', 'ru')
    
    # Оставили один чистый и красивый лог
    print(f"\nПолучена задача ID: {job_id} для файла: {job_data.get('fileName', 'Unknown')} (Язык: {language})")
    
    # СРАЗУ говорим RabbitMQ "Я взял задачу"
    ch.basic_ack(delivery_tag=method.delivery_tag)
    
    try:
        update_job_status(job_id, "PROCESSING")
        
        if is_youtube:
            print("📺 Скачивание аудио с YouTube...")
            audio_to_process = download_youtube_audio(file_path)
        else:
            audio_to_process = file_path

        print(f"Начинаем транскрибацию...")
        raw_text = transcribe_audio(audio_to_process, language)
        print(f"Транскрибация завершена. Длина: {len(raw_text)} символов.")
        if is_youtube and os.path.exists(audio_to_process):
            os.remove(audio_to_process)

        print(f"Анализ в Gemini на языке: {language}...")
        
        # 2. Передаем переменную language в ядро ИИ!
        analysis_data = analyze_content(raw_text, language)
        
        # 3. Сохраняем язык в JSON для кеширования
        if isinstance(analysis_data, dict):
            analysis_data['language'] = language
        
        save_result(job_id, user_id, raw_text, analysis_data)
        update_job_status(job_id, "COMPLETED")
        print(f"Задача {job_id} успешно выполнена и сохранена!")

    except Exception as e:
        print(f"ОШИБКА ПРИ ОБРАБОТКЕ ЗАДАЧИ {job_id}: {str(e)}")
        update_job_status(job_id, f"FAILED: {str(e)[:40]}")
        # Здесь ch.basic_ack БОЛЬШЕ НЕ НУЖЕН, мы сделали его в начале!

if __name__ == '__main__':
    connection, channel = connect_to_rabbitmq()
    # Указываем RabbitMQ не давать воркеру больше 1 задачи одновременно (Fair dispatch)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue='transcription_jobs', on_message_callback=callback)
    
    print('Воркер запущен и ожидает задачи...')
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        channel.stop_consuming()
        connection.close()