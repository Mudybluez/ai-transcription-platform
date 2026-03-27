FROM python:3.10-slim

WORKDIR /usr/src/app

# Добавляем build-essential для компиляции
RUN apt-get update && apt-get install -y ffmpeg build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Фиксируем правильные версии базовых пакетов
RUN pip install --no-cache-dir --upgrade pip wheel "setuptools<70.0.0"

# ДОБАВЛЕН ФЛАГ --no-build-isolation
# Он заставляет pip использовать setuptools<70.0.0, который мы установили строчкой выше
RUN pip install --no-cache-dir --no-build-isolation -r requirements.txt

COPY . .

# Запускаем worker
CMD ["python", "-u", "worker.py"]