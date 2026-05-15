import axios from 'axios';

const api = axios.create({
    // Стучимся в наш API Gateway
    baseURL: 'http://localhost:3000/api', 
});

// Автоматически добавляем токен ко всем запросам
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Обработка ошибок ответов (автоматический выход при истечении токена)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Если токен недействителен или просрочен
            localStorage.clear();
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;