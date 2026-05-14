import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const Login = () => {
    // Состояния формы
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        try {
            if (isLoginMode) {
                // Логика входа
                const response = await api.post('/users/login', { email, password });
                
                // Сохраняем токен и роль в localStorage
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('role', response.data.user.role);
                
                // Направляем пользователя в зависимости от его роли
                if (response.data.user.role === 'admin') {
                    navigate('/admin');
                } else {
                    navigate('/');
                }
            } else {
                // Логика регистрации
                await api.post('/users/register', { username, email, password });
                
                setIsLoginMode(true);
                setIsError(false);
                setMessage('Регистрация прошла успешно! Теперь вы можете войти.');
                // Очищаем поля
                setPassword(''); 
            }
        } catch (error) {
            setIsError(true);
            setMessage(error.response?.data?.message || 'Произошла ошибка соединения с сервером');
        }
    };

    return (
        <div style={{ 
            maxWidth: '400px', 
            margin: '100px auto', 
            padding: '30px', 
            border: '1px solid #eaeaea', 
            borderRadius: '10px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            fontFamily: 'sans-serif' 
        }}>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
                {isLoginMode ? 'Вход в систему' : 'Регистрация'}
            </h2>
            
            {message && (
                <div style={{ 
                    padding: '10px', 
                    marginBottom: '15px', 
                    borderRadius: '5px',
                    backgroundColor: isError ? '#fee2e2' : '#dcfce7',
                    color: isError ? '#991b1b' : '#166534',
                    textAlign: 'center'
                }}>
                    {message}
                </div>
            )}
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {!isLoginMode && (
                    <input 
                        type="text" 
                        placeholder="Имя пользователя" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                    />
                )}
                <input 
                    type="email" 
                    placeholder="Email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                />
                <input 
                    type="password" 
                    placeholder="Пароль" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                />
                <button 
                    type="submit" 
                    style={{ 
                        padding: '12px', 
                        backgroundColor: '#2563eb', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '5px', 
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold'
                    }}
                >
                    {isLoginMode ? 'Войти' : 'Зарегистрироваться'}
                </button>
            </form>
            
            <p 
                style={{ textAlign: 'center', marginTop: '20px', cursor: 'pointer', color: '#2563eb' }} 
                onClick={() => {
                    setIsLoginMode(!isLoginMode);
                    setMessage('');
                    setIsError(false);
                }}
            >
                {isLoginMode ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войти'}
            </p>
        </div>
    );
};

export default Login;