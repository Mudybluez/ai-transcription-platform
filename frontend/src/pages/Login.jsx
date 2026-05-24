import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useTranslation } from 'react-i18next';

const Login = () => {
    const { t, i18n } = useTranslation();
    
    // Состояния формы
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    
    const [passwordScore, setPasswordScore] = useState(0);

    const [unverifiedEmail, setUnverifiedEmail] = useState('');
    const [isResending, setIsResending] = useState(false);

    const handleResend = async () => {
        if (!unverifiedEmail) return;
        setIsResending(true);
        try {
            const res = await api.post('/users/resend-verification', { email: unverifiedEmail });
            setIsError(false);
            setMessage(res.data.message || 'Ссылка подтверждения успешно отправлена повторно!');
            setUnverifiedEmail(''); // Очищаем после успешной отправки
        } catch (err) {
            setIsError(true);
            setMessage(err.response?.data?.message || 'Не удалось отправить ссылку повторно. Пожалуйста, попробуйте еще раз.');
        } finally {
            setIsResending(false);
        }
    };

    useEffect(() => {
        // Проверяем наличие параметра ?verified=true в URL
        const queryParams = new URLSearchParams(window.location.search);
        if (queryParams.get('verified') === 'true') {
            setIsError(false);
            setMessage('Email успешно подтвержден! Теперь вы можете войти в свой аккаунт.');
        }

        // Динамически загружаем Google reCAPTCHA v3
        const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
        if (siteKey) {
            const existingScript = document.getElementById('recaptcha-v3-script');
            if (!existingScript) {
                const script = document.createElement('script');
                script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
                script.id = 'recaptcha-v3-script';
                script.async = true;
                script.defer = true;
                document.body.appendChild(script);
            }
        }

        // Cleanup script on unmount
        return () => {
            const script = document.getElementById('recaptcha-v3-script');
            if (script) {
                script.remove();
            }
            const badge = document.querySelector('.grecaptcha-badge');
            if (badge) {
                badge.remove();
            }
        };
    }, []);

    const checkPasswordScore = (pass) => {
        if (!pass) return 0;
        
        let score = 0;
        if (pass.length >= 8) score++;
        if (/[A-Z]/.test(pass)) score++;
        if (/[a-z]/.test(pass)) score++;
        if (/\d/.test(pass)) score++;
        if (/[!@#$%^&*(),.?":{}|<>]/.test(pass)) score++;

        return score;
    };

    const getStrengthDetails = (score) => {
        const labels = ['', t('password_strength_1'), t('password_strength_2'), t('password_strength_3'), t('password_strength_4'), t('password_strength_5')];
        const colors = ['gray', '#ef4444', '#f59e0b', '#facc15', '#22c55e', '#10b981'];
        return { label: labels[score], color: colors[score] };
    };

    const handlePasswordChange = (e) => {
        const pass = e.target.value;
        setPassword(pass);
        if (!isLoginMode) {
            setPasswordScore(checkPasswordScore(pass));
        }
    };

    const navigate = useNavigate();

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
                let recaptchaToken = null;
                const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
                
                if (siteKey && window.grecaptcha) {
                    try {
                        recaptchaToken = await new Promise((resolve, reject) => {
                            window.grecaptcha.ready(() => {
                                window.grecaptcha.execute(siteKey, { action: 'register' })
                                    .then(resolve)
                                    .catch(reject);
                            });
                        });
                    } catch (err) {
                        console.error('Ошибка генерации токена reCAPTCHA:', err);
                    }
                }

                await api.post('/users/register', { username, email, password, recaptchaToken });
                
                setUnverifiedEmail(email); // Сохраняем почту для возможности повторной отправки
                setIsLoginMode(true);
                setIsError(false);
                setMessage('Регистрация прошла успешно! На вашу почту отправлено письмо со ссылкой для верификации. Пожалуйста, подтвердите email перед входом.');
                // Очищаем поля
                setPassword(''); 
            }
        } catch (error) {
            setIsError(true);
            setMessage(error.response?.data?.message || t('server_error', 'Произошла ошибка соединения с сервером'));
            
            // Если ошибка входа из-за неподтвержденной почты (HTTP 403)
            if (error.response?.status === 403 || error.response?.data?.emailUnverified) {
                setUnverifiedEmail(error.response?.data?.email || email);
            } else {
                setUnverifiedEmail('');
            }
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
                        padding: '12px', 
                        marginBottom: '15px', 
                        borderRadius: '8px',
                        backgroundColor: isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: isError ? '#fca5a5' : '#86efac',
                        textAlign: 'center',
                        fontSize: '14px',
                        border: isError ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(34, 197, 94, 0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        alignItems: 'center'
                    }}>
                        <span>{message}</span>
                        {unverifiedEmail && (
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={isResending}
                                style={{
                                    background: 'rgba(99, 102, 241, 0.25)',
                                    border: '1px solid rgba(99, 102, 241, 0.6)',
                                    color: '#c7d2fe',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    outline: 'none'
                                }}
                            >
                                {isResending ? 'Отправка...' : 'Отправить письмо еще раз'}
                            </button>
                        )}
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
                        onChange={handlePasswordChange}
                        required
                        className="yt-input"
                        style={{ width: '100%' }}
                    />
                    {!isLoginMode && password && (
                        <div style={{ marginTop: '-10px' }}>
                            <div style={{ 
                                height: '4px', 
                                width: '100%', 
                                backgroundColor: 'rgba(255,255,255,0.1)', 
                                borderRadius: '2px',
                                overflow: 'hidden'
                            }}>
                                <div style={{ 
                                    height: '100%', 
                                    width: `${(passwordScore / 5) * 100}%`, 
                                    backgroundColor: getStrengthDetails(passwordScore).color,
                                    transition: 'width 0.3s ease, background-color 0.3s ease'
                                }} />
                            </div>
                            <span style={{ fontSize: '12px', color: getStrengthDetails(passwordScore).color }}>
                                {getStrengthDetails(passwordScore).label}
                            </span>
                        </div>
                    )}
                    <button 
                        type="submit" 
                        className="btn-primary"
                        style={{ padding: '14px', width: '100%' }}
                        disabled={!isLoginMode && passwordScore < 3}
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