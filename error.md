```
ОШИБКА ПРИ ОБРАБОТКЕ ЗАДАЧИ 145: Сбой ИИ: 429 You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit.                                                                          
ai_python_worker   | * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash
```

```
Краткий обзор: проект — микросервисная платформа: api-gateway (Node/Express, прокси + JWT), user-service (Node, Postgres, bcrypt), upload-service (Node, multer, RabbitMQ), ai-processing-service (Python, Whisper + Google Gemini, RabbitMQ воркер), search-service (Node, Postgres + Redis), frontend (React/Vite, Nginx). Плюсы: чёткое разделение, очередь, общий volume для файлов, Redis кеш. Риски: GEMINI_API_KEY и квоты (429); admin-статистика не защищена сервер-side; docker-compose экспортирует БД/Redis/RabbitMQ наружу; дефолтные секреты в коде; prompt к Gemini генерирует хрупкий/невалидный JSON. Рекомендации: убрать host-публикацию портов, хранить секреты безопасно, добавить server-side role checks, валидировать ответ ИИ и реализовать retry/backoff.
```