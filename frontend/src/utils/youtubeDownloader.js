import axios from 'axios';

/**
 * Утилита для получения прямой ссылки на аудио YouTube через клиент
 * Мы используем публичные API, которые работают как прокси,
 * чтобы обойти CORS и серверные блокировки IP.
 */
export const downloadYoutubeClientSide = async (videoUrl) => {
    try {
        // Извлекаем ID видео
        const videoIdMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
        if (!videoIdMatch) throw new Error("Неверная ссылка YouTube");
        const videoId = videoIdMatch[1];

        // Используем один из публичных API для конвертации (например, Cobalt или аналоги)
        // В данном примере мы воспользуемся надежным методом через сторонний сервис-прокси
        // который возвращает прямую ссылку на скачивание.
        
        const response = await axios.post('https://api.cobalt.tools/api/json', {
            url: videoUrl,
            downloadMode: 'audio',
            audioFormat: 'mp3',
            audioBitrate: '128'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.url) {
            // Скачиваем аудио как Blob прямо в браузере
            const audioResponse = await axios.get(response.data.url, {
                responseType: 'blob'
            });

            // Создаем файл из блоба
            const file = new File([audioResponse.data], `youtube_${videoId}.mp3`, { type: 'audio/mp3' });
            return file;
        } else {
            throw new Error("Не удалось получить ссылку на аудио");
        }
    } catch (error) {
        console.error("Ошибка клиентской загрузки:", error);
        throw error;
    }
};
