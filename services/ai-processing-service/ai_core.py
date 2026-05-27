import os
import sys

# Принудительно устанавливаем UTF-8 кодировку для вывода, чтобы избежать ошибок кодирования на Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import whisper
import torch
import google.generativeai as genai
import json
import tempfile
import yt_dlp
import re
import json_repair
import time
from youtube_transcript_api import YouTubeTranscriptApi

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"⏳ Загрузка модели Whisper (base) на устройство: {DEVICE}...")
whisper_model = whisper.load_model("base", device=DEVICE)
print(f"✅ Модель Whisper загружена на {DEVICE}")

gemini_api_key = os.getenv("GEMINI_API_KEY")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
else:
    print("⚠️ ВНИМАНИЕ: GEMINI_API_KEY не установлен!")

YOUTUBE_PROXY = os.getenv("YOUTUBE_PROXY")

class GeminiRateLimitError(Exception):
    """Custom exception raised when Gemini API returns a 429 Rate Limit error."""
    pass

# ==================== ДИАГНОСТИЧЕСКИЙ БЛОК ====================
def _mask_proxy(proxy_str):
    if not proxy_str:
        return "None (прокси НЕ задан в окружении)"
    return re.sub(r"(://[^:]+:)([^@]+)(@)", r"\1***\3", proxy_str)

print("🔍 ================= ДИАГНОСТИКА ОКРУЖЕНИЯ =================")
print(f"🔍 Загруженный YOUTUBE_PROXY: {_mask_proxy(YOUTUBE_PROXY)}")
try:
    import youtube_transcript_api
    print(f"🔍 Файл библиотеки: {youtube_transcript_api.__file__}")
    print(f"🔍 Содержимое модуля youtube_transcript_api: {dir(youtube_transcript_api)}")
    print(f"🔍 Содержимое класса YouTubeTranscriptApi: {dir(YouTubeTranscriptApi)}")
except Exception as e:
    print(f"🔍 Ошибка диагностики импорта: {e}")
print("🔍 ==========================================================")
# ===============================================================

def download_youtube_audio(url):
    """Скачивает аудио с YouTube во временную папку с поддержкой прокси в минимально возможном размере (48kbps MP3)"""
    temp_dir = tempfile.mkdtemp()
    audio_path = os.path.join(temp_dir, 'audio')
    
    ydl_opts = {
        'format': 'worstaudio/worst',
        'outtmpl': audio_path,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '48',
        }],
        'quiet': True
    }
    
    if YOUTUBE_PROXY:
        ydl_opts['proxy'] = YOUTUBE_PROXY
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)
        return audio_path + '.mp3'
    except Exception as e:
        raise Exception(f"Ошибка загрузки YouTube: {str(e)}")

def extract_youtube_video_id(url):
    """Извлекает ID видео из ссылки YouTube или возвращает ID, если передана строка ID"""
    if not url:
        return None
    url = url.strip()
    
    # Если передан просто 11-значный ID (YouTube ID всегда 11 символов)
    if len(url) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", url):
        return url
        
    pattern = r"(?:youtu\.be/|youtube\.com/(?:embed/|v/|watch\?\S*v=|watch\?.+&v=))([^&?#\s]+)"
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    return None

