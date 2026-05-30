import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import NotificationsBell from '../components/NotificationsBell';

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
            if (profileRes.data && profileRes.data.role) {
                localStorage.setItem('role', profileRes.data.role);
                setUserRole(profileRes.data.role);
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
        if (!newUsername || newUsername.trim() === '') {
            alert(t('fill_fields_alert', 'Заполните поля'));
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

    return (
        <div className="dashboard-container fade-in">
            {/* Navigation Header */}
            <header className="top-nav">
                <button className="hamburger" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
                <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <img src="/logo.webp" alt="Logo" style={{ width: 88, height: 88, objectFit: 'contain' }} />
                    <span>ZenScribe</span>
                </div>
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
        </div>
    );
}