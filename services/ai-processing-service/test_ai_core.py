import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Динамически мокаем внешние зависимости для запуска тестов в любом окружении
sys.modules['whisper'] = MagicMock()
sys.modules['yt_dlp'] = MagicMock()

class MockYouTubeTranscriptApi:
    @staticmethod
    def get_transcript(video_id, languages=None, proxies=None):
        return []
    @staticmethod
    def list_transcripts(video_id, proxies=None):
        return MagicMock()

mock_yt = MagicMock()
mock_yt.YouTubeTranscriptApi = MockYouTubeTranscriptApi
sys.modules['youtube_transcript_api'] = mock_yt

# Настраиваем мок для google.generativeai
mock_genai = MagicMock()
sys.modules['google'] = MagicMock()
sys.modules['google.generativeai'] = mock_genai

# Если json_repair отсутствует в глобальном окружении, подменяем его на стандартный json
try:
    import json_repair
except ImportError:
    import json
    mock_json_repair = MagicMock()
    mock_json_repair.loads = lambda s: json.loads(s)
    sys.modules['json_repair'] = mock_json_repair

# Добавляем директорию сервиса в пути, чтобы импортировать ai_core
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from ai_core import normalize_analysis_data, analyze_content, extract_youtube_video_id, get_youtube_transcript