def get_youtube_transcript(url, language='ru'):
    """Попытка спарсить субтитры YouTube напрямую с поддержкой прокси и мультиязычности"""
    try:
        video_id = extract_youtube_video_id(url)
        if not video_id:
            print("⚠️ Не удалось извлечь ID видео YouTube.")
            return None

        # Нормализуем язык (например, 'ru-RU' -> 'ru')
        lang_code = language.split('-')[0].lower()
        # Выстраиваем приоритет языков: запрошенный -> русский -> английский
        lang_list = [lang_code]
        if 'ru' not in lang_list:
            lang_list.append('ru')
        if 'en' not in lang_list:
            lang_list.append('en')

        print(f"📡 Попытка получить субтитры для видео {video_id} (приоритет языков: {lang_list})...")

        # Настраиваем прокси в системном окружении для автоматического подхвата библиотекой requests
        old_http_proxy = os.environ.get('HTTP_PROXY')
        old_https_proxy = os.environ.get('HTTPS_PROXY')
        
        try:
            if YOUTUBE_PROXY:
                os.environ['HTTP_PROXY'] = YOUTUBE_PROXY
                os.environ['HTTPS_PROXY'] = YOUTUBE_PROXY
                print(f"🔒 Использование прокси через системное окружение.")

            # Получаем список субтитров с поддержкой абсолютно всех версий библиотеки (многоуровневый fallback)
            transcript_data = None
            api = YouTubeTranscriptApi()
            
            try:
                if hasattr(api, 'fetch'):
                    print("🔄 Вызов инстанс-метода fetch()...")
                    transcript_data = api.fetch(video_id, languages=lang_list)
                elif hasattr(YouTubeTranscriptApi, 'get_transcript'):
                    print("🔄 Вызов класс-метода get_transcript()...")
                    transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=lang_list)
                elif hasattr(api, 'list'):
                    print("🔄 Вызов инстанс-метода list()...")
                    transcript_list = api.list(video_id)
                    transcript_obj = transcript_list.find_transcript(lang_list)
                    transcript_data = transcript_obj.fetch()
                else:
                    print("🔄 Вызов класс-метода list_transcripts()...")
                    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                    transcript_obj = transcript_list.find_transcript(lang_list)
                    transcript_data = transcript_obj.fetch()
            except Exception as api_err:
                print(f"🔄 Первичный вызов API завершился с ошибкой ({api_err}). Пробуем альтернативный list()...")
                try:
                    if hasattr(api, 'list'):
                        transcript_list = api.list(video_id)
                        transcript_obj = transcript_list.find_transcript(lang_list)
                        transcript_data = transcript_obj.fetch()
                    elif hasattr(YouTubeTranscriptApi, 'list_transcripts'):
                        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                        transcript_obj = transcript_list.find_transcript(lang_list)
                        transcript_data = transcript_obj.fetch()
                except Exception as backup_err:
                    print(f"⚠️ Все попытки получить субтитры через API завершились ошибкой: {backup_err}")
                    raise backup_err
            
            if not transcript_data:
                return None

            # Если объект поддерживает конвертацию в чистый список словарей
            if hasattr(transcript_data, 'to_raw_data'):
                try:
                    print("🔄 Конвертируем FetchedTranscript в список словарей через to_raw_data()...")
                    transcript_data = transcript_data.to_raw_data()
                except Exception as raw_err:
                    print(f"⚠️ Не удалось сконвертировать в raw data: {raw_err}")

            # Склеиваем текстовые сегменты в единый текст с минимальной очисткой
            text_segments = []
            for entry in transcript_data:
                t = ""
                if isinstance(entry, dict):
                    t = entry.get('text', '').strip()
                elif hasattr(entry, 'text'):
                    t = getattr(entry, 'text', '').strip()
                else:
                    # Пробуем доступ по ключу (для объектов, реализующих __getitem__, типа FetchedTranscriptSnippet)
                    try:
                        t = str(entry['text']).strip()
                    except Exception:
                        pass
                
                if t:
                    # Очищаем лишние переносы строк внутри блока
                    t = t.replace('\n', ' ')
                    text_segments.append(t)
                    
            full_text = " ".join(text_segments)
            # Убираем множественные пробелы
            full_text = re.sub(r'\s+', ' ', full_text).strip()
            
            if full_text:
                print(f"✅ Субтитры успешно получены напрямую! Длина: {len(full_text)} символов.")
                print(f"🔍 Начало текста субтитров: {full_text[:120]}...")
                return full_text
            return None
            
        finally:
            # Восстанавливаем исходные переменные окружения
            if old_http_proxy is not None:
                os.environ['HTTP_PROXY'] = old_http_proxy
            elif 'HTTP_PROXY' in os.environ:
                del os.environ['HTTP_PROXY']
                
            if old_https_proxy is not None:
                os.environ['HTTPS_PROXY'] = old_https_proxy
            elif 'HTTPS_PROXY' in os.environ:
                del os.environ['HTTPS_PROXY']
        
    except Exception as e:
        print(f"⚠️ Не удалось получить субтитры напрямую: {str(e)}")
        return None
    
