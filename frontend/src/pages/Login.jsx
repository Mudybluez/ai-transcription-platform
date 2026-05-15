import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useTranslation } from 'react-i18next';

const Login = () => {
    // Состояния формы
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        try {
            if (isLoginMode) {
                // Логика входа
                const response = await api.post('/users/login', { email, password });
                
                // Сохраняем данные пользователя в localStorage
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('userId', response.data.user.id);
                localStorage.setItem('role', response.data.user.role);
                localStorage.setItem('username', response.data.user.username);
                localStorage.setItem('email', response.data.user.email);
                
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
        <div style={{ minHeight: '100vh', backgroundColor: '#050505', paddingTop: '50px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <select 
                    className="lang-switcher" 
                    onChange={(e) => changeLanguage(e.target.value)} 
                    value={i18n.language}
                >
                    <option value="en">EN</option>
                    <option value="ru">RU</option>
                    <option value="kk">KK</option>
                </select>
            </div>

            <div style={{ 
                maxWidth: '400px', 
                margin: '0 auto', 
                padding: '30px', 
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '16px', 
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                fontFamily: 'sans-serif',
                color: 'white',
                backdropFilter: 'blur(10px)'
            }}>
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
                    {isLoginMode ? t('login_title') : t('register_title')}
                </h2>
                
                {message && (
                    <div style={{ 
                        padding: '10px', 
                        marginBottom: '15px', 
                        borderRadius: '5px',
                        backgroundColor: isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                        color: isError ? '#fca5a5' : '#86efac',
                        textAlign: 'center',
                        fontSize: '14px',
                        border: isError ? '1px solid #ef4444' : '1px solid #22c55e'
                    }}>
                        {message}
                    </div>
                )}
                
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {!isLoginMode && (
                        <input 
                            type="text" 
                            placeholder={t('username_label')} 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="yt-input"
                            style={{ width: '100%' }}
                        />
                    )}
                    <input 
                        type="email" 
                        placeholder={t('email_label')} 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="yt-input"
                        style={{ width: '100%' }}
                    />
                    <input 
                        type="password" 
                        placeholder={t('password_label')} 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="yt-input"
                        style={{ width: '100%' }}
                    />
                    <button 
                        type="submit" 
                        className="btn-primary"
                        style={{ padding: '14px', width: '100%' }}
                    >
                        {isLoginMode ? t('login_btn') : t('register_btn')}
                    </button>
                </form>
                
                <p 
                    style={{ textAlign: 'center', marginTop: '20px', cursor: 'pointer', color: '#a855f7' }} 
                    onClick={() => {
                        setIsLoginMode(!isLoginMode);
                        setMessage('');
                        setIsError(false);
                    }}
                >
                    {isLoginMode ? t('no_account') : t('have_account')}
                </p>
            </div>
        </div>
    );
};

export default Login;