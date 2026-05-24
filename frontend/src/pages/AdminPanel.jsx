import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api';
import './Extras.css';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Компонент для отрисовки графиков через SVG с улучшенным градиентным дизайном
const PremiumBarChart = ({ data, title, colorStart = "#6366f1", colorEnd = "#a855f7" }) => {
    const { t } = useTranslation();
    if (!data || data.length === 0) return <div className="admin-no-data-msg">{t('admin_no_data')}</div>;
    
    const maxVal = Math.max(...data.map(d => d.count), 1);
    const height = 160;
    const width = 320;
    const barWidth = (width / data.length) - 8;

    const getLabel = (d) => {
        if (d.day) return d.day.slice(-5); // MM-DD
        if (d.label === 'ru') return 'RU';
        if (d.label === 'en') return 'EN';
        if (d.label === 'kk') return 'KK';
        return String(d.label).toUpperCase();
    };

    return (
        <div className="chart-container" style={{ width: '100%', maxWidth: '360px', margin: '0 auto' }}>
            <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#cbd5e1', marginBottom: '20px', textAlign: 'center', letterSpacing: '0.5px' }}>{title}</h4>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
                <defs>
                    <linearGradient id={`grad-${title.replace(/\s+/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={colorStart} />
                        <stop offset="100%" stopColor={colorEnd} />
                    </linearGradient>
                    <filter id="shadow">
                        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={colorStart} floodOpacity="0.3" />
                    </filter>
                </defs>
                {data.map((d, i) => {
                    const barHeight = (d.count / maxVal) * (height - 40);
                    const x = i * (barWidth + 8);
                    const y = height - barHeight - 20;
                    return (
                        <g key={i} className="chart-bar-group">
                            <rect 
                                x={x} 
                                y={y} 
                                width={barWidth} 
                                height={barHeight} 
                                fill={`url(#grad-${title.replace(/\s+/g, '')})`}
                                rx="6"
                                filter="url(#shadow)"
                                style={{ transition: 'all 0.5s ease-in-out' }}
                            />
                            {/* Значение над столбцом */}
                            <text
                                x={x + barWidth / 2}
                                y={y - 6}
                                fontSize="10"
                                fontWeight="bold"
                                fill="#e2e8f0"
                                textAnchor="middle"
                            >
                                {d.count}
                            </text>
                            {/* Подпись снизу */}
                            <text 
                                x={x + barWidth / 2} 
                                y={height - 4} 
                                fontSize="10" 
                                fill="#94a3b8" 
                                textAnchor="middle"
                            >
                                {getLabel(d)}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

const AdminPanel = () => {
    const { t, i18n } = useTranslation();
    const role = localStorage.getItem('role');

    // Состояния вкладок и данных
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
    
    // Состояния для Библиотеки разборов
    const [analyses, setAnalyses] = useState([]);
    const [selectedAnalyses, setSelectedAnalyses] = useState([]);
    const [activeAnalysis, setActiveAnalysis] = useState(null);
    const [modalTab, setModalTab] = useState('rendered');

    // Хранение вводимых вручную лимитов для каждого пользователя
    const [customRequestsInput, setCustomRequestsInput] = useState({});

    // Feedback admin states
    const [feedbacks, setFeedbacks] = useState([]);
    const [selectedFeedback, setSelectedFeedback] = useState(null);
    const [adminReplyText, setAdminReplyText] = useState('');
    const [isSubmittingReply, setIsSubmittingReply] = useState(false);

    const fetchAdminFeedbacks = async () => {
        try {
            const response = await api.get('/feedbacks');
            setFeedbacks(response.data);
        } catch (error) {
            console.error("Ошибка загрузки отзывов админом:", error);
            alert(t('server_error'));
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

    // Переключение языков
    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    // Загрузка общих данных для текущей активной вкладки
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
                
                // Инициализируем инпуты кастомных запросов
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

    // --- ОБРАБОТЧИКИ ДЛЯ ВКЛАДКИ ПОЛЬЗОВАТЕЛЕЙ ---

    // Изменение роли
    const handleRoleChange = async (userId, newRole) => {
        try {
            const res = await api.post('/users/update-role', { userId, newRole });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
            
            // Если администратор обновил собственную роль, обновляем локальное хранилище
            const currentUserId = localStorage.getItem('userId');
            if (String(userId) === String(currentUserId)) {
                localStorage.setItem('role', newRole);
                if (newRole !== 'admin') {
                    window.location.href = '/';
                }
            }
            alert(res.data.message || "Роль успешно обновлена");
        } catch (error) {
            console.error("Ошибка изменения роли:", error);
            alert(error.response?.data?.message || "Не удалось обновить роль");
        }
    };

    // Начисление кастомных запросов
    const handleAwardCustomRequests = async (userId) => {
        const value = parseInt(customRequestsInput[userId]);
        if (isNaN(value) || value < 0) {
            alert(t('error_alert') + ": " + t('fill_fields_alert'));
            return;
        }

        try {
            const res = await api.post('/users/update-custom-requests', { userId, customRequests: value });
            
            // Обновляем локально в стейте
            setUsers(prev => prev.map(u => {
                if (u.id === userId) {
                    const requestsLast12h = u.requests_last_12h || 0;
                    const limits = { 'Standard': 2, 'Lite': 10 };
                    const baseLimit = limits[u.role] !== undefined ? limits[u.role] : 2;
                    const remaining = u.role === 'Pro' || u.role === 'admin' 
                        ? 'Unlimited' 
                        : Math.max(0, baseLimit - requestsLast12h) + value;

                    return { ...u, custom_requests: value, remaining_requests: remaining };
                }
                return u;
            }));
            alert(res.data.message || "Кастомные лимиты обновлены");
        } catch (error) {
            console.error("Ошибка начисления запросов:", error);
            alert(error.response?.data?.message || "Не удалось сохранить изменения");
        }
    };

    // Модерация (Блокировки)
    const handleModerateUser = async (userId, action, durationHours = 24) => {
        try {
            const res = await api.post('/users/moderate-user', { userId, action, durationHours });
            
            // Локально обновляем данные пользователя в таблице
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
            console.error("Ошибка модерации пользователя:", error);
            alert(error.response?.data?.message || "Не удалось применить действие");
        }
    };

    // Временный бан с вводом количества часов
    const triggerTempBan = (userId) => {
        const hoursStr = prompt(t('admin_user_action_hours_prompt'), "24");
        if (hoursStr === null) return; // Отмена
        const hours = parseInt(hoursStr);
        if (isNaN(hours) || hours <= 0) {
            alert(t('error_alert') + ": Неверный формат времени.");
            return;
        }
        handleModerateUser(userId, 'temp_ban', hours);
    };

    // --- ОБРАБОТЧИКИ ДЛЯ БИБЛИОТЕКИ РАЗБОРОВ ---

    // Выбор одной записи чекбоксом
    const toggleSelectAnalysis = (id) => {
        setSelectedAnalyses(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Выбор "Выделить все" на текущей странице
    const toggleSelectAllAnalyses = () => {
        if (selectedAnalyses.length === analyses.length) {
            setSelectedAnalyses([]);
        } else {
            setSelectedAnalyses(analyses.map(a => a.id));
        }
    };

    // Удаление одного анализа
    const handleDeleteAnalysis = async (id) => {
        if (!confirm(t('admin_lib_confirm_delete'))) return;

        try {
            // Маршрутизируется на search-service DELETE /history/:id
            await api.delete(`/history/${id}`);
            setAnalyses(prev => prev.filter(a => a.id !== id));
            setSelectedAnalyses(prev => prev.filter(item => item !== id));
        } catch (error) {
            console.error("Ошибка при удалении разбора:", error);
            alert(t('server_error'));
        }
    };

    // Массовое удаление выбранных анализов
    const handleDeleteSelectedAnalyses = async () => {
        if (selectedAnalyses.length === 0) return;
        if (!confirm(t('admin_lib_confirm_delete_selected'))) return;

        try {
            const res = await api.delete('/search/admin/transcriptions/bulk', { data: { ids: selectedAnalyses } });
            setAnalyses(prev => prev.filter(a => !selectedAnalyses.includes(a.id)));
            setSelectedAnalyses([]);
            alert(res.data.message || t('admin_lib_success_delete'));
        } catch (error) {
            console.error("Ошибка массового удаления разборов:", error);
            alert(t('server_error'));
        }
    };

    // Хелпер для получения заголовка/сводки на активном языке
    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[i18n.language] || obj['ru'] || '';
    };

    return (
        <div className="dashboard-container fade-in" style={{ paddingBottom: '80px' }}>
            {/* ШАПКА АДМИН-ПАНЕЛИ */}
            <header className="top-nav" style={{ 
                background: 'rgba(15, 23, 42, 0.45)', 
                backdropFilter: 'blur(16px)', 
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '15px 40px',
                borderRadius: '0 0 24px 24px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
            }}>
                <div className="logo" style={{ 
                    fontSize: '22px', 
                    fontWeight: '800', 
                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: 'none'
                }}>
                    {t('admin_panel_title', 'Панель управления администратора')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <select 
                        className="lang-switcher" 
                        onChange={(e) => changeLanguage(e.target.value)} 
                        value={i18n.language}
                        style={{
                            background: 'rgba(30, 41, 59, 0.65)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: '10px',
                            color: 'white',
                            padding: '8px 14px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            outline: 'none',
                            transition: 'all 0.3s'
                        }}
                    >
                        <option value="en">English (EN)</option>
                        <option value="ru">Русский (RU)</option>
                        <option value="kk">Қазақша (KK)</option>
                    </select>
                    <Link to="/" className="nav-link" style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        padding: '8px 18px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#c7d2fe',
                        textDecoration: 'none',
                        transition: 'all 0.3s'
                    }}>
                        {t('back_btn')}
                    </Link>
                </div>
            </header>

            {/* ВЕРХНЯЯ НАВИГАЦИОННАЯ ПАНЕЛЬ С ВКЛАДКАМИ */}
            <div className="admin-tabs-nav" style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '15px',
                margin: '35px 0',
                userSelect: 'none'
            }}>
                <button 
                    onClick={() => setActiveTab('dashboard')} 
                    className={`admin-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                    style={{
                        padding: '12px 30px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: '700',
                        border: '1px solid',
                        borderColor: activeTab === 'dashboard' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(255,255,255,0.06)',
                        background: activeTab === 'dashboard' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255, 255, 255, 0.03)',
                        color: activeTab === 'dashboard' ? '#d8b4fe' : '#94a3b8',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'dashboard' ? '0 10px 20px rgba(168, 85, 247, 0.15)' : 'none',
                        transition: 'all 0.3s ease'
                    }}
                >
                    📊 {t('admin_tab_dashboard', 'Аналитика')}
                </button>
                <button 
                    onClick={() => setActiveTab('users')} 
                    className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                    style={{
                        padding: '12px 30px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: '700',
                        border: '1px solid',
                        borderColor: activeTab === 'users' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(255,255,255,0.06)',
                        background: activeTab === 'users' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255, 255, 255, 0.03)',
                        color: activeTab === 'users' ? '#d8b4fe' : '#94a3b8',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'users' ? '0 10px 20px rgba(168, 85, 247, 0.15)' : 'none',
                        transition: 'all 0.3s ease'
                    }}
                >
                    👥 {t('admin_tab_users', 'Пользователи')}
                </button>
                <button 
                    onClick={() => setActiveTab('library')} 
                    className={`admin-tab-btn ${activeTab === 'library' ? 'active' : ''}`}
                    style={{
                        padding: '12px 30px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: '700',
                        border: '1px solid',
                        borderColor: activeTab === 'library' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(255,255,255,0.06)',
                        background: activeTab === 'library' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255, 255, 255, 0.03)',
                        color: activeTab === 'library' ? '#d8b4fe' : '#94a3b8',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'library' ? '0 10px 20px rgba(168, 85, 247, 0.15)' : 'none',
                        transition: 'all 0.3s ease'
                    }}
                >
                    📚 {t('admin_tab_library', 'Библиотека разборов')}
                </button>
                <button 
                    onClick={() => setActiveTab('feedback')} 
                    className={`admin-tab-btn ${activeTab === 'feedback' ? 'active' : ''}`}
                    style={{
                        padding: '12px 30px',
                        borderRadius: '16px',
                        fontSize: '14px',
                        fontWeight: '700',
                        border: '1px solid',
                        borderColor: activeTab === 'feedback' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(255,255,255,0.06)',
                        background: activeTab === 'feedback' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255, 255, 255, 0.03)',
                        color: activeTab === 'feedback' ? '#d8b4fe' : '#94a3b8',
                        cursor: 'pointer',
                        boxShadow: activeTab === 'feedback' ? '0 10px 20px rgba(168, 85, 247, 0.15)' : 'none',
                        transition: 'all 0.3s ease'
                    }}
                >
                    💬 {t('feedback_nav')}
                </button>
            </div>

            {/* МАКЕТ ВКЛАДОК */}
            <div className="admin-layout fade-in-up" style={{ padding: '0 40px' }}>
                
                {/* ==================== 1. ВКЛАДКА "АНАЛИТИКА" ==================== */}
                {activeTab === 'dashboard' && (
                    <div className="tab-dashboard-view fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                        
                        {/* Панели метрик */}
                        <div className="admin-widgets" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '25px' }}>
                            <div className="widget-card" style={{
                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.6))',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '24px',
                                padding: '30px',
                                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '1px', fontWeight: '700', margin: 0 }}>
                                    👤 {t('admin_stat_total_users', 'Зарегистрировано пользователей')}
                                </h3>
                                <div className="widget-value" style={{ fontSize: '42px', fontWeight: '900', color: '#fff' }}>
                                    {stats.totalUsers}
                                </div>
                            </div>
                            <div className="widget-card" style={{
                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.6))',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '24px',
                                padding: '30px',
                                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '1px', fontWeight: '700', margin: 0 }}>
                                    ⚡ {t('admin_stat_requests_24h', 'Запросов (24 часа)')}
                                </h3>
                                <div className="widget-value text-purple" style={{ fontSize: '42px', fontWeight: '900', color: '#a855f7' }}>
                                    {stats.total24h}
                                </div>
                            </div>
                            <div className="widget-card" style={{
                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.6))',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '24px',
                                padding: '30px',
                                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '1px', fontWeight: '700', margin: 0 }}>
                                    📝 {t('admin_stat_chars', 'Объем текста')}
                                </h3>
                                <div className="widget-value" style={{ fontSize: '32px', fontWeight: '900', color: '#38bdf8' }}>
                                    {(stats.totalChars / 1024 / 1024).toFixed(2)} MB
                                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '600', marginLeft: '10px' }}>
                                        ({stats.totalWords.toLocaleString()} {t('stats_words', 'слов')})
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Объем обработанного трафика */}
                        <div className="admin-table-container" style={{
                            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.5))',
                            borderRadius: '24px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '35px',
                            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.2)',
                            marginBottom: '30px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: '0' }}>
                                        📊 {t('admin_astroproxy_usage', 'Объем обработанного трафика')}
                                    </h3>
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: '800', color: '#e2e8f0' }}>
                                    <span className="text-purple" style={{ color: '#a855f7' }}>{proxyStats.spentMB} MB</span> {t('admin_astroproxy_of', 'из')} {proxyStats.limitMB} MB
                                </div>
                            </div>

                            {/* Прогресс-бар трафика */}
                            <div style={{
                                height: '24px',
                                width: '100%',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '2px'
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${Math.min(proxyStats.percentUsed, 100)}%`,
                                    background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                                    borderRadius: '10px',
                                    boxShadow: '0 0 15px rgba(168, 85, 247, 0.5)',
                                    transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    alignItems: 'center',
                                    paddingRight: '10px',
                                    fontSize: '11px',
                                    fontWeight: '900',
                                    color: '#fff'
                                }}>
                                    {proxyStats.percentUsed}%
                                </div>
                            </div>
                        </div>

                        {/* Графики */}
                        <div className="admin-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px' }}>
                            <div className="admin-table-container chart-box" style={{
                                background: 'rgba(15, 23, 42, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                borderRadius: '24px',
                                padding: '30px',
                                display: 'flex',
                                justifyContent: 'center'
                            }}>
                                <PremiumBarChart 
                                    data={stats.dailyActivity} 
                                    title={t('admin_chart_activity')} 
                                    colorStart="#6366f1"
                                    colorEnd="#4f46e5"
                                />
                            </div>
                            <div className="admin-table-container chart-box" style={{
                                background: 'rgba(15, 23, 42, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                borderRadius: '24px',
                                padding: '30px',
                                display: 'flex',
                                justifyContent: 'center'
                            }}>
                                <PremiumBarChart 
                                    data={stats.langDistribution} 
                                    title={t('admin_chart_langs')} 
                                    colorStart="#a855f7"
                                    colorEnd="#7c3aed"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* ==================== 2. ВКЛАДКА "ПОЛЬЗОВАТЕЛИ" ==================== */}
                {activeTab === 'users' && (
                    <div className="tab-users-view fade-in">
                        <div className="admin-table-container" style={{
                            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.5))',
                            borderRadius: '24px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '30px',
                            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.2)'
                        }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '25px', color: '#fff' }}>
                                👥 {t('admin_user_list', 'Список пользователей')}
                            </h2>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="glass-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                            <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                {t('admin_user_col_id', 'ID')}
                                            </th>
                                            <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                {t('admin_user_col_name', 'Имя')}
                                            </th>
                                            <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                {t('admin_user_col_email', 'Email')}
                                            </th>
                                            <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                {t('admin_user_col_role', 'Роль')}
                                            </th>
                                            <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                {t('admin_user_col_requests', 'Оставшиеся запросы')}
                                            </th>
                                            <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                {t('admin_user_col_reg', 'Регистрация')}
                                            </th>
                                            <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', fontWeight: '700' }}>
                                                {t('admin_user_col_actions', 'Модерация')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(user => {
                                            const isBanned = user.is_permanently_banned || (user.banned_until && new Date(user.banned_until) > new Date());
                                            
                                            return (
                                                <tr key={user.id} style={{ 
                                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                    background: isBanned ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    {/* ID */}
                                                    <td style={{ padding: '18px 10px', fontSize: '13px', color: '#cbd5e1' }}>#{user.id}</td>
                                                    
                                                    {/* Name */}
                                                    <td style={{ padding: '18px 10px', fontSize: '14px', fontWeight: '700', color: '#fff' }}>
                                                        {user.username}
                                                    </td>
                                                    
                                                    {/* Email */}
                                                    <td style={{ padding: '18px 10px', fontSize: '13px', color: '#94a3b8' }}>{user.email}</td>
                                                    
                                                    {/* Role Dropdown */}
                                                    <td style={{ padding: '18px 10px' }}>
                                                        <select 
                                                            value={user.role} 
                                                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                            className="admin-role-select"
                                                            style={{
                                                                background: 'rgba(15, 23, 42, 0.7)',
                                                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                                                borderRadius: '8px',
                                                                color: 'white',
                                                                padding: '6px 12px',
                                                                cursor: 'pointer',
                                                                fontSize: '13px',
                                                                fontFamily: 'inherit',
                                                                outline: 'none',
                                                                transition: 'all 0.3s'
                                                            }}
                                                        >
                                                            <option value="Standard">{t('admin_user_role_standard', 'Standard')}</option>
                                                            <option value="Lite">{t('admin_user_role_lite', 'Lite')}</option>
                                                            <option value="Pro">{t('admin_user_role_pro', 'Pro')}</option>
                                                            <option value="admin">{t('admin_user_role_admin', 'Admin')}</option>
                                                        </select>
                                                    </td>
                                                    
                                                    {/* Requests Limit */}
                                                    <td style={{ padding: '18px 10px', fontSize: '13px', fontWeight: '700', color: user.remaining_requests === 'Unlimited' ? '#a855f7' : '#e2e8f0' }}>
                                                        {user.remaining_requests === 'Unlimited' ? t('user_role_pro', 'Безлимитно') : user.remaining_requests}
                                                    </td>
                                                    
                                                    {/* Registration Date */}
                                                    <td style={{ padding: '18px 10px', fontSize: '13px', color: '#94a3b8' }}>
                                                        {new Date(user.created_at).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US')}
                                                    </td>
                                                    
                                                    {/* Moderation Controls */}
                                                    <td style={{ padding: '18px 10px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                                        
                                                        {/* Управление кастомными запросами */}
                                                        {user.role !== 'Pro' && user.role !== 'admin' && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <input 
                                                                    type="number" 
                                                                    min="0"
                                                                    placeholder="+ Кастом"
                                                                    value={customRequestsInput[user.id] !== undefined ? customRequestsInput[user.id] : ''}
                                                                    onChange={(e) => setCustomRequestsInput({ ...customRequestsInput, [user.id]: e.target.value })}
                                                                    className="yt-input"
                                                                    style={{ 
                                                                        width: '75px', 
                                                                        padding: '4px 8px', 
                                                                        fontSize: '12px', 
                                                                        borderRadius: '6px', 
                                                                        textAlign: 'center',
                                                                        background: 'rgba(15, 23, 42, 0.65)',
                                                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                                                        color: '#fff',
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                                <button 
                                                                    onClick={() => handleAwardCustomRequests(user.id)}
                                                                    className="action-btn"
                                                                    style={{ 
                                                                        padding: '5px 10px', 
                                                                        fontSize: '11px', 
                                                                        background: 'rgba(34, 197, 94, 0.15)',
                                                                        border: '1px solid rgba(34, 197, 94, 0.4)',
                                                                        color: '#86efac',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                    title={t('admin_btn_save', 'Сохранить')}
                                                                >
                                                                    ✓
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Кнопки бана/разбана */}
                                                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                            {isBanned ? (
                                                                <>
                                                                    <span style={{
                                                                        fontSize: '10px',
                                                                        fontWeight: '800',
                                                                        textTransform: 'uppercase',
                                                                        padding: '4px 8px',
                                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                                                        color: '#fca5a5',
                                                                        borderRadius: '6px',
                                                                        display: 'flex',
                                                                        alignItems: 'center'
                                                                    }} title={user.is_permanently_banned ? t('admin_user_ban_status_perm') : `${t('admin_user_ban_status_temp')} ${new Date(user.banned_until).toLocaleString()}`}>
                                                                        🚫 {user.is_permanently_banned ? 'PERM' : 'TEMP'}
                                                                    </span>
                                                                    <button 
                                                                        onClick={() => handleModerateUser(user.id, 'unban')}
                                                                        className="action-btn"
                                                                        style={{
                                                                            padding: '4px 10px',
                                                                            fontSize: '11px',
                                                                            background: 'rgba(34, 197, 94, 0.2)',
                                                                            border: '1px solid rgba(34, 197, 94, 0.5)',
                                                                            color: '#4ade80',
                                                                            borderRadius: '6px',
                                                                            cursor: 'pointer',
                                                                            fontWeight: '700'
                                                                        }}
                                                                    >
                                                                        {t('admin_user_action_unban', 'Разблокировать')}
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button 
                                                                        onClick={() => triggerTempBan(user.id)}
                                                                        className="action-btn block-btn"
                                                                        style={{ 
                                                                            padding: '4px 10px', 
                                                                            fontSize: '11px',
                                                                            borderRadius: '6px',
                                                                            background: 'rgba(245, 158, 11, 0.1)',
                                                                            border: '1px solid rgba(245, 158, 11, 0.3)',
                                                                            color: '#facc15',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        ⏰ {t('admin_user_action_ban_temp', 'Временный бан')}
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleModerateUser(user.id, 'perm_ban')}
                                                                        className="action-btn block-btn"
                                                                        style={{ 
                                                                            padding: '4px 10px', 
                                                                            fontSize: '11px',
                                                                            borderRadius: '6px',
                                                                            background: 'rgba(239, 68, 68, 0.1)',
                                                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                            color: '#fca5a5',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        💀 {t('admin_user_action_ban_perm', 'Постоянный бан')}
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
                    </div>
                )}

                {/* ==================== 3. ВКЛАДКА "БИБЛИОТЕКА РАЗБОРОВ" ==================== */}
                {activeTab === 'library' && (
                    <div className="tab-library-view fade-in">
                        <div className="admin-table-container" style={{
                            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.5))',
                            borderRadius: '24px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '30px',
                            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.2)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', margin: 0 }}>
                                    📚 {t('admin_tab_library', 'Библиотека разборов')}
                                </h2>
                                
                                {/* Кнопка группового удаления */}
                                {selectedAnalyses.length > 0 && (
                                    <button 
                                        onClick={handleDeleteSelectedAnalyses}
                                        className="action-btn"
                                        style={{
                                            padding: '10px 20px',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            fontWeight: '700',
                                            background: '#ef4444',
                                            color: '#fff',
                                            border: 'none',
                                            cursor: 'pointer',
                                            boxShadow: '0 6px 20px rgba(239, 68, 68, 0.3)',
                                            transition: 'all 0.3s ease',
                                            animation: 'pulse 1.5s infinite'
                                        }}
                                    >
                                        🗑️ {t('admin_lib_btn_delete_selected', 'Удалить выбранные')} ({selectedAnalyses.length})
                                    </button>
                                )}
                            </div>

                            {analyses.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                    {t('admin_lib_no_data', 'На платформе пока нет выполненных анализов.')}
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="glass-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                                <th style={{ padding: '15px 10px', width: '45px', textAlign: 'center' }}>
                                                    <input 
                                                        type="checkbox"
                                                        checked={selectedAnalyses.length === analyses.length && analyses.length > 0}
                                                        onChange={toggleSelectAllAnalyses}
                                                        style={{ transform: 'scale(1.25)', cursor: 'pointer' }}
                                                    />
                                                </th>
                                                <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                    {t('admin_lib_col_id', 'ID разбора')}
                                                </th>
                                                <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                    {t('admin_lib_col_title', 'Название')}
                                                </th>
                                                <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                    Автор
                                                </th>
                                                <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                    {t('admin_lib_col_link', 'YouTube ссылка')}
                                                </th>
                                                <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '700' }}>
                                                    {t('admin_lib_col_created', 'Дата создания')}
                                                </th>
                                                <th style={{ padding: '15px 10px', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', fontWeight: '700' }}>
                                                    {t('admin_lib_col_actions', 'Действия')}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analyses.map(item => {
                                                const analysis = typeof item.structured_analysis === 'string' 
                                                    ? JSON.parse(item.structured_analysis) 
                                                    : item.structured_analysis;
                                                const title = getLangText(analysis?.title) || item.file_name || `Разбор #${item.job_id}`;
                                                const hasLink = item.youtube_link && item.youtube_link.startsWith('http');
                                                
                                                return (
                                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={() => setActiveAnalysis(item)}>
                                                        {/* Чекбокс */}
                                                        <td style={{ padding: '18px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                type="checkbox"
                                                                checked={selectedAnalyses.includes(item.id)}
                                                                onChange={() => toggleSelectAnalysis(item.id)}
                                                                style={{ transform: 'scale(1.25)', cursor: 'pointer' }}
                                                            />
                                                        </td>
                                                        
                                                        {/* ID */}
                                                        <td style={{ padding: '18px 10px', fontSize: '13px', color: '#cbd5e1' }}>#{item.id}</td>
                                                        
                                                        {/* Название */}
                                                        <td style={{ padding: '18px 10px', fontSize: '14px', fontWeight: '700', color: '#fff', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {title}
                                                        </td>

                                                        {/* Автор */}
                                                        <td style={{ padding: '18px 10px', fontSize: '13px', color: '#cbd5e1' }}>
                                                            <strong>{item.user_name || 'System'}</strong>
                                                        </td>
                                                        
                                                        {/* Ссылка YouTube */}
                                                        <td style={{ padding: '18px 10px', fontSize: '13px' }} onClick={(e) => e.stopPropagation()}>
                                                            {hasLink ? (
                                                                <a href={item.youtube_link} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontWeight: '700', textDecoration: 'none' }}>
                                                                    🔗 YouTube URL
                                                                </a>
                                                            ) : (
                                                                <span style={{ color: '#64748b' }}>Файл/Запись</span>
                                                            )}
                                                        </td>
                                                        
                                                        {/* Дата создания */}
                                                        <td style={{ padding: '18px 10px', fontSize: '13px', color: '#94a3b8' }}>
                                                            {new Date(item.created_at).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US')}
                                                        </td>
                                                        
                                                        {/* Кнопка удаления */}
                                                        <td style={{ padding: '18px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                            <button 
                                                                onClick={() => handleDeleteAnalysis(item.id)}
                                                                className="action-btn block-btn"
                                                                style={{
                                                                    padding: '6px 14px',
                                                                    borderRadius: '8px',
                                                                    fontSize: '12px',
                                                                    fontWeight: '700',
                                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                    color: '#ef4444',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                {t('delete_btn', 'Удалить')}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ==================== 4. ВКЛАДКА "ОТЗЫВЫ" ==================== */}
                {activeTab === 'feedback' && (
                    <div className="tab-feedback-view fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', margin: '0 0 10px 0' }}>
                            💬 {t('admin_feedback_title')}
                        </h2>

                        <div style={{
                            background: 'rgba(30, 41, 59, 0.45)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '24px',
                            overflow: 'hidden',
                            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
                        }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#94a3b8', fontWeight: '700' }}>{t('admin_feedback_col_author')}</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#94a3b8', fontWeight: '700' }}>{t('admin_feedback_col_rating')}</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#94a3b8', fontWeight: '700' }}>{t('admin_feedback_col_comment')}</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#94a3b8', fontWeight: '700' }}>{t('admin_feedback_col_date')}</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#94a3b8', fontWeight: '700' }}>{t('admin_feedback_col_reply')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {feedbacks.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                                    Отзывов пока нет.
                                                </td>
                                            </tr>
                                        ) : (
                                            feedbacks.map((f) => {
                                                const hasReply = !!f.reply;
                                                const ratingEmoji = {
                                                    'Fine': '🤩', 'Good': '😊', 'Okay': '😐', 'Bad': '😞', 'Very Bad': '🤬'
                                                }[f.rating] || '💬';

                                                return (
                                                    <tr 
                                                        key={f.id} 
                                                        onClick={() => setSelectedFeedback(f)}
                                                        style={{ 
                                                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)', 
                                                            cursor: 'pointer',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        className="admin-table-row-hover"
                                                    >
                                                        <td style={{ padding: '16px 24px', fontSize: '13px', color: '#cbd5e1', fontWeight: '600' }}>
                                                            {f.sender_name}
                                                        </td>
                                                        <td style={{ padding: '16px 24px', fontSize: '13px', color: '#cbd5e1' }}>
                                                            <span style={{ fontSize: '16px', marginRight: '6px' }}>{ratingEmoji}</span>
                                                            <span style={{ fontWeight: '700' }}>{t(`rating_${f.rating.toLowerCase().replace(' ', '_')}`)}</span>
                                                        </td>
                                                        <td style={{ padding: '16px 24px', fontSize: '13px', color: '#cbd5e1', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {f.message}
                                                        </td>
                                                        <td style={{ padding: '16px 24px', fontSize: '12px', color: '#64748b' }}>
                                                            {new Date(f.created_at).toLocaleString(i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US')}
                                                        </td>
                                                        <td style={{ padding: '16px 24px', fontSize: '12px' }}>
                                                            {hasReply ? (
                                                                <span style={{ color: '#34d399', fontWeight: '700', background: 'rgba(52, 211, 153, 0.1)', padding: '4px 10px', borderRadius: '10px' }}>
                                                                    {t('admin_feedback_replied')}
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: '#f87171', fontWeight: '700', background: 'rgba(248, 113, 113, 0.1)', padding: '4px 10px', borderRadius: '10px' }}>
                                                                    {t('admin_feedback_no_reply')}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ДЕТАЛЬНОЕ МОДАЛЬНОЕ ОКНО РАЗБОРА */}
            {activeAnalysis && (() => {
                const analysisObj = typeof activeAnalysis.structured_analysis === 'string'
                    ? JSON.parse(activeAnalysis.structured_analysis)
                    : activeAnalysis.structured_analysis;
                const title = getLangText(analysisObj?.title) || activeAnalysis.file_name || `Разбор #${activeAnalysis.job_id}`;
                const summary = getLangText(analysisObj?.summary) || '';
                const detailed = getLangText(analysisObj?.detailed_analysis) || '';
                const language = analysisObj?.language || 'ru';

                return (
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        backdropFilter: 'blur(10px)',
                        zIndex: 9999,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '30px'
                    }} onClick={() => setActiveAnalysis(null)}>
                        
                        <div style={{
                            width: '100%',
                            maxWidth: '900px',
                            height: '80vh',
                            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '24px',
                            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }} onClick={(e) => e.stopPropagation()}>
                            
                            {/* Заголовок модального окна */}
                            <div style={{
                                padding: '25px 35px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: '0 0 4px 0' }}>
                                        📝 {t('admin_lib_view_title', 'Просмотр аналитики')}
                                    </h2>
                                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                                        ID #{activeAnalysis.id} • {title}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => setActiveAnalysis(null)}
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#cbd5e1',
                                        fontSize: '18px',
                                        width: '36px', height: '36px',
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                        display: 'flex', justifyContent: 'center', alignItems: 'center'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Переключатели вкладок модального окна */}
                            <div style={{
                                display: 'flex',
                                gap: '10px',
                                padding: '15px 35px',
                                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                                <button 
                                    onClick={() => setModalTab('rendered')}
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '10px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        background: modalTab === 'rendered' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                        border: '1px solid',
                                        borderColor: modalTab === 'rendered' ? 'rgba(99, 102, 241, 0.5)' : 'transparent',
                                        color: modalTab === 'rendered' ? '#c7d2fe' : '#94a3b8',
                                        cursor: 'pointer'
                                    }}
                                >
                                    📄 {t('admin_lib_view_md', 'Рендеринг (Markdown View)')}
                                </button>
                                <button 
                                    onClick={() => setModalTab('raw')}
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '10px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        background: modalTab === 'raw' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                                        border: '1px solid',
                                        borderColor: modalTab === 'raw' ? 'rgba(168, 85, 247, 0.5)' : 'transparent',
                                        color: modalTab === 'raw' ? '#d8b4fe' : '#94a3b8',
                                        cursor: 'pointer'
                                    }}
                                >
                                    💻 {t('admin_lib_view_raw', 'Исходный JSON (Raw Code)')}
                                </button>
                            </div>

                            {/* Тело модального окна со скроллом */}
                            <div style={{
                                padding: '35px',
                                overflowY: 'auto',
                                flex: 1,
                                backgroundColor: 'rgba(15, 23, 42, 0.2)'
                            }}>
                                {modalTab === 'raw' ? (
                                    <pre style={{
                                        background: 'rgba(15, 23, 42, 0.75)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '14px',
                                        padding: '20px',
                                        color: '#34d399',
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        overflowX: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all',
                                        margin: 0
                                    }}>
                                        {JSON.stringify(analysisObj, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="markdown-body text-left" style={{
                                        color: '#cbd5e1',
                                        lineHeight: '1.7',
                                        fontSize: '14px'
                                    }}>
                                        {/* Beautiful badge listing the detected content language */}
                                        <div style={{ marginBottom: '20px' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: '800',
                                                textTransform: 'uppercase',
                                                padding: '6px 14px',
                                                background: 'rgba(99, 102, 241, 0.15)',
                                                border: '1px solid rgba(99, 102, 241, 0.4)',
                                                color: '#c7d2fe',
                                                borderRadius: '20px'
                                            }}>
                                                Language: {language.toUpperCase()}
                                            </span>
                                        </div>

                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {`# ${title}\n\n## ${t('tab_summary', 'Сводка')}\n\n${summary}\n\n## ${t('detailed_analysis', 'Детальный разбор')}\n\n${detailed}`}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* МОДАЛЬНОЕ ОКНО ОТВЕТА НА ОТЗЫВ (ДЛЯ АДМИНА) */}
            {selectedFeedback && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        backdropFilter: 'blur(10px)',
                        zIndex: 9999,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '30px'
                    }}
                    onClick={() => setSelectedFeedback(null)}
                >
                    <div 
                        style={{
                            width: '100%',
                            maxWidth: '550px',
                            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '24px',
                            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Шапка модалки */}
                        <div style={{
                            padding: '25px 35px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: '0 0 4px 0' }}>
                                    💬 {t('admin_feedback_reply_modal')}
                                </h2>
                                <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                                    {t('admin_feedback_col_author')}: {selectedFeedback.sender_name}
                                </span>
                            </div>
                            <button 
                                onClick={() => setSelectedFeedback(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#cbd5e1',
                                    fontSize: '18px',
                                    width: '36px', height: '36px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                                    outline: 'none'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Тело модалки */}
                        <div style={{ padding: '35px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{
                                padding: '18px', borderRadius: '16px', background: 'rgba(15, 23, 42, 0.3)',
                                border: '1px solid rgba(255,255,255,0.06)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#a855f7' }}>
                                        {{ 'Fine': '🤩', 'Good': '😊', 'Okay': '😐', 'Bad': '😞', 'Very Bad': '🤬' }[selectedFeedback.rating] || '💬'} {t(`rating_${selectedFeedback.rating.toLowerCase().replace(' ', '_')}`)}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        {new Date(selectedFeedback.created_at).toLocaleString(i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US')}
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '13px', color: '#f8fafc', lineHeight: '1.4', wordBreak: 'break-word' }}>
                                    {selectedFeedback.message}
                                </p>
                            </div>

                            {selectedFeedback.reply ? (
                                <div style={{
                                    padding: '18px', borderRadius: '16px', background: 'rgba(52, 211, 153, 0.05)',
                                    border: '1px solid rgba(52, 211, 153, 0.15)', display: 'flex', flexDirection: 'column', gap: '6px'
                                }}>
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#34d399', textTransform: 'uppercase' }}>
                                        ✓ {t('feedback_admin_reply')}
                                    </span>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4', wordBreak: 'break-word' }}>
                                        {selectedFeedback.reply.text}
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleSendReply} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <textarea
                                        placeholder={t('admin_feedback_reply_placeholder')}
                                        value={adminReplyText}
                                        onChange={(e) => setAdminReplyText(e.target.value)}
                                        required
                                        style={{
                                            width: '100%', minHeight: '120px', padding: '14px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.4)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', fontSize: '13px', outline: 'none', resize: 'vertical'
                                        }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSubmittingReply}
                                        style={{
                                            padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                                            color: 'white', fontWeight: '700', fontSize: '13px', border: 'none', cursor: 'pointer',
                                            boxShadow: '0 4px 15px rgba(168, 85, 247, 0.3)', transition: 'all 0.2s', outline: 'none'
                                        }}
                                    >
                                        {isSubmittingReply ? t('btn_loading') : t('admin_feedback_reply_btn')}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;