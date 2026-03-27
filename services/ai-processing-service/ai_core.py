import os
import whisper
import google.generativeai as genai
import json
import tempfile
import yt_dlp
import re

# Загружаем базовую модель Whisper один раз при старте сервиса
print("⏳ Загрузка модели Whisper (base)...")
whisper_model = whisper.load_model("base")
print("✅ Модель Whisper загружена")

# Настраиваем API ключ Gemini
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
    
def transcribe_audio(file_path):
    """Транскрибирует аудио/видео файл с помощью Whisper"""
    try:
        result = whisper_model.transcribe(file_path)
        return result["text"]
    except Exception as e:
        raise Exception(f"Ошибка транскрипции Whisper: {str(e)}")

def analyze_content(text):
    """Отправляет текст в Gemini для глубокого структурированного анализа"""
    if not gemini_api_key:
         raise Exception("API ключ Gemini отсутствует")

    # Лимит для стабильной работы
    if len(text) > 15000:
        print(f"⚠️ Текст слишком длинный ({len(text)}). Обрезаем для Gemini до 15000 символов.")
        text = text[:15000]

    model = genai.GenerativeModel("models/gemini-2.5-flash")
    
    prompt = f"""
    ПРОФЕССИОНАЛЬНЫЙ И ГЛУБОКИЙ АНАЛИЗ УЧЕБНОГО КОНТЕНТА

    Проанализируй предоставленный текст лекции/видео и верни ответ СТРОГО В ФОРМАТЕ JSON. 
    Никакого дополнительного текста до или после JSON.

    ВАЖНЫЕ ПРАВИЛА ФОРМАТИРОВАНИЯ (MARKDOWN):
    1. В полях 'summary' и 'detailed_analysis' используй Markdown-разметку.
    2. Выделяй важные термины **жирным шрифтом**.
    3. ОБЯЗАТЕЛЬНО используй Markdown-таблицы, если в тексте есть перечисления свойств, сравнения, хронология или данные (минимум 1 таблица на анализ).
    4. ДОБАВЬ 1-2 контекстные иллюстрации для красоты. 
    Вставляй их в текст Markdown СТРОГО в таком формате: 
    ![описание](https://loremflickr.com/800/400/KEYWORD)
    КРИТИЧЕСКИ ВАЖНО: Вместо KEYWORD напиши 1-2 английских слова, отражающих суть текущего раздела. Если слов несколько, разделяй их запятой, БЕЗ ПРОБЕЛОВ!
    Правильный пример: ![Laboratory](https://loremflickr.com/800/400/chemistry,lab)
    Неправильный пример: ![Error](https://loremflickr.com/800/400/chemistry lab)
    
    Структура JSON должна быть следующей (заполни все поля максимально подробно):
    {{
        "summary": "Детальное резюме контента (несколько абзацев)",
        "key_topics": [
            {{
                "title": "Название темы",
                "key_points": ["Детальный пункт 1", "Детальный пункт 2"],
                "relevance": "Почему это важно знать"
            }}
        ],
        "detailed_analysis": ["Детальный разбор всего материала в формате Markdown. Используй заголовки (##), списки (-), ТАБЛИЦЫ и картинки. Сделай его максимально удобным для чтения.",
        "takeaways": ["Практический вывод 1", "Практический вывод 2"],
        "additional_info":[ 
            {{
                "interesting_facts": ["Интересный факт из текста"],
                "statistics": ["Статистические данные или цифры из текста (если есть)"],
                "quotes": ["Важная цитата"],
                "further_reading": ["Темы для дальнейшего самостоятельного изучения"]
            }}
        ],
        "flashcards": [
            {{
                "question": "Вопрос для карточки (термин или концепция)",
                "answer": "Краткий и понятный ответ"
            }}
        ],
        "quiz": [
            {{
                "question": "Текстовый вопрос для проверки знаний",
                "options": ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"],
                "correct_answer": "Правильный вариант ответа (должен точно совпадать с одним из options)"
            }}
        ]
    }}

    ВАЖНЫЕ ПРАВИЛА:
    1. Сгенерируй минимум 6 карточек (flashcards).
    2. ОБЯЗАТЕЛЬНО сгенерируй РОВНО 10 тестовых вопросов (quiz).
    3. Для вопросов теста (quiz) ОБЯЗАТЕЛЬНО рандомизируй расположение правильного ответа (он не должен всегда быть первым или вторым в массиве options).
    4. Анализ должен быть глубоким, профессиональным и академичным.

    ТЕКСТ ДЛЯ АНАЛИЗА:
    {text}
    """
    
    try:
        response = model.generate_content(prompt)
        # Очищаем ответ от маркдауна
        clean_text = response.text.replace('```json', '').replace('```', '').strip()
        clean_text = re.sub(r'\\([^"\\/bfnrtu])', r'\1', clean_text)
        return json.loads(clean_text, strict=False)
    except Exception as e:
        raise Exception(f"Ошибка анализа Gemini: {str(e)}")