def transcribe_audio(file_path, language='ru'):
    """Транскрибирует аудио/видео файл с помощью Whisper с указанием языка и поддержкой FP16 на GPU"""
    try:
        # Нормализуем код языка (например, 'en-US' -> 'en', 'ru-RU' -> 'ru')
        lang_code = language.split('-')[0].lower()
        
        # Whisper ожидает двухбуквенный код.
        # FP16 поддерживается только на CUDA (GPU)
        use_fp16 = True if DEVICE == "cuda" else False
        
        print(f"🎙️ Запуск транскрибации Whisper (язык: {lang_code}, устройство: {DEVICE}, fp16: {use_fp16})...")
        result = whisper_model.transcribe(file_path, language=lang_code, fp16=use_fp16)
        return result["text"]
    except Exception as e:
        raise Exception(f"Ошибка транскрипции Whisper: {str(e)}")

def normalize_analysis_data(data):
    """Гарантирует наличие всех необходимых полей в структуре ответа ИИ"""
    if not isinstance(data, dict):
        data = {}
        
    default_localized = {"ru": "", "en": "", "kk": ""}
    default_localized_list = {"ru": [], "en": [], "kk": []}
    
    normalized = {
        "title": data.get("title") if isinstance(data.get("title"), dict) else default_localized,
        "summary": data.get("summary") if isinstance(data.get("summary"), dict) else default_localized,
        "detailed_analysis": data.get("detailed_analysis") if isinstance(data.get("detailed_analysis"), dict) else default_localized,
        "key_topics": data.get("key_topics") if isinstance(data.get("key_topics"), list) else [],
        "takeaways": data.get("takeaways") if isinstance(data.get("takeaways"), dict) else default_localized_list,
        "flashcards": data.get("flashcards") if isinstance(data.get("flashcards"), list) else [],
        "quiz": data.get("quiz") if isinstance(data.get("quiz"), list) else [],
        "mind_map": data.get("mind_map") if isinstance(data.get("mind_map"), dict) else {"nodes": [], "links": []}
    }
    
    # Рекурсивно проверяем локализованные поля в title, summary, detailed_analysis
    for field in ["title", "summary", "detailed_analysis"]:
        if not isinstance(normalized[field], dict):
            normalized[field] = default_localized.copy()
        else:
            normalized[field] = normalized[field].copy()
        for lang in ["ru", "en", "kk"]:
            if lang not in normalized[field] or normalized[field][lang] is None:
                normalized[field][lang] = ""
    # Проверяем takeaways
    if not isinstance(normalized["takeaways"], dict):
        normalized["takeaways"] = default_localized_list.copy()
    else:
        normalized["takeaways"] = normalized["takeaways"].copy()
    for lang in ["ru", "en", "kk"]:
        if lang not in normalized["takeaways"] or not isinstance(normalized["takeaways"][lang], list):
            normalized["takeaways"][lang] = []
            
    # Проверяем mind_map
    if not isinstance(normalized["mind_map"], dict):
        normalized["mind_map"] = {"nodes": [], "links": []}
    else:
        normalized["mind_map"] = normalized["mind_map"].copy()
        if "nodes" not in normalized["mind_map"] or not isinstance(normalized["mind_map"]["nodes"], list):
            normalized["mind_map"]["nodes"] = []
        if "links" not in normalized["mind_map"] or not isinstance(normalized["mind_map"]["links"], list):
            normalized["mind_map"]["links"] = []
            
    return normalized

