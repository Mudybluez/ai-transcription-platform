import unittest
from unittest.mock import patch, MagicMock
import os
import sys
import json

# Динамически мокаем внешние зависимости для запуска тестов в любом окружении
sys.modules['whisper'] = MagicMock()
sys.modules['yt_dlp'] = MagicMock()
sys.modules['youtube_transcript_api'] = MagicMock()
sys.modules['google'] = MagicMock()
sys.modules['google.generativeai'] = MagicMock()

# Добавляем директорию сервиса в пути, чтобы импортировать модули
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Импортируем тестируемые компоненты
from ai_core import GeminiRateLimitError, analyze_content
import worker

class TestWorkerResilience(unittest.TestCase):

    @patch('ai_core.genai.GenerativeModel')
    @patch('ai_core.os.environ.get')
    def test_gemini_rate_limit_error_raised(self, mock_env_get, mock_model_class):
        """Проверяем, что при ошибке 429 генерируется именно исключение GeminiRateLimitError"""
        mock_env_get.return_value = "fake_key"
        
        # Настраиваем модель так, чтобы она выкидывала ошибку 429 при вызове generate_content
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = Exception("429 Resource has been exhausted (e.g. queries per minute quota).")
        mock_model_class.return_value = mock_model
        
        # Проверяем, что analyze_content выбрасывает GeminiRateLimitError
        with self.assertRaises(GeminiRateLimitError):
            analyze_content("Тестовый текст для анализа.")

    @patch('worker.update_job_status')
    @patch('worker.time.sleep') # мокаем sleep, чтобы тест не висел
    def test_worker_retry_handling(self, mock_sleep, mock_update_status):
        """Проверяем, что при перехвате GeminiRateLimitError воркер отправляет задачу на повторный круг"""
        
        # Мокаем pika-канал
        mock_channel = MagicMock()
        mock_method = MagicMock()
        mock_method.delivery_tag = "test_tag_123"
        
        # Мокаем задачу
        job_data = {
            "jobId": 100,
            "userId": 5,
            "filePath": "/fake/path.mp4",
            "fileName": "test_resilience.mp4",
            "language": "ru",
            "retry_count": 0
        }
        
        body = json.dumps(job_data)
        
        # Подменяем get_youtube_transcript и transcribe_audio в worker, чтобы они не падали
        with patch('worker.get_youtube_transcript', return_value=None), \
             patch('worker.transcribe_audio', return_value="Некоторый распознанный текст"), \
             patch('worker.analyze_content', side_effect=GeminiRateLimitError("Имитация 429 ошибки")):
            
            # Запускаем callback воркера
            worker.callback(mock_channel, mock_method, None, body)
            
            # Проверяем, что статус обновился до RETRYING
            mock_update_status.assert_any_call(100, "RETRYING (Attempt 1/5)")
            
            # Проверяем, что воркер заснул перед отправкой
            mock_sleep.assert_called_with(30) # 2^0 * 30 = 30 секунд
            
            # Проверяем, что воркер переопубликовал задачу обратно в RabbitMQ с увеличенным retry_count
            mock_channel.basic_publish.assert_called_once()
            args, kwargs = mock_channel.basic_publish.call_args
            
            # Проверяем, что очередь правильная
            self.assertEqual(kwargs['routing_key'], 'transcription_jobs')
            
            # Проверяем, что retry_count увеличился до 1
            republished_data = json.loads(kwargs['body'])
            self.assertEqual(republished_data['retry_count'], 1)
            self.assertEqual(republished_data['jobId'], 100)
            
            # Проверяем, что старое сообщение было подтверждено (basic_ack)
            mock_channel.basic_ack.assert_called_with(delivery_tag="test_tag_123")

    @patch('worker.update_job_status')
    @patch('worker.time.sleep')
    def test_worker_max_retries_reached(self, mock_sleep, mock_update_status):
        """Проверяем, что при достижении 5 попыток воркер помечает задачу как окончательно упавшую"""
        
        mock_channel = MagicMock()
        mock_method = MagicMock()
        mock_method.delivery_tag = "test_tag_999"
        
        # Мокаем задачу с уже достигнутым максимумом попыток (5)
        job_data = {
            "jobId": 200,
            "userId": 5,
            "filePath": "/fake/path.mp4",
            "fileName": "test_max_retries.mp4",
            "language": "ru",
            "retry_count": 5
        }
        
        body = json.dumps(job_data)
        
        with patch('worker.get_youtube_transcript', return_value=None), \
             patch('worker.transcribe_audio', return_value="Текст"), \
             patch('worker.analyze_content', side_effect=GeminiRateLimitError("Имитация 429")):
            
            worker.callback(mock_channel, mock_method, None, body)
            
            # Статус в БД должен обновиться до FAILED
            mock_update_status.assert_any_call(200, "FAILED: Превышен лимит попыток ИИ (429)")
            
            # Переопубликования в RabbitMQ быть не должно
            mock_channel.basic_publish.assert_not_called()
            
            # Старая задача должна быть подтверждена (basic_ack)
            mock_channel.basic_ack.assert_called_with(delivery_tag="test_tag_999")

if __name__ == '__main__':
    unittest.main()
