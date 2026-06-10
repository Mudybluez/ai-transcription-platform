import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import NotificationsBell from '../components/NotificationsBell';
import Footer from '../components/Footer';

const NavItems = ({
    userRole,
    changeLanguage,
    i18n,
    setIsMobileMenuOpen,
    t
}) => {
    const displayRole = userRole === 'admin' ? 'Admin' : userRole;
    return (
        <>
            <span className={`role-badge-nav role-badge-${userRole.toLowerCase()}`}>
                {displayRole}
            </span>

            <NotificationsBell />

            <select 
                className="lang-switcher" 
                onChange={(e) => changeLanguage(e.target.value)} 
                value={i18n.language}
            >
                <option value="en">EN</option>
                <option value="ru">RU</option>
                <option value="kk">KK</option>
            </select>
            <Link to="/" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>
                <Icon name="arrow_left" size={14} style={{ marginRight: 4 }} />
                {t('back_btn', 'Назад')}
            </Link>
            <span className="nav-link logout" onClick={() => {
                localStorage.clear();
                window.location.href = '/login';
            }}>
                <Icon name="log_out" size={14} style={{ marginRight: 4 }} />
                {t('logout', 'Выйти')}
            </span>
        </>
    );
};

export default function Profile() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const [stats, setStats] = useState({ 
        totalAnalyzed: 0, 
        lastActivity: '-', 
        totalWords: 0,
        languages: []
    });
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [isChanging, setIsChanging] = useState(false);
    const [userRole, setUserRole] = useState(localStorage.getItem('role') || 'Standard');
    
    const [newUsername, setNewUsername] = useState(localStorage.getItem('username') || '');
    const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Mock notification states
    const [emailNotifs, setEmailNotifs] = useState(true);
    const [pushNotifs, setPushNotifs] = useState(true);
    const [marketingNotifs, setMarketingNotifs] = useState(false);

    // SaaS Billing & Subscriptions states
    const [profileData, setProfileData] = useState({
        custom_requests: 0,
        subscription_status: 'inactive',
        subscription_expires_at: null,
        remaining_requests: 0
    });
    const [checkoutPlan, setCheckoutPlan] = useState(null); // 'Lite', 'Pro', 'Tokens'
    const [checkoutMethod, setCheckoutMethod] = useState(null); // 'card', 'gpay', 'paypal'
    const [tokenCount, setTokenCount] = useState(10);
    const [paymentStatus, setPaymentStatus] = useState('idle'); // 'idle', 'processing', 'success', 'error'
    
    // Payment inputs
    const [cardNumber, setCardNumber] = useState('');
    const [cardHolder, setCardHolder] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvc, setCardCvc] = useState('');
    const [paypalEmail, setPaypalEmail] = useState('');
    const [paypalPassword, setPaypalPassword] = useState('');

    const renderPricingFooter = (planName) => {
        const ROLE_RANKS = {
            'Standard': 0,
            'Lite': 1,
            'Pro': 2,
            'admin': 3
        };

        const currentRank = ROLE_RANKS[userRole] || 0;
        const targetRank = ROLE_RANKS[planName] || 0;

        if (userRole === planName && profileData.subscription_status === 'active') {
            return (
                <div style={{
                    textAlign: 'center',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(138, 180, 248, 0.15)',
                    color: 'var(--accent-primary)',
                    fontWeight: 600,
                    fontSize: 14,
                    border: '1px solid rgba(138, 180, 248, 0.3)',
                    marginTop: '16px'
                }}>
                    {t('billing_current_plan_btn', 'Ваш текущий тариф')}
                </div>
            );
        }

        if (targetRank < currentRank && profileData.subscription_status === 'active') {
            return (
                <div style={{
                    textAlign: 'center',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    fontSize: 14,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    marginTop: '16px'
                }}>
                    {t('billing_downgrade_disabled', 'Недоступно для перехода')}
                </div>
            );
        }

        return (
            <div>
                <div className="billing-methods-title">{t('pay_methods', 'Способы оплаты')}</div>
                <div className="billing-pay-buttons">
                    <button className="billing-pay-btn billing-pay-btn--card" onClick={() => { setCheckoutPlan(planName); setCheckoutMethod('card'); setPaymentStatus('idle'); }}>
                        <Icon name="credit_card" size={13} /> {t('billing_pay_card', 'Банковская карта')}
                    </button>
                    <button className="billing-pay-btn billing-pay-btn--gpay" onClick={() => { setCheckoutPlan(planName); setCheckoutMethod('gpay'); setPaymentStatus('idle'); }}>
                        <Icon name="google" size={13} /> {t('billing_pay_gpay', 'Google Pay')}
                    </button>
                    <button className="billing-pay-btn billing-pay-btn--paypal" onClick={() => { setCheckoutPlan(planName); setCheckoutMethod('paypal'); setPaymentStatus('idle'); }}>
                        <Icon name="paypal" size={13} /> {t('billing_pay_paypal', 'PayPal')}
                    </button>
                </div>
            </div>
        );
    };

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    const user = {
        id: localStorage.getItem('userId'),
        username: localStorage.getItem('username') || t('profile_default_username', 'Студент'),
        email: localStorage.getItem('email') || 'student@turbo.ai',
        role: localStorage.getItem('role') || 'user'
    };

    useEffect(() => {
        if (user.id) {
            fetchStats();
        }
    }, [user.id]);

    const fetchStats = async () => {
        try {
            const historyRes = await api.get('/history');
            const statsRes = await api.get(`/user/stats/${user.id}`);
            
            const profileRes = await api.get(`/users/profile/${user.id}`);
            if (profileRes.data) {
                if (profileRes.data.role) {
                    localStorage.setItem('role', profileRes.data.role);
                    setUserRole(profileRes.data.role);
                }
                setProfileData({
                    custom_requests: profileRes.data.custom_requests || 0,
                    subscription_status: profileRes.data.subscription_status || 'inactive',
                    subscription_expires_at: profileRes.data.subscription_expires_at || null,
                    remaining_requests: profileRes.data.remaining_requests || 0
                });
            }
            
            const lastDate = historyRes.data.length > 0 
                ? new Date(historyRes.data[0].created_at).toLocaleDateString()
                : '-';

            setStats({ 
                totalAnalyzed: statsRes.data.totalTranscriptions, 
                lastActivity: lastDate,
                totalWords: statsRes.data.totalWords,
                languages: statsRes.data.languages || []
            });
        } catch (e) {
            console.error("Ошибка получения статистики пользователя", e);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (!oldPassword || !newPassword) {
            alert(t('fill_fields_alert', 'Заполните поля пароля'));
            return;
        }
        setIsChanging(true);
        try {
            await api.post('/users/change-password', { userId: user.id, oldPassword, newPassword });
            alert(t('password_changed_alert', 'Пароль изменен'));
            setOldPassword(''); 
            setNewPassword('');
        } catch (error) {
            alert(error.response?.data?.message || "Ошибка");
        } finally {
            setIsChanging(false);
        }
    };

    const clearHistory = async () => {
        if (!window.confirm(t('confirm_clear_all', 'Вы уверены, что хотите полностью очистить всю историю разборов?'))) return;
        try {
            await api.delete('/history/all/clear');
            alert(t('history_cleared_alert', 'История очищена'));
            fetchStats();
        } catch (error) {
            alert("Ошибка");
        }
    };

    const handleUpdateUsername = async (e) => {
        e.preventDefault();
        const usernameRegex = /^[a-zA-Z0-9\-_@]+$/;
        if (!newUsername || !usernameRegex.test(newUsername)) {
            alert('Имя пользователя должно быть одним словом на латинице и может содержать только буквы, цифры и символы: -, _, @');
            return;
        }
        if (newUsername.length >= 13) {
            alert('Длина имени пользователя должна быть меньше 13 символов');
            return;
        }
        setIsUpdatingUsername(true);
        try {
            const response = await api.post('/users/update-username', { userId: user.id, newUsername });
            alert(t('username_updated_alert', 'Имя пользователя успешно обновлено'));
            localStorage.setItem('username', response.data.user.username);
            window.location.reload();
        } catch (error) {
            alert(error.response?.data?.message || t('error_alert', 'Ошибка'));
        } finally {
            setIsUpdatingUsername(false);
        }
    };

    const handlePay = async (e) => {
        if (e) e.preventDefault();
        
        if (checkoutMethod === 'card') {
            if (!cardNumber || !cardExpiry || !cardCvc || !cardHolder) {
                alert(t('fill_fields_alert', 'Заполните все поля'));
                return;
            }
        } else if (checkoutMethod === 'paypal') {
            if (!paypalEmail || !paypalPassword) {
                alert(t('fill_fields_alert', 'Заполните все поля'));
                return;
            }
        }

        setPaymentStatus('processing');
        
        try {
            if (checkoutMethod === 'card' || checkoutMethod === 'gpay') {
                // 1. Создаем Payment Intent на бэкенде
                const intentRes = await api.post('/users/billing/stripe-create-intent', {
                    userId: user.id,
                    plan: checkoutPlan,
                    tokenCount: Number(tokenCount)
                });

                if (!intentRes.data.success) {
                    setPaymentStatus('error');
                    return;
                }

                const { clientSecret, paymentIntentId } = intentRes.data;

                // 2. Имитируем подтверждение платежа клиентом в Stripe/Google Pay (2 секунды задержки для визуала)
                setTimeout(async () => {
                    try {
                        // 3. Отправляем бэкенду запрос на верификацию и начисление токенов/подписки
                        const verifyRes = await api.post('/users/billing/stripe-verify', {
                            userId: user.id,
                            plan: checkoutPlan,
                            tokenCount: Number(tokenCount),
                            paymentIntentId,
                            method: checkoutMethod === 'card' ? 'Direct Card' : 'Google Pay'
                        });

                        if (verifyRes.data.success) {
                            setPaymentStatus('success');
                            fetchStats();
                            // Очистка полей ввода
                            setCardNumber('');
                            setCardHolder('');
                            setCardExpiry('');
                            setCardCvc('');
                        } else {
                            setPaymentStatus('error');
                        }
                    } catch (err) {
                        console.error('Ошибка верификации Stripe:', err);
                        setPaymentStatus('error');
                    }
                }, 2000);

            } else if (checkoutMethod === 'paypal') {
                // 1. Создаем заказ PayPal на бэкенде
                const orderRes = await api.post('/users/billing/paypal-create-order', {
                    userId: user.id,
                    plan: checkoutPlan,
                    tokenCount: Number(tokenCount)
                });

                if (!orderRes.data.success) {
                    setPaymentStatus('error');
                    return;
                }

                const { orderId } = orderRes.data;

                // 2. Имитируем авторизацию заказа в PayPal (2 секунды для красивого UI)
                setTimeout(async () => {
                    try {
                        // 3. Отправляем бэкенду запрос на списание и начисление баланса/подписки
                        const captureRes = await api.post('/users/billing/paypal-capture-order', {
                            userId: user.id,
                            plan: checkoutPlan,
                            tokenCount: Number(tokenCount),
                            orderId,
                            method: 'PayPal'
                        });

                        if (captureRes.data.success) {
                            setPaymentStatus('success');
                            fetchStats();
                            // Очистка полей ввода
                            setPaypalEmail('');
                            setPaypalPassword('');
                        } else {
                            setPaymentStatus('error');
                        }
                    } catch (err) {
                        console.error('Ошибка захвата PayPal:', err);
                        setPaymentStatus('error');
                    }
                }, 2000);
            }
        } catch (err) {
            console.error('Критическая ошибка платежного шлюза:', err);
            setPaymentStatus('error');
        }
    };

    return (
        <div className="dashboard-container fade-in">
            {/* Navigation Header */}
            <header className="top-nav">
                <button className="hamburger" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
                <Link to="/" className="logo" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <img src="/logo.webp" alt="Logo" style={{ width: 88, height: 88, objectFit: 'contain' }} />
                    <span>ZenScribe</span>
                </Link>
                <div className="nav-links-desktop">
                    <NavItems 
                        userRole={userRole} 
                        changeLanguage={changeLanguage} 
                        i18n={i18n} 
                        setIsMobileMenuOpen={setIsMobileMenuOpen} 
                        t={t} 
                    />
                </div>
            </header>

            {/* Mobile Nav Overlay */}
            <div className={`mobile-overlay ${isMobileMenuOpen ? 'open' : ''}`} onClick={() => setIsMobileMenuOpen(false)} />
            <div className={`mobile-menu-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
                <button style={{background:'none', border:'none', color:'white', fontSize:'24px', alignSelf:'flex-end', marginBottom:'20px', cursor:'pointer'}} onClick={() => setIsMobileMenuOpen(false)}>×</button>
                <NavItems 
                    userRole={userRole} 
                    changeLanguage={changeLanguage} 
                    i18n={i18n} 
                    setIsMobileMenuOpen={setIsMobileMenuOpen} 
                    t={t} 
                />
            </div>

            {/* Main Redesigned Content Grid */}
            <main className="page" data-screen-label="profile" style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 80px' }}>
                <a className="crumb" onClick={(e) => { e.preventDefault(); navigate('/'); }} href="#">
                    <Icon name="arrow_left" size={14} />
                    {t('back_btn', 'Назад в библиотеку')}
                </a>
                
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 32px' }}>
                    {t('profile', 'Профиль')}
                </h1>

                <div className="profile-grid">
                    {/* Left Card: Summary Stats */}
                    <div className="profile-card">
                        <div className="profile-avatar">
                            {user.username.charAt(0).toUpperCase()}
                        </div>
                        <h2 className="profile-name">{user.username}</h2>
                        <p className="profile-email">{user.email}</p>
                        
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                            <span className="admin-pill" style={{ textTransform: 'uppercase' }}>
                                {userRole === 'admin' ? 'Admin' : userRole}
                            </span>
                        </div>

                        <div className="profile-stats">
                            <div className="profile-stats__item">
                                <div className="profile-stats__num">{stats.totalAnalyzed}</div>
                                <div className="profile-stats__label">{t('stats_analyzed', 'Разборов')}</div>
                            </div>
                            <div className="profile-stats__item">
                                <div className="profile-stats__num">
                                    {stats.totalWords.toLocaleString()}
                                </div>
                                <div className="profile-stats__label">{t('stats_words', 'Слов ИИ')}</div>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 24, paddingTop: 16 }}>
                            <div className="section-title" style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
                                {t('lang_content', 'Языки контента')}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {stats.languages.length === 0 ? (
                                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{t('profile_no_lang_stats', 'Статистика языков отсутствует')}</span>
                                ) : stats.languages.map((l, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13.5 }}>
                                        <span>{l.lang === 'ru' ? t('lang_ru_name', 'Русский') : l.lang === 'en' ? t('lang_en_name', 'English') : t('lang_kk_name', 'Қазақша')}</span>
                                        <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{l.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Settings & Forms */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Billing & Subscriptions Card */}
                        <div className="profile-card">
                            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>
                                {t('billing_title', 'Тарифы и оплата')}
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 20px' }}>
                                {t('billing_hint', 'Управляйте своим тарифным планом и токенами.')}
                            </p>

                            {/* Current Billing Status Summary */}
                            <div className="billing-status-block">
                                <div className="billing-status-item">
                                    <div className="billing-status-label">{t('billing_current_plan', 'Текущий тариф')}</div>
                                    <div className="billing-status-value">
                                        {userRole === 'admin' ? 'Admin' : (userRole === 'Standard' ? t('role_standard', 'Standard') : userRole)}
                                        {userRole !== 'Standard' && userRole !== 'admin' && (
                                            <span className={`billing-badge billing-badge--${profileData.subscription_status === 'active' ? 'active' : 'expired'}`}>
                                                {profileData.subscription_status === 'active' 
                                                    ? t('billing_status_active', 'Активен') 
                                                    : t('billing_status_expired', 'Истек')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {userRole !== 'Standard' && userRole !== 'admin' && profileData.subscription_expires_at && (
                                    <div className="billing-status-item">
                                        <div className="billing-status-label">{t('billing_expires_at', 'Истекает')}</div>
                                        <div className="billing-status-value" style={{ fontSize: 14 }}>
                                            {new Date(profileData.subscription_expires_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                )}

                                <div className="billing-status-item">
                                    <div className="billing-status-label">{t('billing_tokens_balance', 'Доступные токены')}</div>
                                    <div className="billing-status-value" style={{ color: 'var(--accent-primary)', fontSize: 18 }}>
                                        {profileData.custom_requests}
                                    </div>
                                </div>
                            </div>

                            {/* Tiers Selection Grid */}
                            <div className="billing-tiers-grid">
                                {/* LITE TIER */}
                                <div className="billing-tier-card">
                                    <div className="billing-tier-header">
                                        <div className="billing-tier-title">{t('billing_tier_lite_title', 'Тариф Lite')}</div>
                                        <div className="billing-tier-price">{t('billing_tier_lite_price', '$2.50 / месяц')}</div>
                                        <div className="billing-tier-desc">{t('billing_tier_lite_desc', 'Идеально для студентов и базовых задач.')}</div>
                                    </div>
                                    <div className="billing-tier-features">
                                        <div className="billing-feature-item">
                                            <Icon name="check" size={13} className="billing-feature-icon" />
                                            <span>{t('billing_tier_lite_features', '20 запросов в месяц · Лимит 5 ч/мес · Базовый ИИ-конспект')}</span>
                                        </div>
                                    </div>
                                    {renderPricingFooter('Lite')}
                                </div>

                                {/* PRO TIER */}
                                <div className="billing-tier-card billing-tier-card--pro">
                                    <div className="billing-tier-popular-badge">POPULAR</div>
                                    <div className="billing-tier-header">
                                        <div className="billing-tier-title">{t('billing_tier_pro_title', 'Тариф Pro')}</div>
                                        <div className="billing-tier-price">{t('billing_tier_pro_price', '$7.50 / месяц')}</div>
                                        <div className="billing-tier-desc">{t('billing_tier_pro_desc', 'Для исследователей и профессионалов.')}</div>
                                    </div>
                                    <div className="billing-tier-features">
                                        <div className="billing-feature-item">
                                            <Icon name="check" size={13} className="billing-feature-icon" />
                                            <span>{t('billing_tier_pro_features', 'Приоритетная очередь ИИ · 100 запросов в месяц · Глубокие интеллект-карты · Массовая загрузка')}</span>
                                        </div>
                                    </div>
                                    {renderPricingFooter('Pro')}
                                </div>

                                {/* ONE-OFF TOKENS TIER */}
                                <div className="billing-tier-card">
                                    <div className="billing-tier-header">
                                        <div className="billing-tier-title">{t('billing_tier_tokens_title', 'Разовые токены')}</div>
                                        <div className="billing-tier-price">{t('billing_tier_tokens_price', '$0.25 / запрос')}</div>
                                        <div className="billing-tier-desc">{t('billing_tier_tokens_desc', 'Гибкая оплата по факту использования.')}</div>
                                    </div>
                                    <div className="billing-tier-features">
                                        <div className="billing-feature-item">
                                            <Icon name="check" size={13} className="billing-feature-icon" />
                                            <span>{t('billing_tier_tokens_features', 'Обработка 1 видео или аудиофайла · Купленные токены не сгорают')}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="billing-methods-title">{t('pay_methods', 'Способы оплаты')}</div>
                                        <div className="billing-pay-buttons">
                                            <button className="billing-pay-btn billing-pay-btn--card" onClick={() => { setCheckoutPlan('Tokens'); setCheckoutMethod('card'); setPaymentStatus('idle'); }}>
                                                <Icon name="credit_card" size={13} /> {t('billing_pay_card', 'Банковская карта')}
                                            </button>
                                            <button className="billing-pay-btn billing-pay-btn--gpay" onClick={() => { setCheckoutPlan('Tokens'); setCheckoutMethod('gpay'); setPaymentStatus('idle'); }}>
                                                <Icon name="google" size={13} /> {t('billing_pay_gpay', 'Google Pay')}
                                            </button>
                                            <button className="billing-pay-btn billing-pay-btn--paypal" onClick={() => { setCheckoutPlan('Tokens'); setCheckoutMethod('paypal'); setPaymentStatus('idle'); }}>
                                                <Icon name="paypal" size={13} /> {t('billing_pay_paypal', 'PayPal')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Settings card */}
                        <div className="profile-card">
                            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>
                                {t('profile_settings', 'Настройки профиля')}
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 24px' }}>
                                {t('profile_username_hint', 'Имя и аватар отображаются в твоей библиотеке и при экспорте.')}
                            </p>
                            <form onSubmit={handleUpdateUsername}>
                                <label className="label">{t('username_label', 'Имя пользователя')}</label>
                                <input 
                                    className="field" 
                                    value={newUsername} 
                                    onChange={e => setNewUsername(e.target.value)} 
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                                    <button type="submit" className="btn btn--primary btn--sm" disabled={isUpdatingUsername}>
                                        {isUpdatingUsername ? t('saving', 'Сохранение...') : t('save_btn', 'Сохранить')}
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Interactive Toggle Settings */}
                        <div className="profile-card">
                            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>{t('profile_notifications_title', 'Уведомления')}</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>
                                {t('profile_notifications_hint', 'Что присылать, когда разбор готов или меняется статус подписки.')}
                            </p>
                            <div className="list-row">
                                <div>
                                    <div className="list-row__label">{t('profile_notif_email', 'Email-уведомления')}</div>
                                    <div className="list-row__sub">{t('profile_notif_email_hint', 'Когда разбор готов или возникла ошибка')}</div>
                                </div>
                                <button className={`toggle ${emailNotifs ? 'is-on' : ''}`} onClick={() => setEmailNotifs(v => !v)} />
                            </div>
                            <div className="list-row">
                                <div>
                                    <div className="list-row__label">{t('profile_notif_push', 'Push в браузер')}</div>
                                    <div className="list-row__sub">{t('profile_notif_push_hint', 'Только когда вкладка открыта')}</div>
                                </div>
                                <button className={`toggle ${pushNotifs ? 'is-on' : ''}`} onClick={() => setPushNotifs(v => !v)} />
                            </div>
                            <div className="list-row">
                                <div>
                                    <div className="list-row__label">{t('profile_notif_news', 'Новости платформы')}</div>
                                    <div className="list-row__sub">{t('profile_notif_news_hint', 'Релизы, фичи, эксперименты')}</div>
                                </div>
                                <button className={`toggle ${marketingNotifs ? 'is-on' : ''}`} onClick={() => setMarketingNotifs(v => !v)} />
                            </div>
                        </div>

                        {/* Security Form Card */}
                        <div className="profile-card">
                            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>
                                {t('security_title', 'Безопасность')}
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>
                                {t('profile_security_hint', 'Смена пароля и завершение всех сессий.')}
                            </p>
                            <form onSubmit={handleChangePassword}>
                                <label className="label">{t('old_password', 'Текущий пароль')}</label>
                                <input 
                                    className="field" 
                                    type="password" 
                                    placeholder="••••••••" 
                                    value={oldPassword}
                                    onChange={e => setOldPassword(e.target.value)}
                                />
                                <div style={{ height: 12 }} />
                                <label className="label">{t('new_password', 'Новый пароль')}</label>
                                <input 
                                    className="field" 
                                    type="password" 
                                    placeholder="••••••••" 
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                                    <button type="button" className="btn btn--danger btn--sm" onClick={clearHistory}>
                                        <Icon name="trash" size={13} />
                                        {t('clear_history_btn', 'Очистить историю')}
                                    </button>
                                    <button type="submit" className="btn btn--primary btn--sm" disabled={isChanging}>
                                        {isChanging ? t('profile_changing_pwd', 'Смена...') : t('update_password_btn', 'Обновить пароль')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </main>

            {/* Simulated Checkout Modals Overlay */}
            {checkoutPlan && (
                <div className="checkout-modal-overlay">
                    <div className="checkout-modal-content">
                        <button className="checkout-modal-close" onClick={() => setCheckoutPlan(null)}>×</button>
                        
                        {paymentStatus === 'idle' && (
                            <>
                                <div className="checkout-header">
                                    <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>
                                        {t('billing_checkout_title', 'Оформление оплаты')}
                                    </h3>
                                    <span className={`checkout-method-badge checkout-method-badge--${checkoutMethod}`}>
                                        <Icon name={checkoutMethod === 'card' ? 'credit_card' : (checkoutMethod === 'gpay' ? 'google' : 'paypal')} size={12} />
                                        {checkoutMethod === 'card' ? t('billing_pay_card', 'Банковская карта') : (checkoutMethod === 'gpay' ? 'Google Pay' : 'PayPal')}
                                    </span>
                                </div>

                                {/* Order Summary */}
                                <div className="checkout-summary">
                                    <div className="checkout-summary-row">
                                        <span className="checkout-summary-label">{t('billing_current_plan', 'Тариф')}</span>
                                        <span className="checkout-summary-value">
                                            {checkoutPlan === 'Tokens' ? `${t('billing_tier_tokens_title', 'Разовые токены')} (${tokenCount} шт)` : (checkoutPlan === 'Lite' ? t('billing_tier_lite_title', 'Тариф Lite') : t('billing_tier_pro_title', 'Тариф Pro'))}
                                        </span>
                                    </div>
                                    {checkoutPlan === 'Tokens' && (
                                        <div style={{ padding: '8px 0 var(--s-3)' }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 8 }}>
                                                {t('token_quantity', 'Количество токенов')}
                                            </div>
                                            <div className="token-counter">
                                                <button className="token-counter-btn" onClick={() => setTokenCount(prev => Math.max(10, prev - 10))}>-10</button>
                                                <button className="token-counter-btn" onClick={() => setTokenCount(prev => Math.max(1, prev - 1))}>-1</button>
                                                <span className="token-counter-value">{tokenCount}</span>
                                                <button className="token-counter-btn" onClick={() => setTokenCount(prev => prev + 1)}>+1</button>
                                                <button className="token-counter-btn" onClick={() => setTokenCount(prev => prev + 10)}>+10</button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="checkout-summary-row">
                                        <span className="checkout-summary-label">{t('order_total', 'Итого к оплате')}</span>
                                        <span className="checkout-summary-value checkout-summary-total">
                                            {checkoutPlan === 'Lite' ? '$2.50' : (checkoutPlan === 'Pro' ? '$7.50' : `$${(tokenCount * 0.25).toFixed(2)}`)}
                                        </span>
                                    </div>
                                </div>

                                {/* Payment Fields based on method */}
                                <form onSubmit={handlePay}>
                                    {checkoutMethod === 'card' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <div>
                                                <label className="label">{t('billing_checkout_card_num', 'Номер карты')}</label>
                                                <input 
                                                    className="field" 
                                                    placeholder="XXXX XXXX XXXX XXXX" 
                                                    maxLength="19" 
                                                    value={cardNumber}
                                                    onChange={e => {
                                                        const val = e.target.value.replace(/\D/g, '');
                                                        const formatted = val.match(/.{1,4}/g)?.join(' ') || '';
                                                        setCardNumber(formatted);
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="label">{t('billing_checkout_card_holder', 'Имя владельца')}</label>
                                                <input 
                                                    className="field" 
                                                    placeholder="IVAN IVANOV" 
                                                    style={{ textTransform: 'uppercase' }}
                                                    value={cardHolder}
                                                    onChange={e => setCardHolder(e.target.value)}
                                                />
                                            </div>
                                            <div className="card-input-grid">
                                                <div>
                                                    <label className="label">{t('billing_checkout_expiry', 'Срок действия')}</label>
                                                    <input 
                                                        className="field" 
                                                        placeholder="MM/YY" 
                                                        maxLength="5" 
                                                        value={cardExpiry}
                                                        onChange={e => {
                                                            let val = e.target.value.replace(/\D/g, '');
                                                            if (val.length > 2) {
                                                                val = val.substring(0, 2) + '/' + val.substring(2, 4);
                                                            }
                                                            setCardExpiry(val);
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="label">{t('billing_checkout_cvc', 'CVC-код')}</label>
                                                    <input 
                                                        className="field" 
                                                        type="password" 
                                                        placeholder="•••" 
                                                        maxLength="3" 
                                                        value={cardCvc}
                                                        onChange={e => setCardCvc(e.target.value.replace(/\D/g, ''))}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {checkoutMethod === 'gpay' && (
                                        <div className="gpay-sheet">
                                            <div className="gpay-sim-card">
                                                <div className="gpay-sim-logo">
                                                    <Icon name="google" size={16} /> Pay
                                                </div>
                                                <div className="gpay-sim-chip"></div>
                                                <div className="gpay-sim-number">•••• •••• •••• 4242</div>
                                                <div className="gpay-sim-footer">
                                                    <span>Google Account Card</span>
                                                    <span>12 / 28</span>
                                                </div>
                                            </div>
                                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 16px' }}>
                                                {t('gpay_prompt', 'Оплатить с помощью карты по умолчанию в вашем Google аккаунте')}
                                            </p>
                                        </div>
                                    )}

                                    {checkoutMethod === 'paypal' && (
                                        <div className="paypal-dialog">
                                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                                                <div style={{ fontSize: 24, fontWeight: 800, italic: 'true', color: '#003087', display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <Icon name="paypal" size={24} style={{ color: '#0079C1' }} />
                                                    <span style={{ color: '#003087' }}>Pay</span><span style={{ color: '#0079C1' }}>Pal</span>
                                                </div>
                                            </div>
                                            <div className="paypal-input-group">
                                                <label className="label">{t('email_label', 'Электронная почта')}</label>
                                                <input 
                                                    className="field" 
                                                    type="email" 
                                                    placeholder="paypal-buyer@turbo.ai" 
                                                    value={paypalEmail}
                                                    onChange={e => setPaypalEmail(e.target.value)}
                                                />
                                            </div>
                                            <div className="paypal-input-group">
                                                <label className="label">{t('password_label', 'Пароль')}</label>
                                                <input 
                                                    className="field" 
                                                    type="password" 
                                                    placeholder="••••••••" 
                                                    value={paypalPassword}
                                                    onChange={e => setPaypalPassword(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                                        <button type="button" className="btn btn--sm" style={{ flex: 1, background: 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)' }} onClick={() => setCheckoutPlan(null)}>
                                            {t('billing_checkout_btn_cancel', 'Отмена')}
                                        </button>
                                        <button type="submit" className="btn btn--primary btn--sm" style={{ flex: 1 }}>
                                            {t('billing_checkout_btn_pay', 'Оплатить')}
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}

                        {paymentStatus === 'processing' && (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <div className="billing-spinner"></div>
                                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>{t('processing_payment', 'Обработка транзакции...')}</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                                    {t('do_not_close_window', 'Пожалуйста, не закрывайте это окно')}
                                </p>
                            </div>
                        )}

                        {paymentStatus === 'success' && (
                            <div className="success-checkmark-wrapper">
                                <div className="checkmark-circle">
                                    <svg className="checkmark-svg" viewBox="0 0 52 52">
                                        <path className="checkmark-path" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                                    </svg>
                                </div>
                                <h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: 'var(--accent-success)' }}>
                                    {t('payment_successful', 'Оплата прошла успешно!')}
                                </h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', margin: '0 0 24px', padding: '0 16px' }}>
                                    {checkoutPlan === 'Tokens' 
                                        ? t('billing_success_tokens', { count: tokenCount })
                                        : t('billing_success_sub', { plan: checkoutPlan })}
                                </p>
                                <button className="btn btn--primary btn--sm" style={{ minWidth: 140 }} onClick={() => setCheckoutPlan(null)}>
                                    {t('done_btn', 'Готово')}
                                </button>
                            </div>
                        )}

                        {paymentStatus === 'error' && (
                            <div style={{ textAlign: 'center', padding: '30px 0' }}>
                                <Icon name="alert_circle" size={48} style={{ color: 'var(--accent-error)', marginBottom: 16 }} />
                                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--accent-error)' }}>
                                    {t('payment_error_title', 'Ошибка оплаты')}
                                </h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: '0 0 24px' }}>
                                    {t('payment_error_desc', 'Произошла непредвиденная ошибка при списании средств. Попробуйте еще раз.')}
                                </p>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                    <button className="btn btn--sm" style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)' }} onClick={() => setCheckoutPlan(null)}>
                                        {t('close_btn', 'Закрыть')}
                                    </button>
                                    <button className="btn btn--primary btn--sm" onClick={() => setPaymentStatus('idle')}>
                                        {t('retry_btn', 'Повторить')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <Footer />
        </div>
    );
}