class TestAICore(unittest.TestCase):

    def test_normalize_empty_input(self):
        """Проверка нормализации пустых или невалидных данных"""
        result = normalize_analysis_data(None)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["title"]["ru"], "")
        self.assertEqual(result["title"]["en"], "")
        self.assertEqual(result["title"]["kk"], "")
        self.assertEqual(result["key_topics"], [])
        self.assertEqual(result["takeaways"]["ru"], [])
        self.assertEqual(result["mind_map"]["nodes"], [])

    def test_normalize_partial_input(self):
        """Проверка нормализации частично заполненных данных"""
        partial_data = {
            "title": {"ru": "Тест"},
            "takeaways": {"en": ["Point 1"]},
            "mind_map": {"nodes": [{"id": 1}]}
        }
        result = normalize_analysis_data(partial_data)
        
        # Поля должны заполниться дефолтными значениями
        self.assertEqual(result["title"]["ru"], "Тест")
        self.assertEqual(result["title"]["en"], "")
        self.assertEqual(result["title"]["kk"], "")
        
        self.assertEqual(result["takeaways"]["ru"], [])
        self.assertEqual(result["takeaways"]["en"], ["Point 1"])
        
        self.assertEqual(result["mind_map"]["nodes"], [{"id": 1}])
        self.assertEqual(result["mind_map"]["links"], [])
        
        self.assertEqual(result["summary"]["ru"], "")
        self.assertEqual(result["quiz"], [])

    def test_normalize_invalid_field_types(self):
        """Проверка нормализации полей с некорректными типами данных"""
        invalid_data = {
            "title": "Строка вместо словаря",
            "takeaways": ["Список вместо словаря"],
            "mind_map": "Строка вместо словаря"
        }
        result = normalize_analysis_data(invalid_data)
        
        self.assertIsInstance(result["title"], dict)
        self.assertEqual(result["title"]["ru"], "")
        
        self.assertIsInstance(result["takeaways"], dict)
        self.assertEqual(result["takeaways"]["ru"], [])
        
        self.assertIsInstance(result["mind_map"], dict)
        self.assertEqual(result["mind_map"]["nodes"], [])

    def test_normalize_detailed_mindmap(self):
        """Проверка нормализации детальной и структурированной карты знаний (mind_map)"""
        rich_data = {
            "mind_map": {
                "nodes": [
                    {
                        "id": "root",
                        "text": {"ru": "Тест Корня", "en": "Root Test", "kk": "Корень Тест"},
                        "category": {"ru": "Центр", "en": "Center", "kk": "Центр"},
                        "type": "root"
                    }
                ],
                "links": [
                    {
                        "source": "root",
                        "target": "topic_1",
                        "label": {"ru": "связан", "en": "linked", "kk": "байланысты"}
                    }
                ]
            }
        }
        result = normalize_analysis_data(rich_data)
        
        self.assertEqual(len(result["mind_map"]["nodes"]), 1)
        self.assertEqual(result["mind_map"]["nodes"][0]["id"], "root")
        self.assertEqual(result["mind_map"]["nodes"][0]["text"]["ru"], "Тест Корня")
        
        self.assertEqual(len(result["mind_map"]["links"]), 1)
        self.assertEqual(result["mind_map"]["links"][0]["source"], "root")
        self.assertEqual(result["mind_map"]["links"][0]["label"]["en"], "linked")

    @patch("ai_core.genai.GenerativeModel")
    @patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"})
    def test_analyze_content_list_handling(self, mock_generative_model):
        """Проверка того, что analyze_content успешно обрабатывает массив на верхнем уровне ответа ИИ"""
        mock_model_instance = MagicMock()
        mock_generative_model.return_value = mock_model_instance
        
        # Имитируем, что ИИ вернул список с объектом внутри
        mock_response = MagicMock()
        mock_response.text = '[{"title": {"ru": "Заголовок из списка"}}]'
        mock_model_instance.generate_content.return_value = mock_response
        
        result = analyze_content("test text")
        
        self.assertIsInstance(result, dict)
        self.assertEqual(result["title"]["ru"], "Заголовок из списка")
        self.assertEqual(result["title"]["en"], "")

    def test_extract_youtube_video_id(self):
        """Проверка корректного извлечения ID видео из различных форматов ссылок"""
        self.assertEqual(extract_youtube_video_id("dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(extract_youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(extract_youtube_video_id("http://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(extract_youtube_video_id("https://youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(extract_youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s"), "dQw4w9WgXcQ")
        self.assertEqual(extract_youtube_video_id("invalid-link-format"), None)
        self.assertEqual(extract_youtube_video_id(""), None)

    @patch("ai_core.YouTubeTranscriptApi.get_transcript")
    def test_get_youtube_transcript_success(self, mock_get_transcript):
        """Проверка успешного парсинга субтитров и форматирования текста"""
        # Настраиваем возвращаемые субтитры
        mock_get_transcript.return_value = [
            {"text": "Привет\nмир", "start": 0.0, "duration": 1.0},
            {"text": "  это тест субтитров  ", "start": 1.0, "duration": 2.0}
        ]
        
        result = get_youtube_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ", language="ru")
        self.assertEqual(result, "Привет мир это тест субтитров")
        
    @patch("ai_core.YouTubeTranscriptApi.get_transcript")
    def test_get_youtube_transcript_failure(self, mock_get_transcript):
        """Проверка того, что при ошибке запроса метод возвращает None (для fallback сценария)"""
        mock_get_transcript.side_effect = Exception("YouTube blocked IP or no subtitles")
        
        result = get_youtube_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ", language="ru")
        self.assertIsNone(result)

    @patch("ai_core.YouTubeTranscriptApi.list_transcripts")
    def test_get_youtube_transcript_fallback(self, mock_list_transcripts):
        """Проверка работы fallback-сценария через list_transcripts при отсутствии get_transcript"""
        # Временно удаляем метод get_transcript из класса
        from ai_core import YouTubeTranscriptApi
        
        # Мокаем работу list_transcripts
        mock_transcript_list = MagicMock()
        mock_transcript_obj = MagicMock()
        mock_transcript_obj.fetch.return_value = [
            {"text": "Альтернативный", "start": 0.0, "duration": 1.0},
            {"text": "текст", "start": 1.0, "duration": 2.0}
        ]
        mock_transcript_list.find_transcript.return_value = mock_transcript_obj
        mock_list_transcripts.return_value = mock_transcript_list
        
        # Временно подменяем getattr/hasattr для класса с помощью patch
        with patch("ai_core.hasattr", side_effect=lambda obj, name: False if name == "get_transcript" else hasattr(obj, name)):
            result = get_youtube_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ", language="ru")
            self.assertEqual(result, "Альтернативный текст")

    def test_get_youtube_transcript_fetch_success(self):
        """Проверка успешного вызова fetch() на инстансе YouTubeTranscriptApi (новые версии библиотеки с кастомными объектами)"""
        # Динамически мокаем метод fetch на инстансе
        from ai_core import YouTubeTranscriptApi
        
        # Подменяем hasattr, чтобы вернуть True для fetch, но False для get_transcript
        def custom_hasattr(obj, name):
            if name == "fetch":
                return True
            if name == "get_transcript":
                return False
            return hasattr(obj, name)
            
        class MockSnippet:
            def __init__(self, text):
                self.text = text
                
        mock_fetch = MagicMock()
        mock_fetch.return_value = [
            MockSnippet("Новый"),
            MockSnippet("метод")
        ]
        
        with patch("ai_core.hasattr", side_effect=custom_hasattr), \
             patch.object(YouTubeTranscriptApi, "fetch", mock_fetch, create=True):
            result = get_youtube_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ", language="ru")
            self.assertEqual(result, "Новый метод")

if __name__ == "__main__":
    unittest.main()
