import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';

export default function Login() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();

    // Form states
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);

    const [passwordScore, setPasswordScore] = useState(0);
    const [unverifiedEmail, setUnverifiedEmail] = useState('');
    const [recaptchaSiteKey, setRecaptchaSiteKey] = useState(null);
    const [isResending, setIsResending] = useState(false);

    const handleResend = async () => {
        if (!unverifiedEmail) return;
        setIsResending(true);
        try {
            const res = await api.post('/users/resend-verification', { email: unverifiedEmail });
            setIsError(false);
            setMessage(res.data.message || 'Ссылка подтверждения успешно отправлена повторно!');
            setUnverifiedEmail(''); // Clear after successful send
        } catch (err) {
            setIsError(true);
            setMessage(err.response?.data?.message || 'Не удалось отправить ссылку повторно. Пожалуйста, попробуйте еще раз.');
        } finally {
            setIsResending(false);
        }
    };

    useEffect(() => {
        // Redirect to dashboard/admin if already logged in
        const token = localStorage.getItem('token');
        const role = localStorage.getItem('role');
        if (token) {
            if (role === 'admin') {
                navigate('/admin');
            } else {
                navigate('/');
            }
            return;
        }

        // Check for ?verified=true parameter in URL
        const queryParams = new URLSearchParams(window.location.search);
        if (queryParams.get('verified') === 'true') {
            setIsError(false);
            setMessage('Email успешно подтвержден! Теперь вы можете войти в свой аккаунт.');
        }

        // Fetch reCAPTCHA public key in runtime
        const fetchRecaptchaKey = async () => {
            try {
                const res = await api.get('/users/recaptcha-site-key');
                const siteKey = res.data.siteKey;
                if (siteKey) {
                    setRecaptchaSiteKey(siteKey);
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
            } catch (err) {
                console.error('Ошибка получения конфигурации reCAPTCHA:', err);
            }
        };

        fetchRecaptchaKey();

        // Cleanup script on unmount
        return () => {
            const script = document.getElementById('recaptcha-v3-script');
            if (script) script.remove();
            const badge = document.querySelector('.grecaptcha-badge');
            if (badge) badge.remove();
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

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        try {
            if (isLoginMode) {
                // Login logic
                const response = await api.post('/users/login', { email, password });
                
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('userId', response.data.user.id);
                localStorage.setItem('role', response.data.user.role);
                localStorage.setItem('username', response.data.user.username);
                localStorage.setItem('email', response.data.user.email);
                
                if (response.data.user.role === 'admin') {
                    navigate('/admin');
                } else {
                    navigate('/');
                }
            } else {
                // Register logic
                const usernameRegex = /^[a-zA-Z0-9\-_@]+$/;
                if (!usernameRegex.test(username)) {
                    setIsError(true);
                    setMessage('Имя пользователя должно быть одним словом на латинице и может содержать только буквы, цифры и символы: -, _, @');
                    return;
                }
                if (username.length >= 13) {
                    setIsError(true);
                    setMessage('Длина имени пользователя должна быть меньше 13 символов');
                    return;
                }

                let recaptchaToken = null;
                const siteKey = recaptchaSiteKey;
                
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
                
                setUnverifiedEmail(email);
                setIsLoginMode(true);
                setIsError(false);
                setMessage('Регистрация прошла успешно! На вашу почту отправлено письмо со ссылкой для верификации. Пожалуйста, подтвердите email перед входом.');
                setPassword(''); 
            }
        } catch (error) {
            setIsError(true);
            setMessage(error.response?.data?.message || t('server_error', 'Произошла ошибка соединения с сервером'));
            
            if (error.response?.status === 403 || error.response?.data?.emailUnverified) {
                setUnverifiedEmail(error.response?.data?.email || email);
            } else {
                setUnverifiedEmail('');
            }
        }
    };

    return (
        <div className="auth-shell" data-screen-label="login">
            <div style={{ position: 'absolute', top: 20, right: 20 }}>
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

            <div className="auth-card fade-in">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                        <img src="/logo.webp" alt="Logo" style={{ width: 112, height: 112, borderRadius: '8px', objectFit: 'contain' }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', fontSize: 16 }}>
                            ZenScribe
                        </span>
                    </span>
                </div>

                <h1 className="auth-title">
                    {isLoginMode ? t('login_title', 'С возвращением') : t('register_title', 'Создать аккаунт')}
                </h1>
                <p className="auth-sub">
                    {isLoginMode ? t('login_subtitle', 'Войди в аккаунт, чтобы продолжить.') : t('register_subtitle', 'Зарегистрируйся, чтобы начать работу.')}
                </p>

                {message && (
                    <div style={{ 
                        padding: '12px 16px', 
                        marginBottom: '20px', 
                        borderRadius: '8px',
                        backgroundColor: isError ? 'rgba(242, 139, 130, 0.1)' : 'rgba(129, 201, 149, 0.1)',
                        color: isError ? 'var(--accent-error)' : 'var(--accent-success)',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        border: `1px solid ${isError ? 'rgba(242, 139, 130, 0.2)' : 'rgba(129, 201, 149, 0.2)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        alignItems: 'center',
                        textAlign: 'center'
                    }}>
                        <span>{message}</span>
                        {unverifiedEmail && (
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={isResending}
                                className="btn btn--ghost btn--sm"
                                style={{
                                    borderColor: 'var(--accent-primary)',
                                    color: 'var(--accent-primary)',
                                    marginTop: 4
                                }}
                            >
                                {isResending ? 'Отправка...' : 'Отправить письмо еще раз'}
                            </button>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {!isLoginMode && (
                        <div className="material-field">
                            <input 
                                id="username"
                                type="text" 
                                placeholder=" " 
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                            <label htmlFor="username">{t('username_label', 'Имя пользователя')}</label>
                        </div>
                    )}
                    
                    <div className="material-field">
                        <input 
                            id="email"
                            type="email" 
                            placeholder=" " 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <label htmlFor="email">{t('email_label', 'Email')}</label>
                    </div>

                    <div className="material-field">
                        <input 
                            id="password"
                            type="password" 
                            placeholder=" " 
                            value={password}
                            onChange={handlePasswordChange}
                            required
                        />
                        <label htmlFor="password">{t('password_label', 'Пароль')}</label>
                    </div>

                    {!isLoginMode && password && (
                        <div style={{ marginTop: '-4px' }}>
                            <div style={{ 
                                height: '4px', 
                                width: '100%', 
                                backgroundColor: 'var(--border-subtle)', 
                                borderRadius: '2px',
                                overflow: 'hidden',
                                marginBottom: '4px'
                            }}>
                                <div style={{ 
                                    height: '100%', 
                                    width: `${(passwordScore / 5) * 100}%`, 
                                    backgroundColor: getStrengthDetails(passwordScore).color,
                                    transition: 'width 0.3s ease, background-color 0.3s ease'
                                }} />
                            </div>
                            <span style={{ fontSize: '11.5px', color: getStrengthDetails(passwordScore).color }}>
                                {getStrengthDetails(passwordScore).label}
                            </span>
                        </div>
                    )}

                    <button 
                        type="submit" 
                        className="btn btn--primary"
                        style={{ width: '100%', marginTop: 8 }}
                        disabled={!isLoginMode && passwordScore < 3}
                    >
                        {isLoginMode ? t('login_btn', 'Войти') : t('register_btn', 'Создать аккаунт')}
                        <Icon name="arrow_right" size={15} />
                    </button>
                </form>

                <p 
                    style={{ textAlign: 'center', marginTop: '24px', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '13px' }} 
                    onClick={() => {
                        setIsLoginMode(!isLoginMode);
                        setMessage('');
                        setIsError(false);
                    }}
                >
                    {isLoginMode ? t('no_account', 'Еще нет аккаунта? Зарегистрироваться') : t('have_account', 'Уже есть аккаунт? Войти')}
                </p>
            </div>
        </div>
    );
}