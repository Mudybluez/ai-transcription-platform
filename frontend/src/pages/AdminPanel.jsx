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
    
    // Состояния интерактивного управления AstroProxy
    const [ports, setPorts] = useState([]);
    const [countries, setCountries] = useState([]);
    const [cities, setCities] = useState([]);
    const [operators, setOperators] = useState([]);
    const [isLoadingProxyData, setIsLoadingProxyData] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [wizardConfig, setWizardConfig] = useState({
        name: 'New Custom Port',
        country: 'RU',
        city: 'moscow',
        operator: 'mts',
        trafficLimit: '1073741824' // 1 GB
    });
    const [calculatedPrice, setCalculatedPrice] = useState(null);
    const [isCalculating, setIsCalculating] = useState(false);
    
    // Состояния для Библиотеки разборов
    const [analyses, setAnalyses] = useState([]);
    const [selectedAnalyses, setSelectedAnalyses] = useState([]);
    const [activeAnalysis, setActiveAnalysis] = useState(null);
    const [modalTab, setModalTab] = useState('rendered');

    // Хранение вводимых вручную лимитов для каждого пользователя
    const [customRequestsInput, setCustomRequestsInput] = useState({});

    // Переключение языков
    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    // Нормализация списка стран от AstroProxy
    const normalizeCountries = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) {
            return data.map(item => {
                if (typeof item === 'string') {
                    return { code: item, name: item };
                }
                return {
                    code: item.code || item.id || item.country || '',
                    name: item.name || item.code || item.id || ''
                };
            }).filter(c => c.code);
        }
        if (typeof data === 'object') {
            return Object.entries(data).map(([code, name]) => ({
                code: code,
                name: typeof name === 'string' ? name : code
            }));
        }
        return [];
    };

    // Нормализация списка городов от AstroProxy
    const normalizeCities = (data, countryCode) => {
        if (!data) return [];
        if (Array.isArray(data)) {
            return data.map(item => {
                if (typeof item === 'string') {
                    return { id: item, name: item, country: countryCode };
                }
                return {
                    id: item.id || item.code || item.name || '',
                    name: item.name || item.id || '',
                    country: item.country || countryCode
                };
            }).filter(c => c.id);
        }
        if (typeof data === 'object') {
            return Object.entries(data).map(([id, name]) => ({
                id: id,
                name: typeof name === 'string' ? name : id,
                country: countryCode
            }));
        }
        return [];
    };

    // Нормализация списка операторов от AstroProxy
    const normalizeOperators = (data, countryCode) => {
        if (!data) return [];
        if (Array.isArray(data)) {
            return data.map(item => {
                if (typeof item === 'string') {
                    return { id: item, name: item, country: countryCode };
                }
                return {
                    id: item.id || item.name || '',
                    name: item.name || item.id || '',
                    country: item.country || countryCode
                };
            }).filter(o => o.id);
        }
        if (typeof data === 'object') {
            return Object.entries(data).map(([id, name]) => ({
                id: id,
                name: typeof name === 'string' ? name : id,
                country: countryCode
            }));
        }
        return [];
    };

    // Загрузка списков городов и операторов в зависимости от страны
    const fetchGeoParams = async (countryCode) => {
        if (!countryCode || countryCode === 'undefined') return;
        try {
            const citiesRes = await api.get(`/search/admin/proxy/cities?country=${countryCode}`);
            const rawCities = citiesRes.data.data || citiesRes.data || [];
            setCities(normalizeCities(rawCities, countryCode));
        } catch (e) {
            console.error("Ошибка при получении списка городов AstroProxy:", e);
        }

        try {
            const operatorsRes = await api.get(`/search/admin/proxy/operators?country=${countryCode}`);
            const rawOperators = operatorsRes.data.data || operatorsRes.data || [];
            setOperators(normalizeOperators(rawOperators, countryCode));
        } catch (e) {
            console.error("Ошибка при получении списка операторов AstroProxy:", e);
        }
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

                // Загружаем активные порты прокси и параметры селекторов
                setIsLoadingProxyData(true);
                try {
                    const portsRes = await api.get('/search/admin/proxy/ports');
                    setPorts(portsRes.data.data || portsRes.data || []);

                    const countriesRes = await api.get('/search/admin/proxy/countries');
                    const rawCountries = countriesRes.data.data || countriesRes.data || [];
                    const normalized = normalizeCountries(rawCountries);
                    setCountries(normalized);

                    // Определяем страну по умолчанию (первая из списка или 'RU')
                    const defaultCountry = normalized.length > 0 ? normalized[0].code : 'RU';
                    setWizardConfig(prev => ({ ...prev, country: defaultCountry }));

                    // Загружаем города и операторы для этой страны
                    await fetchGeoParams(defaultCountry);
                } catch (pe) {
                    console.error("Ошибка загрузки портов/гео AstroProxy:", pe);
                } finally {
                    setIsLoadingProxyData(false);
                }
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

    // --- ОБРАБОТЧИКИ ДЛЯ ИНТЕРАКТИВНОГО УПРАВЛЕНИЯ ASTROPROXY ---

    // Обновление/Смена IP
    const handleNewIp = async (portId) => {
        setActionLoadingId(`newip-${portId}`);
        try {
            const res = await api.get(`/search/admin/proxy/ports/${portId}/newip`);
            if (res.data && res.data.status === 'ok') {
                const newIp = res.data.data?.new_ip || 'N/A';
                alert(t('admin_proxy_newip_success', `Внешний IP порта успешно обновлен на: ${newIp}`));
                setPorts(prev => prev.map(p => p.id === portId ? { ...p, ip: newIp } : p));
            } else {
                alert(res.data?.message || "Ошибка смены IP");
            }
        } catch (error) {
            console.error("Ошибка при смене IP:", error);
            alert("Не удалось сменить IP прокси");
        } finally {
            setActionLoadingId(null);
        }
    };

    // Продление порта
    const handleRenewPort = async (portId) => {
        setActionLoadingId(`renew-${portId}`);
        try {
            const res = await api.post(`/search/admin/proxy/ports/${portId}/renew`);
            if (res.data && res.data.status === 'ok') {
                alert(t('admin_proxy_renew_success', 'Порт успешно продлен на AstroProxy!'));
            } else {
                alert(res.data?.message || "Ошибка продления порта");
            }
        } catch (error) {
            console.error("Ошибка продления порта:", error);
            alert("Не удалось продлить порт");
        } finally {
            setActionLoadingId(null);
        }
    };

    // Удаление порта
    const handleDeletePort = async (portId) => {
        if (!confirm(t('admin_proxy_delete_confirm', 'Вы уверены, что хотите удалить этот порт из AstroProxy?'))) return;
        setActionLoadingId(`delete-${portId}`);
        try {
            const res = await api.delete(`/search/admin/proxy/ports/${portId}`);
            if (res.data && res.data.status === 'ok') {
                alert(t('admin_proxy_delete_success', 'Порт успешно удален!'));
                setPorts(prev => prev.filter(p => p.id !== portId));
            } else {
                alert(res.data?.message || "Ошибка удаления порта");
            }
        } catch (error) {
            console.error("Ошибка удаления порта:", error);
            alert("Не удалось удалить порт");
        } finally {
            setActionLoadingId(null);
        }
    };

    // Расчет стоимости
    const handleCalculatePrice = async () => {
        setIsCalculating(true);
        try {
            const res = await api.post('/search/admin/proxy/calculate', {
                country: wizardConfig.country,
                city: wizardConfig.city,
                operator: wizardConfig.operator,
                traffic_limit: parseInt(wizardConfig.trafficLimit)
            });
            if (res.data && res.data.status === 'ok') {
                setCalculatedPrice(res.data.data?.price || 0);
            } else {
                alert(res.data?.message || "Ошибка расчета цены");
            }
        } catch (error) {
            console.error("Ошибка при расчете цены прокси:", error);
            alert("Не удалось рассчитать стоимость");
        } finally {
            setIsCalculating(false);
        }
    };

    // Покупка порта
    const handleBuyPort = async () => {
        setActionLoadingId('buy-port');
        try {
            const res = await api.post('/search/admin/proxy/ports', {
                name: wizardConfig.name,
                country: wizardConfig.country,
                city: wizardConfig.city,
                operator: wizardConfig.operator,
                traffic_limit: parseInt(wizardConfig.trafficLimit)
            });
            if (res.data && res.data.status === 'ok') {
                alert(t('admin_proxy_buy_success', 'Порт успешно приобретен на AstroProxy!'));
                const newPort = res.data.data;
                if (newPort) {
                    setPorts(prev => [...prev, newPort]);
                }
                setCalculatedPrice(null);
            } else {
                alert(res.data?.message || "Ошибка покупки порта");
            }
        } catch (error) {
            console.error("Ошибка покупки порта:", error);
            alert("Не удалось приобрести порт");
        } finally {
            setActionLoadingId(null);
        }
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

                        {/* Интеграция с AstroProxy */}
                        <div className="admin-table-container" style={{
                            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.5))',
                            borderRadius: '24px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '35px',
                            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.2)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: '0 0 5px 0' }}>
                                        🌐 {t('admin_astroproxy_usage', 'Использование трафика AstroProxy')}
                                    </h3>
                                    {proxyStats.source === 'placeholder' && (
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            color: '#fbbf24',
                                            background: 'rgba(251, 191, 36, 0.1)',
                                            border: '1px solid rgba(251, 191, 36, 0.3)',
                                            padding: '4px 10px',
                                            borderRadius: '8px',
                                            display: 'inline-block'
                                        }}>
                                            ⚠️ {t('admin_astroproxy_demo', 'Демонстрационный режим (без API ключа)')}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#e2e8f0' }}>
                                        <span className="text-purple" style={{ color: '#a855f7' }}>{proxyStats.spentMB} MB</span> {t('admin_astroproxy_of', 'из')} {proxyStats.limitMB} MB
                                    </div>
                                    {proxyStats.balance !== undefined && (
                                        <span style={{ 
                                            fontSize: '13px', 
                                            fontWeight: '800', 
                                            color: '#10b981', 
                                            background: 'rgba(16, 185, 129, 0.12)', 
                                            border: '1px solid rgba(16, 185, 129, 0.25)', 
                                            padding: '4px 12px', 
                                            borderRadius: '8px',
                                            textShadow: '0 0 8px rgba(16, 185, 129, 0.3)'
                                        }}>
                                            💰 Balance: {proxyStats.balance.toFixed(2)} {proxyStats.currency || 'USD'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Прогресс-бар AstroProxy */}
                            <div style={{
                                height: '24px',
                                width: '100%',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '2px',
                                marginBottom: '15px'
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

                            {/* Разделитель */}
                            <hr style={{ border: '0', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '25px 0' }} />

                            {/* СЕКЦИЯ 1: СПИСОК АКТИВНЫХ ПОРТОВ */}
                            <div style={{ marginBottom: '30px' }}>
                                <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#fff', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🔌 {t('admin_proxy_active_ports', 'Активные прокси-порты AstroProxy')}
                                </h4>

                                {isLoadingProxyData ? (
                                    <div style={{ color: '#94a3b8', fontSize: '14px', padding: '15px', textAlign: 'center' }}>
                                        🌀 {t('loading', 'Загрузка портов...')}
                                    </div>
                                ) : ports.length === 0 ? (
                                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', color: '#94a3b8', fontSize: '13px', padding: '20px', textAlign: 'center' }}>
                                        📭 {t('admin_proxy_no_ports', 'Активные порты не найдены')}
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                                        {ports.map((port) => {
                                            const usedMB = parseFloat(((port.traffic_used || 0) / (1024 * 1024)).toFixed(1));
                                            const limitMB = parseFloat(((port.traffic_limit || 1073741824) / (1024 * 1024)).toFixed(1));
                                            const percent = Math.min(Math.round((usedMB / limitMB) * 100), 100);
                                            
                                            return (
                                                <div key={port.id} style={{
                                                    background: 'rgba(15, 23, 42, 0.4)',
                                                    border: '1px solid rgba(255,255,255,0.05)',
                                                    borderRadius: '16px',
                                                    padding: '20px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '12px'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: '800', color: '#fff', fontSize: '14px' }}>
                                                            {port.name || `Port #${port.id}`}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            fontWeight: '800',
                                                            color: port.status === 'active' ? '#10b981' : '#f43f5e',
                                                            background: port.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                                                            border: port.status === 'active' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px'
                                                        }}>
                                                            {port.status?.toUpperCase()}
                                                        </span>
                                                    </div>

                                                    <div style={{ fontSize: '13px', color: '#cbd5e1', fontFamily: 'monospace' }}>
                                                        🔗 {port.ip}:{port.port}
                                                    </div>

                                                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                        🌍 {port.country} | 🏙️ {port.city} | 📡 {port.operator}
                                                    </div>

                                                    <div style={{ margin: '4px 0' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                                                            <span>📊 Трафик:</span>
                                                            <span>{usedMB} MB / {limitMB} MB ({percent}%)</span>
                                                        </div>
                                                        <div style={{ height: '6px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', width: `${percent}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)', borderRadius: '3px' }} />
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                                                        <button 
                                                            disabled={actionLoadingId !== null}
                                                            onClick={() => handleNewIp(port.id)}
                                                            style={{
                                                                flex: 1,
                                                                background: 'rgba(168, 85, 247, 0.12)',
                                                                border: '1px solid rgba(168, 85, 247, 0.25)',
                                                                borderRadius: '8px',
                                                                color: '#c084fc',
                                                                padding: '6px 0',
                                                                fontSize: '11px',
                                                                fontWeight: '800',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                display: 'flex',
                                                                justifyContent: 'center',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            🔄 {t('admin_proxy_change_ip', 'Сменить IP')}
                                                        </button>
                                                        
                                                        <button 
                                                            disabled={actionLoadingId !== null}
                                                            onClick={() => handleRenewPort(port.id)}
                                                            style={{
                                                                flex: 1,
                                                                background: 'rgba(16, 185, 129, 0.12)',
                                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                                borderRadius: '8px',
                                                                color: '#34d399',
                                                                padding: '6px 0',
                                                                fontSize: '11px',
                                                                fontWeight: '800',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                display: 'flex',
                                                                justifyContent: 'center',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            ⏳ {t('admin_proxy_renew', 'Продлить')}
                                                        </button>

                                                        <button 
                                                            disabled={actionLoadingId !== null}
                                                            onClick={() => handleDeletePort(port.id)}
                                                            style={{
                                                                background: 'rgba(244, 63, 94, 0.12)',
                                                                border: '1px solid rgba(244, 63, 94, 0.25)',
                                                                borderRadius: '8px',
                                                                color: '#f43f5e',
                                                                padding: '6px 10px',
                                                                fontSize: '11px',
                                                                fontWeight: '800',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* СЕКЦИЯ 2: КОНФИГУРАТОР И ПОКУПКА НОВОГО ПОРТА */}
                            <div style={{
                                background: 'rgba(15, 23, 42, 0.25)',
                                border: '1px solid rgba(255,255,255,0.03)',
                                borderRadius: '16px',
                                padding: '25px',
                                marginTop: '15px'
                            }}>
                                <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#fff', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🛒 {t('admin_proxy_buy_title', 'Приобрести новый прокси-порт')}
                                </h4>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                                    {/* Название порта */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>
                                            🏷️ Название порта
                                        </label>
                                        <input 
                                            type="text"
                                            value={wizardConfig.name}
                                            onChange={(e) => setWizardConfig(prev => ({ ...prev, name: e.target.value }))}
                                            style={{
                                                background: 'rgba(15, 23, 42, 0.6)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: '8px',
                                                color: '#fff',
                                                padding: '8px 12px',
                                                fontSize: '13px',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>

                                    {/* Выбор Страны */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>
                                            🌍 Страна
                                        </label>
                                        <select 
                                            value={wizardConfig.country}
                                            onChange={async (e) => {
                                                const selectedCountry = e.target.value;
                                                setWizardConfig(prev => ({ ...prev, country: selectedCountry }));
                                                await fetchGeoParams(selectedCountry);
                                            }}
                                            style={{
                                                background: 'rgba(15, 23, 42, 0.6)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: '8px',
                                                color: '#fff',
                                                padding: '8px 12px',
                                                fontSize: '13px',
                                                outline: 'none'
                                            }}
                                        >
                                            {countries.map(c => (
                                                <option key={c.code} value={c.code}>{c.name}</option>
                                            ))}
                                            {countries.length === 0 && <option value="RU">Russia</option>}
                                        </select>
                                    </div>

                                    {/* Выбор Города */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>
                                            🏙️ Город
                                        </label>
                                        <select 
                                            value={wizardConfig.city}
                                            onChange={(e) => setWizardConfig(prev => ({ ...prev, city: e.target.value }))}
                                            style={{
                                                background: 'rgba(15, 23, 42, 0.6)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: '8px',
                                                color: '#fff',
                                                padding: '8px 12px',
                                                fontSize: '13px',
                                                outline: 'none'
                                            }}
                                        >
                                            {cities.filter(c => c.country === wizardConfig.country).map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                            {cities.filter(c => c.country === wizardConfig.country).length === 0 && (
                                                <>
                                                    <option value="moscow">Moscow</option>
                                                    <option value="almaty">Almaty</option>
                                                    <option value="astana">Astana</option>
                                                </>
                                            )}
                                        </select>
                                    </div>

                                    {/* Выбор Оператора */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>
                                            📡 Оператор
                                        </label>
                                        <select 
                                            value={wizardConfig.operator}
                                            onChange={(e) => setWizardConfig(prev => ({ ...prev, operator: e.target.value }))}
                                            style={{
                                                background: 'rgba(15, 23, 42, 0.6)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: '8px',
                                                color: '#fff',
                                                padding: '8px 12px',
                                                fontSize: '13px',
                                                outline: 'none'
                                            }}
                                        >
                                            {operators.filter(o => o.country === wizardConfig.country).map(o => (
                                                <option key={o.id} value={o.id}>{o.name}</option>
                                            ))}
                                            {operators.filter(o => o.country === wizardConfig.country).length === 0 && (
                                                <>
                                                    <option value="mts">MTS</option>
                                                    <option value="beeline">Beeline</option>
                                                    <option value="kcell">Kcell</option>
                                                </>
                                            )}
                                        </select>
                                    </div>

                                    {/* Лимит Трафика */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>
                                            📊 Лимит трафика
                                        </label>
                                        <select 
                                            value={wizardConfig.trafficLimit}
                                            onChange={(e) => setWizardConfig(prev => ({ ...prev, trafficLimit: e.target.value }))}
                                            style={{
                                                background: 'rgba(15, 23, 42, 0.6)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: '8px',
                                                color: '#fff',
                                                padding: '8px 12px',
                                                fontSize: '13px',
                                                outline: 'none'
                                            }}
                                        >
                                            <option value="536870912">500 MB</option>
                                            <option value="1073741824">1 GB</option>
                                            <option value="5368709120">5 GB</option>
                                            <option value="10737418240">10 GB</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            disabled={isCalculating}
                                            onClick={handleCalculatePrice}
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '10px',
                                                color: '#fff',
                                                padding: '10px 20px',
                                                fontSize: '13px',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {isCalculating ? '🔄...' : '🧮 Рассчитать стоимость'}
                                        </button>

                                        <button 
                                            disabled={actionLoadingId === 'buy-port'}
                                            onClick={handleBuyPort}
                                            style={{
                                                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                                                border: 'none',
                                                borderRadius: '10px',
                                                color: '#fff',
                                                padding: '10px 24px',
                                                fontSize: '13px',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 15px rgba(168,85,247,0.3)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {actionLoadingId === 'buy-port' ? '⏳...' : '🛍️ Купить порт'}
                                        </button>
                                    </div>

                                    {calculatedPrice !== null && (
                                        <div style={{
                                            background: 'rgba(16, 185, 129, 0.12)',
                                            border: '1px solid rgba(16, 185, 129, 0.25)',
                                            padding: '8px 18px',
                                            borderRadius: '10px',
                                            color: '#10b981',
                                            fontSize: '14px',
                                            fontWeight: '800',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            💰 Расчетная цена: {calculatedPrice.toFixed(2)} USD
                                        </div>
                                    )}
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
        </div>
    );
};

export default AdminPanel;