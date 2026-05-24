import os
import time
import json
import pika
import requests
from db import init_db, update_job_status, save_result
from ai_core import transcribe_audio, analyze_content, download_youtube_audio, get_youtube_transcript

# Инициализируем БД при старте
init_db()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

def connect_to_rabbitmq():
    """Подключение к RabbitMQ с механизмом повторных попыток (для старта Docker)"""
    # Добавляем ?heartbeat=0 для отключения таймаутов простоя при длительном распознавании Whisper / ИИ анализе
    url = RABBITMQ_URL
    if "heartbeat" in url:
        import re
        url = re.sub(r'([\?&])heartbeat=\d+', r'\1heartbeat=0', url)
    else:
        url += ("&" if "?" in url else "?") + "heartbeat=0"

    while True:
        try:
            connection = pika.BlockingConnection(pika.URLParameters(url))
            channel = connection.channel()
            channel.queue_declare(queue='transcription_jobs', durable=True)
            print("Успешное подключение к RabbitMQ (Heartbeat отключен для предотвращения StreamLostError)")
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
    
    try:
        update_job_status(job_id, "PROCESSING")
        
        raw_text = None
        if is_youtube:
            print("📺 Попытка получить субтитры напрямую (гибридная стратегия)...")
            raw_text = get_youtube_transcript(file_path, language=language)
            
        if raw_text:
            print("🚀 Текст успешно получен напрямую из субтитров. Пропускаем Whisper.")
        else:
            if is_youtube:
                print("📺 Скачивание аудио с YouTube...")
                audio_to_process = download_youtube_audio(file_path)
            else:
                audio_to_process = file_path

            print(f"Начинаем транскрибацию...")
            raw_text = transcribe_audio(audio_to_process, language=language)
            print(f"Транскрибация завершена. Длина: {len(raw_text)} символов.")
            if is_youtube and os.path.exists(audio_to_process):
                os.remove(audio_to_process)

        print(f"Анализ в Gemini (мультиязычный)...")
        
        # 2. Анализируем контент (теперь сразу на 3 языках)
        analysis_data = analyze_content(raw_text)
        analysis_data['language'] = language
        
        # 3. Сохраняем результат
        save_result(job_id, user_id, raw_text, analysis_data)
        update_job_status(job_id, "COMPLETED")

        # 3.5. Создаем уведомление о готовности анализа и шлем в Gateway
        file_name = job_data.get('fileName', 'Unknown')
        try:
            from db import create_analysis_ready_notification
            notif = create_analysis_ready_notification(job_id, user_id, file_name)
            if notif:
                # notif: (id, user_id, type, data, is_read, created_at)
                gateway_payload = {
                    'userId': user_id,
                    'notification': {
                        'id': notif[0],
                        'user_id': notif[1],
                        'type': notif[2],
                        'data': notif[3],
                        'is_read': notif[4],
                        'created_at': str(notif[5])
                    }
                }
                # Шлем в Gateway
                for base_url in ["http://api-gateway:3000", "http://localhost:3000"]:
                    try:
                        requests.post(f"{base_url}/internal/notify", json=gateway_payload, timeout=2)
                        print(f"📡 Уведомление о готовности анализа отправлено в Gateway ({base_url})")
                        break
                    except Exception:
                        pass
        except Exception as ne:
            print(f"Ошибка при создании уведомления о готовности анализа: {ne}")

        # 4. Отправляем данные в mindmap-service, если они есть
        if "mind_map" in analysis_data:
            try:
                mindmap_service_url = os.getenv("MINDMAP_SERVICE_URL", "http://mindmap-service:3005/mindmap/save")
                mindmap_data = {
                    "transcription_id": str(job_id),
                    "nodes": analysis_data["mind_map"].get("nodes", []),
                    "links": analysis_data["mind_map"].get("links", [])
                }
                requests.post(mindmap_service_url, json=mindmap_data, timeout=5)
                print(f"MindMap для задачи {job_id} отправлен в сервис.")
            except Exception as me:
                print(f"Ошибка отправки MindMap: {me}")

        print(f"Задача {job_id} успешно выполнена и сохранена!")
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as e:
        print(f"ОШИБКА ПРИ ОБРАБОТКЕ ЗАДАЧИ {job_id}: {str(e)}")
        update_job_status(job_id, f"FAILED: {str(e)[:40]}")
        ch.basic_ack(delivery_tag=method.delivery_tag)

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