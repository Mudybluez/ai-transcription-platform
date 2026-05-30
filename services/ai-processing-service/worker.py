import os
import time
import json
import pika
import requests
from db import init_db, update_job_status, save_result
from ai_core import (
    transcribe_audio, analyze_content, download_youtube_audio, 
    get_youtube_transcript, get_youtube_metadata, extract_youtube_video_id,
    is_video_file, get_video_duration, extract_video_screenshot, 
    GeminiRateLimitError
)

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

def append_video_frames_to_analysis(analysis_data, job_id):
    """Добавляет ссылки на извлеченные кадры видеоряда в конец саммари для каждого языка"""
    langs = {
        'ru': {
            'title': "\n\n### 📸 Кадры из видеоряда лекции:",
            'cap1': "\n*Рис. 1: Вводная часть и начало лекции*",
            'cap2': "\n*Рис. 2: Разбор ключевых вопросов и темы*",
            'cap3': "\n*Рис. 3: Заключение и финальные выводы*"
        },
        'en': {
            'title': "\n\n### 📸 Video Timeline Frames:",
            'cap1': "\n*Figure 1: Introduction and initial lecture section*",
            'cap2': "\n*Figure 2: Core subject analysis and discussion*",
            'cap3': "\n*Figure 3: Summary and final takeaways*"
        },
        'kk': {
            'title': "\n\n### 📸 Бейнебаяннан алынған кадрлар:",
            'cap1': "\n*1-сурет: Бейнебаянның басы және кіріспе бөлімі*",
            'cap2': "\n*2-сурет: Негізгі тақырыпты талдау сәті*",
            'cap3': "\n*3-сурет: Қорытынды және маңызды тұжырымдар*"
        }
    }

    for lang, texts in langs.items():
        if lang in analysis_data.get('summary', {}):
            img1 = f"\n![Video Frame 1](/api/uploads/screenshot_{job_id}_1.jpg)"
            img2 = f"\n![Video Frame 2](/api/uploads/screenshot_{job_id}_2.jpg)"
            img3 = f"\n![Video Frame 3](/api/uploads/screenshot_{job_id}_3.jpg)"
            
            frames_block = f"{texts['title']}{img1}{texts['cap1']}{img2}{texts['cap2']}{img3}{texts['cap3']}\n"
            analysis_data['summary'][lang] = analysis_data['summary'][lang] + frames_block

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

        # 1.5. Получаем метаданные YouTube (название и описание) для лучшего качества анализа ИИ
        raw_text_for_analysis = raw_text
        if is_youtube:
            try:
                metadata = get_youtube_metadata(file_path)
                if metadata:
                    title = metadata.get('title', 'Unknown')
                    description = metadata.get('description', '')
                    metadata_prefix = f"--- YOUTUBE VIDEO CONTEXT ---\nTitle: {title}\nDescription:\n{description}\n------------------------------\n\n"
                    raw_text_for_analysis = metadata_prefix + raw_text
                    print(f"📌 Метаданные YouTube добавлены к анализу. Название: '{title}'")
            except Exception as me:
                print(f"⚠️ Не удалось получить/добавить метаданные YouTube: {me}")

        print(f"Анализ в Gemini (мультиязычный)...")
        
        # 2. Анализируем контент (теперь сразу на 3 языках)
        analysis_data = analyze_content(raw_text_for_analysis)
        analysis_data['language'] = language

        # 2.5. Видеоряд / Скриншоты для видеофайлов и YouTube
        screenshot_url = None
        if is_youtube:
            # Получаем ID видео
            youtube_id = extract_youtube_video_id(file_path)
            if youtube_id:
                screenshot_url = f"https://img.youtube.com/vi/{youtube_id}/maxresdefault.jpg"
                print(f"📺 Для YouTube видео используется обложка: {screenshot_url}")
        elif is_video_file(file_path):
            print("🎬 Обнаружен локальный видеофайл. Запуск извлечения кадров...")
            try:
                # Извлекаем длительность
                duration = get_video_duration(file_path)
                print(f"⏱️ Длительность видео: {duration} секунд.")
                
                # Определяем временные метки
                if duration and duration > 5.0:
                    t_main = max(1.0, duration * 0.05) # Главная обложка на 5%
                    t1 = max(2.0, duration * 0.15)
                    t2 = duration * 0.5
                    t3 = duration * 0.8
                else:
                    t_main, t1, t2, t3 = 1.0, 2.0, 3.0, 4.0
                    
                # Папка для скриншотов
                uploads_dir = "/usr/src/app/uploads"
                
                # Извлекаем главную обложку
                main_path = os.path.join(uploads_dir, f"screenshot_{job_id}_main.jpg")
                if extract_video_screenshot(file_path, main_path, t_main):
                    screenshot_url = f"/api/uploads/screenshot_{job_id}_main.jpg"
                    print(f"✅ Главная обложка извлечена: {screenshot_url}")
                    
                # Извлекаем дополнительные 3 кадра для тела анализа
                path1 = os.path.join(uploads_dir, f"screenshot_{job_id}_1.jpg")
                path2 = os.path.join(uploads_dir, f"screenshot_{job_id}_2.jpg")
                path3 = os.path.join(uploads_dir, f"screenshot_{job_id}_3.jpg")
                
                ext1 = extract_video_screenshot(file_path, path1, t1)
                ext2 = extract_video_screenshot(file_path, path2, t2)
                ext3 = extract_video_screenshot(file_path, path3, t3)
                
                if ext1 and ext2 and ext3:
                    print("✅ Все 3 кадра видеоряда успешно извлечены!")
                    # Встраиваем кадры в анализ
                    append_video_frames_to_analysis(analysis_data, job_id)
                else:
                    print("⚠️ Некоторые кадры видеоряда не удалось извлечь.")
            except Exception as ve:
                print(f"⚠️ Ошибка при обработке видеоряда: {ve}")
                
        if screenshot_url:
            analysis_data['video_screenshot'] = screenshot_url
        
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

    except GeminiRateLimitError as e:
        retry_count = job_data.get('retry_count', 0)
        print(f"⚠️ [Rate Limit] Поймана ошибка лимита запросов ИИ на задаче {job_id} (Попытка {retry_count}/5): {e}")
        if retry_count < 5:
            # Рассчитываем экспоненциальную задержку: 30, 60, 120, 240, 480 секунд
            wait_time = (2 ** retry_count) * 30
            next_attempt = retry_count + 1
            print(f"⏳ Ожидание {wait_time} секунд перед повторной отправкой в очередь (Попытка {next_attempt}/5)...")
            
            # Обновляем статус в БД на RETRYING
            update_job_status(job_id, f"RETRYING (Attempt {next_attempt}/5)")
            
            # Спим в воркере
            time.sleep(wait_time)
            
            # Переопубликовываем задачу обратно в RabbitMQ с увеличенным retry_count
            job_data['retry_count'] = next_attempt
            try:
                ch.basic_publish(
                    exchange='',
                    routing_key='transcription_jobs',
                    body=json.dumps(job_data, ensure_ascii=False),
                    properties=pika.BasicProperties(
                        delivery_mode=2, # make message persistent
                    )
                )
                print(f"🔁 Задача {job_id} успешно переотправлена в очередь.")
            except Exception as pe:
                print(f"❌ Не удалось переопубликовать задачу {job_id} в RabbitMQ: {pe}")
            
            ch.basic_ack(delivery_tag=method.delivery_tag)
        else:
            print(f"❌ Превышено максимальное количество попыток ({retry_count}) для задачи {job_id}.")
            update_job_status(job_id, "FAILED: Превышен лимит попыток ИИ (429)")
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