import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Динамически мокаем внешние зависимости для запуска тестов в любом окружении
sys.modules['whisper'] = MagicMock()
sys.modules['yt_dlp'] = MagicMock()

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
from ai_core import normalize_analysis_data, analyze_content

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

if __name__ == "__main__":
    unittest.main()
