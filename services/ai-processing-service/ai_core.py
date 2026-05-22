import os
import whisper
import google.generativeai as genai
import json
import tempfile
import yt_dlp
import re
import json_repair
import time

print("⏳ Загрузка модели Whisper (base)...")
whisper_model = whisper.load_model("base")
print("✅ Модель Whisper загружена")

gemini_api_key = os.getenv("GEMINI_API_KEY")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
else:
    print("⚠️ ВНИМАНИЕ: GEMINI_API_KEY не установлен!")

def download_youtube_audio(url):
    """Скачивает аудио с YouTube во временную папку"""
    temp_dir = tempfile.mkdtemp()
    audio_path = os.path.join(temp_dir, 'audio')
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': audio_path,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
        }],
        'quiet': True
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)
        return audio_path + '.wav'
    except Exception as e:
        raise Exception(f"Ошибка загрузки YouTube: {str(e)}")
    
def transcribe_audio(file_path, language='ru'):
    """Транскрибирует аудио/видео файл с помощью Whisper с указанием языка"""
    try:
        # Нормализуем код языка (например, 'en-US' -> 'en', 'ru-RU' -> 'ru')
        lang_code = language.split('-')[0].lower()
        
        # Whisper ожидает двухбуквенный код. Если код не поддерживается, он сам попытается определить
        # или выдаст ошибку, которую мы перехватим.
        # Для Kazakh (kk) Whisper base может быть слабоват, но код 'kk' поддерживается.
        
        print(f"🎙️ Запуск транскрибации Whisper (язык: {lang_code})...")
        result = whisper_model.transcribe(file_path, language=lang_code)
        return result["text"]
    except Exception as e:
        raise Exception(f"Ошибка транскрипции Whisper: {str(e)}")

def analyze_content(text):
    """Отправляет текст в Gemini для глубокого мультиязычного анализа (RU, EN, KK)"""
    if not os.environ.get("GEMINI_API_KEY"):
         raise Exception("API ключ Gemini отсутствует")

    if len(text) > 15000:
        print(f"⚠️ Текст слишком длинный ({len(text)}). Обрезаем для Gemini до 15000 символов.")
        text = text[:15000] 

    model = genai.GenerativeModel("models/gemini-2.5-flash")
    
    prompt = f"""
    ТВОЯ РОЛЬ: Ты — эксперт-аналитик и профессиональный переводчик. 
    ТВОЯ ЗАДАЧА: Проанализировать предоставленный текст и выдать структурированный результат ОДНОВРЕМЕННО на трех языках: РУССКОМ (ru), АНГЛИЙСКОМ (en) и КАЗАХСКОМ (kk).

    КРИТИЧЕСКОЕ ТРЕБОВАНИЕ К СТРУКТУРЕ:
    Для каждого текстового поля (кроме ключей JSON) ты должен вернуть ОБЪЕКТ с ключами "ru", "en", "kk".
    Пример: "title": {{"ru": "Название", "en": "Title", "kk": "Атауы"}}

    ПРАВИЛА ФОРМАТИРОВАНИЯ (для полей summary и detailed_analysis):
    1. Используй стандартный Markdown.
    2. ОБЯЗАТЕЛЬНО используй Markdown-таблицы. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать HTML для таблиц.
    3. ДОБАВЬ 1-2 иллюстрации: ![desc](https://loremflickr.com/800/400/KEYWORD)

    СТРУКТУРА JSON:
    {{
        "title": {{"ru": "...", "en": "...", "kk": "..."}},
        "summary": {{"ru": "...", "en": "...", "kk": "..."}},
        "key_topics": [
            {{
                "title": {{"ru": "...", "en": "...", "kk": "..."}},
                "key_points": {{
                    "ru": ["...", "..."],
                    "en": ["...", "..."],
                    "kk": ["...", "..."]
                }},
                "relevance": {{"ru": "...", "en": "...", "kk": "..."}}
            }}
        ],
        "detailed_analysis": {{"ru": "...", "en": "...", "kk": "..."}},
        "takeaways": {{
            "ru": ["...", "..."],
            "en": ["...", "..."],
            "kk": ["...", "..."]
        }},
        "flashcards": [
            {{
                "question": {{"ru": "...", "en": "...", "kk": "..."}},
                "answer": {{"ru": "...", "en": "...", "kk": "..."}}
            }}
        ],
        "quiz": [
            {{
                "question": {{"ru": "...", "en": "...", "kk": "..."}},
                "options": {{
                    "ru": ["1", "2", "3", "4"],
                    "en": ["1", "2", "3", "4"],
                    "kk": ["1", "2", "3", "4"]
                }},
                "correct_answer": {{"ru": "...", "en": "...", "kk": "..."}}
            }}
        ]
    }}

    ТРЕБОВАНИЯ:
    1. Минимум 6 flashcards.
    2. РОВНО 10 вопросов quiz.
    3. Все переводы должны быть качественными и адаптированными.
    4. Верни СТРОГО валидный JSON.

    ТЕКСТ ДЛЯ АНАЛИЗА:
    {text}
    """

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            clean_text = response.text.strip()
            
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
                
            clean_text = clean_text.strip()

            # Убиваем слеши и очищаем текст
            clean_text = clean_text.replace('\\\n', '\n').replace('\\ ', ' ')
            clean_text = re.sub(r'\\([^"\\/bfnrtu])', r'\1', clean_text)
            
            return json_repair.loads(clean_text)

        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "Quota exceeded" in error_msg:
                if attempt < max_retries - 1:
                    print(f"Лимит API! Ждем 35 секунд... ({attempt + 1}/{max_retries})")
                    time.sleep(35)
                    continue 
            
            error_context = clean_text[-300:] if 'clean_text' in locals() else ""
            print("\n========================================")
            print("❌ ОШИБКА ПАРСИНГА:")
            print(error_context)
            print("========================================\n")
            raise Exception(f"Сбой ИИ: {error_msg}")
            
    raise Exception("Не удалось получить ответ от ИИ после 3 попыток.")
