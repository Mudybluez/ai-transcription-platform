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

export default api;