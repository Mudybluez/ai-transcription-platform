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
    
def transcribe_audio(file_path, language="ru"):
    """Транскрибирует аудио/видео файл с помощью Whisper с указанием языка"""
    try:
        # Для Whisper 'kk' поддерживается, передаем язык как подсказку
        result = whisper_model.transcribe(file_path, language=language)
        return result["text"]
    except Exception as e:
        raise Exception(f"Ошибка транскрипции Whisper: {str(e)}")

def analyze_content(text, language="ru"):
    """Отправляет текст в Gemini для глубокого структурированного анализа"""
    if not os.environ.get("GEMINI_API_KEY"):
         raise Exception("API ключ Gemini отсутствует")

    if len(text) > 15000:
        print(f"⚠️ Текст слишком длинный ({len(text)}). Обрезаем для Gemini до 15000 символов.")
        text = text[:15000]

    model = genai.GenerativeModel("models/gemini-2.5-flash")
    
    languages_map = {
        "ru": "РУССКОМ",
        "en": "АНГЛИЙСКОМ (ENGLISH)",
        "kk": "КАЗАХСКОМ (ҚАЗАҚ ТІЛІ)"
    }
    target_lang = languages_map.get(language, "РУССКОМ")
    
    prompt = f"""
    ТВОЯ РОЛЬ: Ты — эксперт-аналитик и профессиональный переводчик. 
    ТВОЯ ЗАДАЧА: Проанализировать предоставленный текст и выдать структурированный результат ИСКЛЮЧИТЕЛЬНО на {target_lang} языке.

    КРИТИЧЕСКОЕ ТРЕБОВАНИЕ К ЯЗЫКУ:
    Даже если исходный текст на другом языке, АБСОЛЮТНО ВСЕ текстовые значения в итоговом JSON должны быть переведены и написаны СТРОГО на {target_lang}.

    ПРАВИЛА ФОРМАТИРОВАНИЯ MARKDOWN (для полей summary и detailed_analysis):
    1. Выделяй важные термины **жирным шрифтом**.
    2. ОБЯЗАТЕЛЬНО используй СТАНДАРТНУЮ Markdown-таблицу (синтаксис: `| Header | Header |` затем `|---|---|`). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать HTML-теги для таблиц или сложные вложенные структуры. Таблица должна иметь одинаковое количество столбцов во всех строках.
    3. ДОБАВЬ 1-2 контекстные иллюстрации в таком формате: ![описание](https://loremflickr.com/800/400/KEYWORD)
       Где KEYWORD — 1-2 АНГЛИЙСКИХ слова без пробелов (например: chemistry,lab). Никаких пробелов в ссылке!

    КРИТИЧЕСКИЕ ПРАВИЛА JSON:
    1. Верни СТРОГО валидный JSON. Никакого текста до или после скобок {{ }}.
    2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать двойные кавычки (") внутри текстовых значений. Используй одинарные (') или елочки («»).
    3. Ключи JSON оставляй на английском, а вот значения пиши строго на {target_lang}.

    СТРУКТУРА JSON (заполни все поля максимально подробно):
    {{
        "title": "Краткое и емкое название контента на {target_lang} языке (макс 6 слов)",
        "summary": "Детальное резюме контента из нескольких абзацев на {target_lang} языке",
        "key_topics": [
            {{
                "title": "Название темы на {target_lang}",
                "key_points": ["Детальный пункт 1 на {target_lang}", "Детальный пункт 2 на {target_lang}"],
                "relevance": "Почему это важно знать на {target_lang}"
            }}
        ],
        "detailed_analysis": "Детальный разбор всего материала в формате Markdown на {target_lang} языке. Используй заголовки (##), списки (-), ТАБЛИЦЫ и картинки. Сделай текст максимально удобным для чтения.",
        "takeaways": ["Практический вывод 1 на {target_lang}", "Практический вывод 2 на {target_lang}"],
        "additional_info": [
            {{
                "interesting_facts": ["Интересный факт из текста на {target_lang}"],
                "statistics": ["Статистические данные или цифры из текста на {target_lang}"],
                "quotes": ["Важная цитата на {target_lang}"],
                "further_reading": ["Темы для самостоятельного изучения на {target_lang}"]
            }}
        ],
        "flashcards": [
            {{
                "question": "Вопрос для карточки на {target_lang}",
                "answer": "Краткий и понятный ответ на {target_lang}"
            }}
        ],
        "quiz": [
            {{
                "question": "Текстовый вопрос для проверки знаний на {target_lang}",
                "options": ["Вариант 1 на {target_lang}", "Вариант 2 на {target_lang}", "Вариант 3 на {target_lang}", "Вариант 4 на {target_lang}"],
                "correct_answer": "Правильный вариант ответа (должен точно совпадать с одним из вариантов в options)"
            }}
        ]
    }}

    ВАЖНЫЕ ПРАВИЛА КОНТЕНТА:
    1. Сгенерируй минимум 6 карточек (flashcards).
    2. ОБЯЗАТЕЛЬНО сгенерируй РОВНО 10 тестовых вопросов (quiz).
    3. Рандомизируй расположение правильного ответа в options (он не должен всегда быть первым).
    4. Анализ должен быть глубоким, профессиональным и академичным.

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

            # Убиваем слеши
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