def _generate_with_retry(model, prompt, step_name):
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

            # Очистка текста от экранированных переносов
            clean_text = clean_text.replace('\\\n', '\n').replace('\\ ', ' ')
            clean_text = re.sub(r'\\([^"\\/bfnrtu])', r'\1', clean_text)
            
            parsed = json_repair.loads(clean_text)
            
            if isinstance(parsed, list):
                print(f"⚠️ [{step_name}] ИИ вернул список вместо объекта. Пытаемся извлечь словарь...")
                parsed = next((item for item in parsed if isinstance(item, dict)), {})
                
            return parsed

        except Exception as e:
            error_msg = str(e)
            print(f"⚠️ Ошибка на шаге '{step_name}' (Попытка {attempt + 1}/{max_retries}): {error_msg}")
            
            # Дифференцируем Rate Limit (429) ошибки
            if "429" in error_msg or "Quota exceeded" in error_msg:
                if attempt < max_retries - 1:
                    print(f"Лимит API на шаге '{step_name}'! Ждем 35 секунд... ({attempt + 1}/{max_retries})")
                    time.sleep(35)
                    continue
                else:
                    raise GeminiRateLimitError(f"Превышен лимит запросов к ИИ на шаге '{step_name}': {error_msg}")
            
            # Другие ошибки
            if attempt < max_retries - 1:
                time.sleep(5)
                continue
            else:
                raise Exception(f"Сбой ИИ на шаге '{step_name}': {error_msg}")
                
    raise Exception(f"Не удалось получить ответ от ИИ на шаге '{step_name}' после {max_retries} попыток.")

