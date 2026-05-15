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
                    <div className="role-badge">{user.role === 'admin' ? t('admin_panel') : t('user_role_pro')}</div>

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