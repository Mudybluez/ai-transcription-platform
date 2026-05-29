import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from '../components/Icon';
import NotificationsBell from '../components/NotificationsBell';

const NavItems = ({
    userRole,
    changeLanguage,
    i18n,
    setIsMobileMenuOpen,
    t
}) => {
    return (
        <>
            <span className={`role-badge-nav role-badge-${userRole.toLowerCase()}`}>
                Admin
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

export default function AdminPanel() {
    const { t, i18n } = useTranslation();
    const role = localStorage.getItem('role');
    const userRole = role || 'admin';
    const currentLang = (i18n.language || 'ru').split('-')[0].toLowerCase();

    // Active views
    const [activeTab, setActiveTab] = useState('dashboard');
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState({
        totalTranscriptions: 0,
        totalUsers: 0,
        totalChars: 0,
        totalWords: 0,
        total24h: 0,
        dailyActivity: [],
        langDistribution: []
    });
    const [proxyStats, setProxyStats] = useState({
        spentBytes: 0,
        limitBytes: 0,
        spentMB: 0,
        limitMB: 0,
        percentUsed: 0,
        source: 'placeholder'
    });
    
    // Transcriptions and Feedbacks
    const [analyses, setAnalyses] = useState([]);
    const [selectedAnalyses, setSelectedAnalyses] = useState([]);
    const [activeAnalysis, setActiveAnalysis] = useState(null);
    const [modalTab, setModalTab] = useState('rendered');

    const [customRequestsInput, setCustomRequestsInput] = useState({});
    const [feedbacks, setFeedbacks] = useState([]);
    const [selectedFeedback, setSelectedFeedback] = useState(null);
    const [adminReplyText, setAdminReplyText] = useState('');
    const [isSubmittingReply, setIsSubmittingReply] = useState(false);

    // Filter and search
    const [userFilter, setUserFilter] = useState('all'); // all, pro, banned
    const [userSearch, setUserSearch] = useState('');
    const [hoverActivityBar, setHoverActivityBar] = useState(null);
    const [hoverLangBar, setHoverLangBar] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const fetchAdminFeedbacks = async () => {
        try {
            const response = await api.get('/feedbacks');
            setFeedbacks(response.data);
        } catch (error) {
            console.error("Ошибка загрузки отзывов:", error);
        }
    };

    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!adminReplyText.trim() || !selectedFeedback) return;

        setIsSubmittingReply(true);
        try {
            await api.post(`/feedbacks/${selectedFeedback.id}/reply`, {
                replyText: adminReplyText
            });
            alert(t('feedback_success_alert', 'Ответ успешно отправлен!'));
            setAdminReplyText('');
            setSelectedFeedback(null);
            await fetchAdminFeedbacks();
        } catch (error) {
            alert(error.response?.data?.message || t('server_error'));
        } finally {
            setIsSubmittingReply(false);
        }
    };

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    const fetchTabDependencies = async () => {
        if (role !== 'admin') return;

        try {
            if (activeTab === 'dashboard') {
                const statsRes = await api.get('/search/admin/stats');
                setStats(statsRes.data);

                const proxyRes = await api.get('/search/admin/proxy-stats');
                setProxyStats(proxyRes.data);
            } else if (activeTab === 'users') {
                const usersRes = await api.get('/users/all');
                setUsers(usersRes.data);
                
                const inputs = {};
                usersRes.data.forEach(u => {
                    inputs[u.id] = u.custom_requests || 0;
                });
                setCustomRequestsInput(inputs);
            } else if (activeTab === 'library') {
                const transRes = await api.get('/search/admin/transcriptions');
                setAnalyses(transRes.data);
                setSelectedAnalyses([]);
            } else if (activeTab === 'feedback') {
                await fetchAdminFeedbacks();
            }
        } catch (error) {
            console.error("Ошибка при получении данных панели администратора:", error);
        }
    };

    useEffect(() => {
        fetchTabDependencies();
    }, [activeTab, role]);

    if (role !== 'admin') {
        return <Navigate to="/" />;
    }

    // USER ACTIONS
    const handleRoleChange = async (userId, newRole) => {
        try {
            const res = await api.post('/users/update-role', { userId, newRole });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
            
            const currentUserId = localStorage.getItem('userId');
            if (String(userId) === String(currentUserId)) {
                localStorage.setItem('role', newRole);
                if (newRole !== 'admin') {
                    window.location.href = '/';
                }
            }
            alert(res.data.message || "Роль успешно обновлена");
        } catch (error) {
            alert(error.response?.data?.message || "Не удалось обновить роль");
        }
    };

    const handleAwardCustomRequests = async (userId) => {
        const value = parseInt(customRequestsInput[userId]);
        if (isNaN(value) || value < 0) {
            alert("Заполните корректно поле кастомных запросов");
            return;
        }

        try {
            const res = await api.post('/users/update-custom-requests', { userId, customRequests: value });
            setUsers(prev => prev.map(u => {
                if (u.id === userId) {
                    const requestsLast12h = u.requests_last_12h || 0;
                    const baseLimit = u.role === 'Lite' ? 10 : 2;
                    const remaining = u.role === 'Pro' || u.role === 'admin' 
                        ? 'Unlimited' 
                        : Math.max(0, baseLimit - requestsLast12h) + value;

                    return { ...u, custom_requests: value, remaining_requests: remaining };
                }
                return u;
            }));
            alert(res.data.message || "Кастомные лимиты обновлены");
        } catch (error) {
            alert(error.response?.data?.message || "Не удалось сохранить изменения");
        }
    };

    const handleModerateUser = async (userId, action, durationHours = 24) => {
        try {
            const res = await api.post('/users/moderate-user', { userId, action, durationHours });
            setUsers(prev => prev.map(u => {
                if (u.id === userId) {
                    if (action === 'perm_ban') {
                        return { ...u, is_permanently_banned: true, banned_until: null };
                    } else if (action === 'temp_ban') {
                        const bannedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);
                        return { ...u, is_permanently_banned: false, banned_until: bannedUntil.toISOString() };
                    } else if (action === 'unban') {
                        return { ...u, is_permanently_banned: false, banned_until: null };
                    }
                }
                return u;
            }));
            alert(res.data.message || "Модерация успешно выполнена");
        } catch (error) {
            alert(error.response?.data?.message || "Не удалось применить действие");
        }
    };

    const triggerTempBan = (userId) => {
        const hoursStr = prompt("Введите время блокировки в часах (например, 24):", "24");
        if (hoursStr === null) return;
        const hours = parseInt(hoursStr);
        if (isNaN(hours) || hours <= 0) {
            alert("Неверный формат времени.");
            return;
        }
        handleModerateUser(userId, 'temp_ban', hours);
    };

    // LIBRARY TRANSCRIPTIONS ACTIONS
    const toggleSelectAnalysis = (id) => {
        setSelectedAnalyses(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const toggleSelectAllAnalyses = () => {
        if (selectedAnalyses.length === analyses.length) {
            setSelectedAnalyses([]);
        } else {
            setSelectedAnalyses(analyses.map(a => a.id));
        }
    };

    const handleDeleteAnalysis = async (id) => {
        if (!confirm(t('admin_lib_confirm_delete', 'Удалить этот разбор конспекта навсегда?'))) return;

        try {
            await api.delete(`/history/${id}`);
            setAnalyses(prev => prev.filter(a => a.id !== id));
            setSelectedAnalyses(prev => prev.filter(item => item !== id));
        } catch (error) {
            alert(t('server_error'));
        }
    };

    const handleDeleteSelectedAnalyses = async () => {
        if (selectedAnalyses.length === 0) return;
        if (!confirm("Удалить выбранные разборы?")) return;

        try {
            const res = await api.delete('/search/admin/transcriptions/bulk', { data: { ids: selectedAnalyses } });
            setAnalyses(prev => prev.filter(a => !selectedAnalyses.includes(a.id)));
            setSelectedAnalyses([]);
            alert(res.data.message || "Разборы удалены");
        } catch (error) {
            alert(t('server_error'));
        }
    };

    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[i18n.language] || obj['ru'] || '';
    };

    // Filtered user list
    const filteredUsers = users.filter(u => {
        const matchesSearch = u.username.toLowerCase().includes(userSearch.toLowerCase()) || 
                              u.email.toLowerCase().includes(userSearch.toLowerCase());
        
        const isBanned = u.is_permanently_banned || (u.banned_until && new Date(u.banned_until) > new Date());
        
        if (userFilter === 'banned') return matchesSearch && isBanned;
        if (userFilter === 'pro') return matchesSearch && (u.role === 'Pro' || u.role === 'admin');
        return matchesSearch;
    });

    const maxActivity = stats.dailyActivity.length > 0 ? Math.max(...stats.dailyActivity.map(d => d.count), 1) : 1;
    const maxLangs = stats.langDistribution.length > 0 ? Math.max(...stats.langDistribution.map(d => d.count), 1) : 1;

    return (
        <div className="dashboard-container fade-in" style={{ paddingBottom: 80 }}>
            {/* Header */}
            <header className="top-nav">
                <button className="hamburger" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
                <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src="/logo.webp" alt="Logo" style={{ width: 72, height: 72, objectFit: 'contain' }} />
                    <span>AI Transcription Panel</span>
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

            {/* Mobile Nav Drawer */}
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

            {/* Navigation Tabs */}
            <div className="page" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                <div className="tabs" style={{ margin: '32px 0 24px' }}>
                    <button className={`tab ${activeTab === 'dashboard' ? 'is-active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <Icon name="bar_chart" size={14} />
                        {t('admin_tab_dashboard', 'Аналитика')}
                    </button>
                    <button className={`tab ${activeTab === 'users' ? 'is-active' : ''}`} onClick={() => setActiveTab('users')}>
                        <Icon name="users" size={14} />
                        {t('admin_tab_users', 'Пользователи')}
                    </button>
                    <button className={`tab ${activeTab === 'library' ? 'is-active' : ''}`} onClick={() => setActiveTab('library')}>
                        <Icon name="library" size={14} />
                        {t('admin_tab_library', 'Библиотека разборов')}
                    </button>
                    <button className={`tab ${activeTab === 'feedback' ? 'is-active' : ''}`} onClick={() => setActiveTab('feedback')}>
                        <Icon name="message_square" size={14} />
                        {t('feedback_nav', 'Отзывы')}
                    </button>
                </div>

                {/* ==================== 1. ANALYTICS TAB ==================== */}
                {activeTab === 'dashboard' && (
                    <div className="fade-in">
                        {/* KPI Cards Grid */}
                        <div className="kpi-row" style={{ marginBottom: 32 }}>
                            <div className="kpi">
                                <div className="kpi__head">
                                    <Icon name="users" size={14} />
                                    <Icon name="more" size={14} />
                                </div>
                                <div className="kpi__num">{stats.totalUsers}</div>
                                <div className="kpi__label">Пользователей в ИИ</div>
                                <div className="kpi__delta">
                                    <Icon name="trending_up" size={12} />
                                    Активно
                                </div>
                            </div>
                            <div className="kpi">
                                <div className="kpi__head">
                                    <Icon name="zap" size={14} />
                                    <Icon name="more" size={14} />
                                </div>
                                <div className="kpi__num">{stats.total24h}</div>
                                <div className="kpi__label">Запросов за 24 часа</div>
                                <div className="kpi__delta">
                                    <Icon name="trending_up" size={12} />
                                    Пик темпа
                                </div>
                            </div>
                            <div className="kpi">
                                <div className="kpi__head">
                                    <Icon name="file_text" size={14} />
                                    <Icon name="more" size={14} />
                                </div>
                                <div className="kpi__num">{(stats.totalChars / 1024 / 1024).toFixed(1)} MB</div>
                                <div className="kpi__label">{stats.totalWords.toLocaleString()} слов ИИ всего</div>
                                <div className="kpi__delta">
                                    <Icon name="trending_up" size={12} />
                                    Накоплено
                                </div>
                            </div>
                        </div>

                        {/* Traffic Proxy Limit Widget */}
                        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Использование Астропрокси</h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, margin: '4px 0 0' }}>Для скачивания и инференса</p>
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600 }}>
                                    {proxyStats.spentMB} MB из {proxyStats.limitMB} MB
                                </span>
                            </div>
                            <div style={{ height: 8, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                                <div 
                                    style={{ 
                                        height: '100%', 
                                        width: `${Math.min(proxyStats.percentUsed, 100)}%`, 
                                        background: 'var(--accent-primary)',
                                        borderRadius: 99,
                                        transition: 'width .8s var(--ease-out)'
                                    }} 
                                />
                            </div>
                        </div>

                        {/* Col Bar Charts */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 32 }}>
                            {/* Weekly Activity */}
                            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24 }}>
                                <h3 style={{ margin: '0 0 24px', fontSize: 15, fontWeight: 600 }}>Активность за неделю</h3>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
                                    {stats.dailyActivity.map((d, i) => {
                                        const isDim = hoverActivityBar !== null && hoverActivityBar !== i;
                                        const h = (d.count / maxActivity) * 130;
                                        return (
                                            <div
                                                key={i}
                                                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                                                onMouseEnter={() => setHoverActivityBar(i)}
                                                onMouseLeave={() => setHoverActivityBar(null)}
                                            >
                                                <div style={{ position: 'relative', width: '100%', height: 130, display: 'flex', alignItems: 'flex-end' }}>
                                                    {hoverActivityBar === i && (
                                                        <div style={{
                                                            position: 'absolute', bottom: h + 6, left: '50%', transform: 'translateX(-50%)',
                                                            background: 'var(--bg-surface-hover)', border: '1px solid var(--border-medium)',
                                                            borderRadius: 6, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10
                                                        }}>
                                                            {d.count} запросов
                                                        </div>
                                                    )}
                                                    <div style={{
                                                        width: '100%', height: Math.max(h, 4),
                                                        background: hoverActivityBar === i ? 'var(--accent-primary)' : 'rgba(138, 180, 248, 0.7)',
                                                        opacity: isDim ? 0.25 : 1,
                                                        borderRadius: '4px 4px 0 0',
                                                        transition: 'all .2s var(--ease-out)',
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.day?.slice(-5) || ''}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Languages Distribution */}
                            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24 }}>
                                <h3 style={{ margin: '0 0 24px', fontSize: 15, fontWeight: 600 }}>Распределение языков</h3>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 160, padding: '0 24px' }}>
                                    {stats.langDistribution.map((d, i) => {
                                        const isDim = hoverLangBar !== null && hoverLangBar !== i;
                                        const h = (d.count / maxLangs) * 130;
                                        const displayLabel = d.label === 'ru' ? 'Русский' : d.label === 'en' ? 'English' : d.label === 'kk' ? 'Қазақ' : String(d.label).toUpperCase();
                                        return (
                                            <div
                                                key={i}
                                                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                                                onMouseEnter={() => setHoverLangBar(i)}
                                                onMouseLeave={() => setHoverLangBar(null)}
                                            >
                                                <div style={{ position: 'relative', width: '100%', height: 130, display: 'flex', alignItems: 'flex-end' }}>
                                                    {hoverLangBar === i && (
                                                        <div style={{
                                                            position: 'absolute', bottom: h + 6, left: '50%', transform: 'translateX(-50%)',
                                                            background: 'var(--bg-surface-hover)', border: '1px solid var(--border-medium)',
                                                            borderRadius: 6, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10
                                                        }}>
                                                            {d.count} разборов
                                                        </div>
                                                    )}
                                                    <div style={{
                                                        width: '100%', height: Math.max(h, 4),
                                                        background: hoverLangBar === i ? 'var(--accent-secondary)' : 'rgba(196, 198, 255, 0.7)',
                                                        opacity: isDim ? 0.25 : 1,
                                                        borderRadius: '4px 4px 0 0',
                                                        transition: 'all .2s var(--ease-out)',
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{displayLabel}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ==================== 2. USERS TAB ==================== */}
                {activeTab === 'users' && (
                    <div className="fade-in">
                        {/* Filters and search row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {[
                                    { id: 'all', label: 'Все' },
                                    { id: 'pro', label: 'Pro+' },
                                    { id: 'banned', label: 'Заблокированы' }
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        className={`btn btn--sm ${userFilter === f.id ? 'btn--ghost' : 'btn--quiet'}`}
                                        style={{ borderColor: userFilter === f.id ? 'var(--border-medium)' : 'transparent' }}
                                        onClick={() => setUserFilter(f.id)}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ position: 'relative', width: 220 }}>
                                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>
                                    <Icon name="search" size={13} />
                                </span>
                                <input
                                    className="field"
                                    placeholder="Поиск по имени/email..."
                                    style={{ height: 32, fontSize: 13, padding: '0 12px 0 30px' }}
                                    value={userSearch}
                                    onChange={e => setUserSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="tbl-wrap">
                            <table className="tbl">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Пользователь</th>
                                        <th>Роль</th>
                                        <th>Кастомные лимиты</th>
                                        <th>Осталось запросов</th>
                                        <th>Статус</th>
                                        <th style={{ textAlign: 'right' }}>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map(user => {
                                        const isBanned = user.is_permanently_banned || (user.banned_until && new Date(user.banned_until) > new Date());
                                        const avatarChar = user.username ? user.username.charAt(0).toUpperCase() : 'U';

                                        return (
                                            <tr key={user.id} style={{ background: isBanned ? 'rgba(242, 139, 130, 0.03)' : 'transparent' }}>
                                                <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>#{user.id}</span></td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div className="tbl__avatar">{avatarChar}</div>
                                                        <div>
                                                            <div className="tbl__name">{user.username}</div>
                                                            <div className="tbl__email">{user.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <select
                                                        className="field"
                                                        style={{ height: 28, fontSize: 12, padding: '0 8px', width: 110 }}
                                                        value={user.role}
                                                        onChange={e => handleRoleChange(user.id, e.target.value)}
                                                    >
                                                        <option value="Standard">Standard</option>
                                                        <option value="Lite">Lite</option>
                                                        <option value="Pro">Pro</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    {user.role !== 'Pro' && user.role !== 'admin' ? (
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            <input 
                                                                type="number"
                                                                className="field"
                                                                style={{ height: 28, fontSize: 12, width: 70, textAlign: 'center', padding: 0 }}
                                                                value={customRequestsInput[user.id] !== undefined ? customRequestsInput[user.id] : 0}
                                                                onChange={e => setCustomRequestsInput({...customRequestsInput, [user.id]: e.target.value})}
                                                            />
                                                            <button className="btn btn--ghost btn--sm" style={{ height: 28 }} onClick={() => handleAwardCustomRequests(user.id)}>
                                                                ОК
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span style={{ fontWeight: 600, color: user.remaining_requests === 'Unlimited' ? 'var(--accent-secondary)' : 'var(--text-primary)' }}>
                                                        {user.remaining_requests}
                                                    </span>
                                                </td>
                                                <td>
                                                    {isBanned ? (
                                                         <span className="chip chip--red">Banned</span>
                                                    ) : (
                                                         <span className="chip chip--green">Active</span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                        {isBanned ? (
                                                            <button className="btn btn--ghost btn--sm" style={{ height: 28 }} onClick={() => handleModerateUser(user.id, 'unban')}>
                                                                Разбанить
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <button className="btn btn--danger btn--sm" style={{ height: 28 }} onClick={() => triggerTempBan(user.id)}>
                                                                    Временный бан
                                                                </button>
                                                                <button className="btn btn--danger btn--sm" style={{ height: 28, background: 'rgba(242, 139, 130, 0.15)' }} onClick={() => handleModerateUser(user.id, 'perm_ban')}>
                                                                    Перм. бан
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ==================== 3. LIBRARY TRANSCRIPTIONS TAB ==================== */}
                {activeTab === 'library' && (
                    <div className="fade-in">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={analyses.length > 0 && selectedAnalyses.length === analyses.length}
                                    onChange={toggleSelectAllAnalyses}
                                    style={{ width: 16, height: 16, accentColor: 'var(--accent-primary)' }}
                                />
                                <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>Выделить все на этой странице</span>
                            </div>
                            {selectedAnalyses.length > 0 && (
                                <button className="btn btn--danger btn--sm" onClick={handleDeleteSelectedAnalyses}>
                                    <Icon name="trash" size={13} />
                                    Удалить выбранные ({selectedAnalyses.length})
                                </button>
                            )}
                        </div>

                        {/* Transcriptions Table */}
                        <div className="tbl-wrap">
                            <table className="tbl">
                                <thead>
                                    <tr>
                                        <th style={{ width: 40 }}></th>
                                        <th>ID</th>
                                        <th>Название разбора</th>
                                        <th>Язык</th>
                                        <th>Создан</th>
                                        <th style={{ textAlign: 'right' }}>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analyses.map(item => {
                                        const analysis = typeof item.structured_analysis === 'string'
                                            ? JSON.parse(item.structured_analysis)
                                            : item.structured_analysis;
                                        const title = analysis ? getLangText(analysis.title) : `Analysis #${item.job_id}`;
                                        
                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedAnalyses.includes(item.id)}
                                                        onChange={() => toggleSelectAnalysis(item.id)}
                                                        style={{ width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
                                                    />
                                                </td>
                                                <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>#{item.id}</span></td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>{title}</span>
                                                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>ID задачи: {item.job_id}</span>
                                                    </div>
                                                </td>
                                                <td><span className="card__lang" style={{ textTransform: 'uppercase' }}>{item.language || 'ru'}</span></td>
                                                <td><span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{new Date(item.created_at).toLocaleDateString()}</span></td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                        <button className="btn btn--ghost btn--sm" style={{ height: 28 }} onClick={() => setActiveAnalysis(item)}>
                                                            Просмотр
                                                        </button>
                                                        <button className="btn btn--danger btn--sm" style={{ height: 28 }} onClick={() => handleDeleteAnalysis(item.id)}>
                                                            Удалить
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ==================== 4. FEEDBACKS TAB ==================== */}
                {activeTab === 'feedback' && (
                    <div className="fade-in">
                        <div className="tbl-wrap">
                            <table className="tbl">
                                <thead>
                                    <tr>
                                        <th>Оценка</th>
                                        <th>Отзыв пользователя</th>
                                        <th>Почта автора</th>
                                        <th>Дата создания</th>
                                        <th style={{ textAlign: 'right' }}>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {feedbacks.map(fb => (
                                        <tr key={fb.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            <td>
                                                <span className={`chip ${
                                                    fb.rating === 'Good' || fb.rating === 'Fine'
                                                        ? 'chip--green'
                                                        : fb.rating === 'Okay'
                                                            ? 'chip--yellow'
                                                            : 'chip--red'
                                                }`}>
                                                    {fb.rating}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-primary)', wordBreak: 'break-word', fontWeight: 500 }}>
                                                        {fb.message}
                                                    </p>
                                                    {fb.reply && (
                                                        <div style={{ padding: '6px 12px', background: 'var(--bg-surface-hover)', borderRadius: 6, fontSize: 11.5, color: 'var(--accent-primary)', marginTop: 4 }}>
                                                            <strong>Ответ:</strong> {typeof fb.reply === 'object' && fb.reply !== null ? fb.reply.text : String(fb.reply)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fb.user_email || fb.userEmail || 'student@turbo.ai'}</span></td>
                                            <td><span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{new Date(fb.created_at || fb.createdAt || Date.now()).toLocaleDateString()}</span></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn btn--ghost btn--sm" style={{ height: 28 }} onClick={() => setSelectedFeedback(fb)}>
                                                    Ответить
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Analysis preview popup modal */}
            {activeAnalysis && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setActiveAnalysis(null)}>
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-medium)', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '85vh', overflow: 'hidden', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Просмотр конспекта разбора</h2>
                            <button style={{ color: 'var(--text-secondary)', fontSize: 20 }} onClick={() => setActiveAnalysis(null)}>×</button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border-subtle)', marginBottom: 16 }}>
                            <button className={`btn btn--sm ${modalTab === 'rendered' ? 'btn--ghost' : 'btn--quiet'}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} onClick={() => setModalTab('rendered')}>Конспект</button>
                            <button className={`btn btn--sm ${modalTab === 'raw' ? 'btn--ghost' : 'btn--quiet'}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} onClick={() => setModalTab('raw')}>Исходный текст</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
                            {modalTab === 'rendered' ? (
                                <div className="prose">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(JSON.parse(activeAnalysis.structured_analysis || '{}').summary)}
                                    </ReactMarkdown>
                                    <hr style={{ borderColor: 'var(--border-subtle)', margin: '24px 0' }} />
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(JSON.parse(activeAnalysis.structured_analysis || '{}').detailed_analysis)}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <div className="prose" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                                    {activeAnalysis.raw_text}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Feedback Response Reply popup overlay */}
            {selectedFeedback && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSelectedFeedback(null)}>
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-medium)', borderRadius: 14, width: '100%', maxWidth: 450, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Написать ответ администратора</h2>
                            <button style={{ color: 'var(--text-secondary)', fontSize: 20 }} onClick={() => setSelectedFeedback(null)}>×</button>
                        </div>
                        <div style={{ padding: 12, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                            "{selectedFeedback.message}"
                        </div>
                        <form onSubmit={handleSendReply}>
                            <textarea
                                className="field"
                                rows={4}
                                style={{ height: 'auto', padding: 12, resize: 'vertical', fontFamily: 'var(--font-body)', marginBottom: 20 }}
                                placeholder="Введите ваш ответ..."
                                value={adminReplyText}
                                onChange={e => setAdminReplyText(e.target.value)}
                                required
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedFeedback(null)}>Отмена</button>
                                <button type="submit" className="btn btn--primary btn--sm" disabled={isSubmittingReply}>
                                    {isSubmittingReply ? 'Отправка...' : 'Отправить ответ'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}