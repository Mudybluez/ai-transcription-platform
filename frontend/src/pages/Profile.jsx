import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import './Extras.css';
import { useTranslation } from 'react-i18next';

const Profile = () => {
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

    const { t, i18n } = useTranslation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    const user = {
        id: localStorage.getItem('userId'),
        username: localStorage.getItem('username') || 'Студент',
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
            
            // Также запросим свежий профиль для обновления роли в реальном времени
            const profileRes = await api.get(`/users/profile/${user.id}`);
            if (profileRes.data && profileRes.data.role) {
                localStorage.setItem('role', profileRes.data.role);
                setUserRole(profileRes.data.role);
            }
            
            const lastDate = historyRes.data.length > 0 
                ? new Date(historyRes.data[0].created_at).toLocaleDateString('ru-RU')
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
            setOldPassword(''); setNewPassword('');
        } catch (error) {
            alert(error.response?.data?.message || "Ошибка");
        } finally {
            setIsChanging(false);
        }
    };

    const clearHistory = async () => {
        if (!window.confirm(t('confirm_clear_all'))) return;
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
            // Форсируем обновление страницы для применения изменений везде
            window.location.reload();
        } catch (error) {
            alert(error.response?.data?.message || t('error_alert', 'Ошибка'));
        } finally {
            setIsUpdatingUsername(false);
        }
    };

    return (
        <div className="dashboard-container fade-in">
            <header className="top-nav">
                <Link to="/" className="logo" style={{textDecoration: 'none'}}>{t('app_name')}</Link>
                <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                    <select 
                        className="lang-switcher" 
                        onChange={(e) => changeLanguage(e.target.value)} 
                        value={i18n.language}
                    >
                        <option value="en">EN</option>
                        <option value="ru">RU</option>
                        <option value="kk">KK</option>
                    </select>
                    <Link to="/" className="nav-link">{t('back_btn')}</Link>
                </div>
            </header>

            <div className="profile-grid fade-in-up">
                <div className="profile-main-card">
                    <div className="profile-avatar">{user.username.charAt(0).toUpperCase()}</div>
                    <h2>{user.username}</h2>
                    <p className="profile-email">{user.email}</p>
                    <div className={`role-badge-nav role-badge-${userRole.toLowerCase()}`} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '12px', margin: '0 auto 30px auto' }}>
                        {userRole === 'admin' ? 'Admin' : userRole}
                    </div>

                    <div className="profile-stats">
                        <div className="stat-box">
                            <span className="stat-number">{stats.totalAnalyzed}</span>
                            <span className="stat-label">{t('stats_analyzed')}</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-number">{stats.totalWords}</span>
                            <span className="stat-label">{t('stats_words')}</span>
                        </div>
                    </div>

                    <div className="user-lang-stats">
                        <h4>{t('lang_content')}</h4>
                        {stats.languages.map((l, i) => (
                            <div key={i} className="lang-row">
                                <span>{l.lang === 'ru' ? 'Русский' : l.lang === 'en' ? 'English' : 'Қазақша'}</span>
                                <strong>{l.count}</strong>
                            </div>
                        ))}
                    </div>

                    <div style={{marginTop: '30px'}}>
                        <button className="action-btn block-btn" onClick={clearHistory}>{t('clear_history_btn')}</button>
                    </div>
                </div>

                <div className="profile-settings-card">
                    <h3>{t('profile_settings', 'Настройки профиля')}</h3>
                    <form onSubmit={handleUpdateUsername} className="settings-form" style={{marginBottom: '30px'}}>
                        <div className="form-group">
                            <label>{t('username_label', 'Имя пользователя')}</label>
                            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="yt-input" />
                        </div>
                        <button type="submit" className="btn-primary" disabled={isUpdatingUsername}>
                            {isUpdatingUsername ? t('btn_loading') : t('save_btn', 'Сохранить')}
                        </button>
                    </form>

                    <hr style={{borderColor: 'rgba(255,255,255,0.1)', marginBottom: '30px'}} />

                    <h3>{t('security_title')}</h3>
                    <form onSubmit={handleChangePassword} className="settings-form">
                        <div className="form-group">
                            <label>{t('old_password')}</label>
                            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="yt-input" />
                        </div>
                        <div className="form-group">
                            <label>{t('new_password')}</label>
                            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="yt-input" />
                        </div>
                        <button type="submit" className="btn-primary" disabled={isChanging}>
                            {isChanging ? t('btn_loading') : t('update_password_btn')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Profile;