def analyze_content(text):
    """Отправляет текст в Gemini для глубокого мультиязычного анализа (RU, EN, KK) по трехэтапному пайплайну"""
    if not os.environ.get("GEMINI_API_KEY"):
         raise Exception("API ключ Gemini отсутствует")

    if len(text) > 30000:
        print(f"⚠️ Текст слишком длинный ({len(text)}). Обрезаем для Gemini до 30000 символов.")
        text = text[:30000] 

    safety_settings = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]
    model = genai.GenerativeModel("models/gemini-3.1-flash-lite", safety_settings=safety_settings)
    
    text_len = len(text)
    
    # Задаем директивы детализации в зависимости от длины текста
    if text_len < 8000:
        length_directives = """
    ТРЕБОВАНИЯ К ДЕТАЛИЗАЦИИ РАЗДЕЛОВ JSON:
    1. title: Ёмкое, профессиональное и привлекательное название анализа (не более 15 слов).
    2. summary: Структурированный обзор (минимум 3 абзаца текста). Должен содержать:
       - Краткое описание контекста и основных событий/фактов.
       - Сводную Markdown-таблицу ключевых параметров или хронологии (минимум 3 строки).
       - Одну релевантную иллюстрацию в конце.
    3. key_topics: Выдели от 3 до 5 ключевых тем/разделов. Для каждой темы напиши:
       - title: Название темы.
       - key_points: Список из минимум 3 детальных тезисов/фактов (для каждого языка). Каждая точка должна быть законченным предложением.
       - relevance: Развернутое объяснение (2-3 предложения), почему эта тема важна.
    4. detailed_analysis: Глубокий, всесторонний аналитический отчет (минимум 4 детальных абзаца). Должен содержать:
       - Причинно-следственные связи, предпосылки и последствия рассматриваемых явлений.
       - Развернутую Markdown-таблицу (минимум 4 строки и 2 колонки) с детальным сравнением или структурой.
       - Одну релевантную иллюстрацию в конце.
    5. takeaways: От 5 до 8 ключевых выверенных уроков, инсайтов или выводов, сформулированных в виде законченных утверждений.
"""
        num_flashcards = 6
        min_topics, max_topics = 3, 5
        min_subtopics, max_subtopics = 2, 3
    elif text_len < 18000:
        length_directives = """
    ТРЕБОВАНИЯ К ДЕТАЛИЗАЦИИ РАЗДЕЛОВ JSON:
    1. title: Ёмкое, профессиональное и привлекательное название анализа (не более 15 слов).
    2. summary: Максимально детальный структурированный обзор (минимум 4 развернутых абзаца текста). Должен содержать:
       - Подробное описание контекста, предпосылок и основных действующих лиц/событий.
       - Информативную Markdown-таблицу ключевых параметров, фактов, хронологии или данных (минимум 4 строки и 3 колонки).
       - Одну релевантную иллюстрацию в конце.
    3. key_topics: Выдели строго от 5 до 6 ключевых тем/разделов. Для каждой темы напиши:
       - title: Название темы.
       - key_points: Список из строго 4 детальных, развернутых тезисов/фактов (для каждого языка). Каждый тезис должен быть подробным информативным предложением с конкретикой из текста.
       - relevance: Развернутое объяснение (3-4 предложения) значимости этой темы.
    4. detailed_analysis: Глубокий, всесторонний аналитический отчет (минимум 6 детальных абзацев). Должен содержать:
       - Тщательный разбор причинно-следственных связей, предпосылок и последствий рассматриваемых явлений.
       - Развернутую Markdown-таблицу (минимум 5 строк и 3 колонки) с детальным сравнением, структурой или разбором аспектов.
       - Одну релевантную иллюстрацию в конце.
    5. takeaways: Строго от 8 до 10 ключевых выверенных уроков, инсайтов или выводов, сформулированных в виде развернутых законченных утверждений.
"""
        num_flashcards = 8
        min_topics, max_topics = 4, 5
        min_subtopics, max_subtopics = 3, 4
    else:
        length_directives = """
    ТРЕБОВАНИЯ К ДЕТАЛИЗАЦИИ РАЗДЕЛОВ JSON:
    1. title: Ёмкое, профессиональное и привлекательное название анализа (не более 15 слов).
    2. summary: Фундаментальный структурированный обзор (минимум 5-6 масштабных, детальных абзацев текста). Должен содержать:
       - Исчерпывающий разбор контекста, предыстории событий, основных тезисов и позиций.
       - Подробную Markdown-таблицу ключевых показателей, хронологии или сравнительных аспектов (минимум 5 строк и 3-4 колонки).
       - Одну релевантную иллюстрацию в конце.
    3. key_topics: Выдели строго от 6 до 8 ключевых тем/разделов. Для каждой темы напиши:
       - title: Название темы.
       - key_points: Список из строго 5 детальных, глубоких тезисов/фактов (для каждого языка). Каждый тезис обязан быть развернутым законченным информативным предложением, раскрывающим конкретный факт, цифру или аргумент из исходного текста.
       - relevance: Обширное аналитическое объяснение (4-5 предложений), почему эта тема является критически важной.
    4. detailed_analysis: Всесторонний, детальный и академически глубокий аналитический отчет (минимум 8 масштабных абзацев). Должен содержать:
       - Исчерпывающий анализ предпосылок, сложных взаимосвязей, скрытых мотивов, аргументации и долгосрочных последствий явлений из текста.
       - Обязательный разбор конкретных кейсов, примеров, цитат, имен или числовых показателей, упомянутых в оригинале.
       - Развернутую сопоставительную Markdown-таблицу (минимум 6 строк и 3-4 колонки) с детальным сравнением, структурой или разбором аспектов.
       - Одну релевантную иллюстрацию в конце.
    5. takeaways: Строго от 10 до 12 ключевых глубоких уроков, инсайтов или выводов, сформулированных в виде емких, развернутых и интеллектуально богатых утверждений.
"""
        num_flashcards = 10
        min_topics, max_topics = 5, 7
        min_subtopics, max_subtopics = 3, 5

    # ------------------ ШАГ 1: ГЛУБОКАЯ АНАЛИТИКА ------------------
    print("⏳ [Шаг 1/3] Запуск генерации базовой аналитики...")
    prompt_analysis = f"""
    ТВОЯ РОЛЬ: Ты — ведущий эксперт-аналитик и профессиональный локализатор. Твоя цель — предоставить глубокий, высококачественный и максимально детализированный контент-анализ текста.
    
    ТВОЯ ЗАДАЧА: Проанализировать предоставленный текст и выдать структурированный результат ОДНОВРЕМЕННО на трех языках: РУССКОМ (ru), АНГЛИЙСКОМ (en) и КАЗАХСКОМ (kk).

    КРИТИЧЕСКИЕ ТРЕБОВАНИЯ К ПОЛНОТЕ И КАЧЕСТВУ КОНТЕНТА:
    1. Тексты в полях summary и detailed_analysis должны быть максимально развернутыми, глубокими, детальными и профессиональными. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать общие фразы, банальности и короткие отписки. Каждый вывод должен быть детально аргументирован и проиллюстрирован конкретными фактами, цитатами, именами, датами или примерами из текста.
    2. Для каждого текстового поля (кроме ключей JSON и списков) ты должен вернуть ОБЪЕКТ с ключами "ru", "en", "kk".
       Пример: "title": {{"ru": "Название", "en": "Title", "kk": "Атауы"}}
    3. В summary и detailed_analysis ОБЯЗАТЕЛЬНО используй разметку Markdown (заголовки, жирный/курсивный шрифт, списки).
    4. В summary и detailed_analysis ОБЯЗАТЕЛЬНО используй информативные и структурированные Markdown-таблицы для представления фактов, сравнений, хронологии или параметров. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать HTML для таблиц!
    5. В summary и detailed_analysis ДОБАВЬ по 1 релевантной иллюстрации в формате: ![описание](https://loremflickr.com/800/400/KEYWORD), где KEYWORD — это ключевое слово на английском, точно соответствующее теме контекста (например, `music-notes`, `artificial-intelligence` и т.д.).

    СТРУКТУРА JSON ДЛЯ ОТВЕТА:
    {{
        "title": {{"ru": "...", "en": "...", "kk": "..."}},
        "summary": {{"ru": "...", "en": "...", "kk": "..."}},
        "detailed_analysis": {{"ru": "...", "en": "...", "kk": "..."}},
        "key_topics": [
            {{
                "title": {{"ru": "...", "en": "...", "kk": "..."}},
                "key_points": {{
                    "ru": ["...", "...", "..."],
                    "en": ["...", "...", "..."],
                    "kk": ["...", "...", "..."]
                }},
                "relevance": {{"ru": "...", "en": "...", "kk": "..."}}
            }}
        ],
        "takeaways": {{
            "ru": ["...", "...", "..."],
            "en": ["...", "...", "..."],
            "kk": ["...", "...", "..."]
        }}
    }}

    {length_directives}

    ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ:
    1. Перевод на казахский язык (kk) и английский язык (en) должен быть выполнен профессионально, грамматически верно, без машинного подстрочника.
    2. Ответ должен быть СТРОГО валидным JSON без какого-либо дополнительного текста до или после кода. Не оборачивай JSON в markdown-блоки ```json, верни чистый текст JSON.
    3. Не придумывай и не галлюцинируй факты: используй только информацию из предоставленного текста.

    ТЕКСТ ДЛЯ АНАЛИЗА:
    {text}
    """
    
    analysis_res = _generate_with_retry(model, prompt_analysis, "Аналитика")
    
    # ------------------ ШАГ 2: ОБУЧАЮЩИЕ МАТЕРИАЛЫ ------------------
    print("⏳ [Шаг 2/3] Запуск генерации тестов и карточек...")
    analysis_context_str = json.dumps({
        "title": analysis_res.get("title"),
        "takeaways": analysis_res.get("takeaways"),
        "key_topics": [t.get("title") for t in analysis_res.get("key_topics", [])]
    }, ensure_ascii=False)
    
    prompt_learning = f"""
    ТВОЯ РОЛЬ: Ты — профессиональный методист и локализатор. Твоя цель — создать интерактивные обучающие материалы по предоставленному анализу текста.
    
    ТВОЯ ЗАДАЧА: На базе проведенного анализа контента составить карточки для запоминания и тест ОДНОВРЕМЕННО на трех языках: РУССКОМ (ru), АНГЛИЙСКОМ (en) и КАЗАХСКОМ (kk).

    КРИТИЧЕСКИЕ ТРЕБОВАНИЯ К ОБУЧАЮЩИМ МАТЕРИАЛАМ:
    1. Для каждого текстового поля (вопросы, ответы, варианты) ты должен вернуть ОБЪЕКТ с ключами "ru", "en", "kk".
    2. flashcards: Сделай ровно {num_flashcards} карточек для запоминания. Вопросы должны проверять не очевидные факты, а ключевые термины, цифры или интересные концепции.
    3. quiz: Ровно 10 тестовых вопросов с 4 вариантами ответов каждый. Вопросы должны проверять не только базовые, но и тонкие концепции, встречающиеся на протяжении всего текста.
    4. correct_answer: Должен СТРОГО совпадать с одним из вариантов ответа (options) для каждого соответствующего языка.

    СТРУКТУРА JSON ДЛЯ ОТВЕТА:
    {{
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

    ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ:
    1. Перевод на казахский язык (kk) и английский язык (en) должен быть выполнен профессионально.
    2. Ответ должен быть СТРОГО валидным JSON без markdown-блоков ```json.

    АНАЛИЗ КОНТЕНТА:
    {analysis_context_str}

    СЫРОЙ ТЕКСТ (ДЛЯ ДОПОЛНИТЕЛЬНОГО КОНТЕКСТА):
    {text[:5000]}
    """
    
    learning_res = _generate_with_retry(model, prompt_learning, "Обучение")

    # ------------------ ШАГ 3: КАРТА СВЯЗЕЙ (MINDMAP) ------------------
    print("⏳ [Шаг 3/3] Запуск генерации карты связей...")
    prompt_mindmap = f"""
    ТВОЯ РОЛЬ: Ты — эксперт по визуализации знаний и системному мышлению.
    
    ТВОЯ ЗАДАЧА: Сформировать иерархическую структуру карты знаний (MindMap) по предоставленному анализу контента. Результат должен быть ОДНОВРЕМЕННО на трех языках: РУССКОМ (ru), АНГЛИЙСКОМ (en) и КАЗАХСКОМ (kk).

    КРИТИЧЕСКИЕ ТРЕБОВАНИЯ К КАРТЕ СВЯЗЕЙ:
    1. Для каждого текстового поля (текст узла, категория, лейбл связи) ты должен вернуть ОБЪЕКТ с ключами "ru", "en", "kk".
    2. Сделай логичную, детальную структуру:
       - 1 корневой узел ("id": "root", "type": "root", "category": "Core")
       - От {min_topics} до {max_topics} узлов тем ("type": "topic") — ветви от корня (связаны с root)
       - Для каждого узла темы создай от {min_subtopics} до {max_subtopics} дочерних узлов подтем ("type": "subtopic"), детально раскрывающих каждый раздел (связаны со своим родительским topic).
    3. Все связи в списке "links" должны ссылаться на реально существующие id узлов в списке "nodes".

    СТРУКТУРА JSON ДЛЯ ОТВЕТА:
    {{
        "mind_map": {{
            "nodes": [
                {{
                    "id": "root",
                    "text": {{"ru": "...", "en": "...", "kk": "..."}},
                    "category": {{"ru": "...", "en": "...", "kk": "..."}},
                    "type": "root"
                }},
                {{
                    "id": "topic_1",
                    "text": {{"ru": "...", "en": "...", "kk": "..."}},
                    "category": {{"ru": "...", "en": "...", "kk": "..."}},
                    "type": "topic"
                }},
                {{
                    "id": "subtopic_1_1",
                    "text": {{"ru": "...", "en": "...", "kk": "..."}},
                    "category": {{"ru": "...", "en": "...", "kk": "..."}},
                    "type": "subtopic"
                }}
            ],
            "links": [
                {{
                    "source": "root",
                    "target": "topic_1",
                    "label": {{"ru": "...", "en": "...", "kk": "..."}}
                }},
                {{
                    "source": "topic_1",
                    "target": "subtopic_1_1",
                    "label": {{"ru": "...", "en": "...", "kk": "..."}}
                }}
            ]
        }}
    }}

    ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ:
    1. Перевод на казахский язык (kk) и английский язык (en) должен быть выполнен профессионально.
    2. Ответ должен быть СТРОГО валидным JSON без markdown-блоков ```json.

    АНАЛИЗ КОНТЕНТА И КЛЮЧЕВЫЕ ТЕМЫ:
    {analysis_context_str}
    """
    
    mindmap_res = _generate_with_retry(model, prompt_mindmap, "Карта связей")

    # ------------------ ОБЪЕДИНЕНИЕ И НОРМАЛИЗАЦИЯ ------------------
    print("✅ Все 3 шага генерации ИИ успешно завершены. Выполняется слияние...")
    
    merged_data = {
        "title": analysis_res.get("title"),
        "summary": analysis_res.get("summary"),
        "detailed_analysis": analysis_res.get("detailed_analysis"),
        "key_topics": analysis_res.get("key_topics"),
        "takeaways": analysis_res.get("takeaways"),
        "flashcards": learning_res.get("flashcards"),
        "quiz": learning_res.get("quiz"),
        "mind_map": mindmap_res.get("mind_map") if isinstance(mindmap_res, dict) else mindmap_res
    }
    
    return normalize_analysis_data(merged_data)

