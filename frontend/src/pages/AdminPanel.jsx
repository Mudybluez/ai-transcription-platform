import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api';
import './Extras.css';
import { useTranslation } from 'react-i18next';

// Простой компонент для отрисовки графиков через SVG (без внешних библиотек)
const SimpleBarChart = ({ data, title, color = "#a855f7" }) => {
    const { t } = useTranslation();
    if (!data || data.length === 0) return <div className="admin-no-data-msg">{t('admin_no_data')}</div>;
    
    const maxVal = Math.max(...data.map(d => d.count), 1);
    const height = 150;
    const width = 300;
    const barWidth = (width / data.length) - 5;

    const getLabel = (d) => {
        if (d.day) return d.day.slice(-2);
        if (d.label === 'ru') return 'RU';
        if (d.label === 'en') return 'EN';
        if (d.label === 'kk') return 'KK';
        return d.label;
    };

    return (
        <div className="chart-container">
            <h4>{title}</h4>
            <svg width={width} height={height} style={{ overflow: 'visible' }}>
                {data.map((d, i) => {
                    const barHeight = (d.count / maxVal) * (height - 20);
                    return (
                        <g key={i}>
                            <rect 
                                x={i * (barWidth + 5)} 
                                y={height - barHeight} 
                                width={barWidth} 
                                height={barHeight} 
                                fill={color}
                                rx="4"
                            />
                            <text 
                                x={i * (barWidth + 5) + barWidth / 2} 
                                y={height + 15} 
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
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState({
        totalTranscriptions: 0,
        totalChars: 0,
        recentActivity: 0,
        dailyActivity: [],
        langDistribution: []
    });
    const role = localStorage.getItem('role');
    const { t, i18n } = useTranslation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    useEffect(() => {
        if (role !== 'admin') return;

        const fetchData = async () => {
            try {
                const usersRes = await api.get('/users/all');
                setUsers(usersRes.data);

                const statsRes = await api.get('/search/admin/stats');
                setStats(statsRes.data);
            } catch (error) {
                console.error("Ошибка загрузки данных админ-панели");
            }
        };
        fetchData();
    }, [role]);

    if (role !== 'admin') {
        return <Navigate to="/" />;
    }

    return (
        <div className="dashboard-container fade-in">
            <header className="top-nav">
                <div className="logo">{t('admin_panel')}</div>
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

            <div className="admin-layout fade-in-up">
                {/* Метрики */}
                <div className="admin-widgets">
                    <div className="widget-card">
                        <h3>{t('admin_users')}</h3>
                        <div className="widget-value">{users.length}</div>
                    </div>
                    <div className="widget-card">
                        <h3>{t('admin_ai_requests')}</h3>
                        <div className="widget-value text-purple">{stats.totalTranscriptions}</div>
                    </div>
                    <div className="widget-card">
                        <h3>{t('admin_data_volume')}</h3>
                        <div className="widget-value">{(stats.totalChars / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                </div>

                {/* Графики */}
                <div className="admin-charts-grid">
                    <div className="admin-table-container chart-box">
                        <SimpleBarChart 
                            data={stats.dailyActivity} 
                            title={t('admin_chart_activity')} 
                            color="#6366f1"
                        />
                    </div>
                    <div className="admin-table-container chart-box">
                        <SimpleBarChart 
                            data={stats.langDistribution} 
                            title={t('admin_chart_langs')} 
                            color="#a855f7"
                        />
                    </div>
                </div>

                {/* Таблица пользователей */}
                <div className="admin-table-container">
                    <h2 style={{marginBottom: '20px'}}>{t('admin_user_list')}</h2>
                    <table className="glass-table">
                        <thead>
                            <tr>
                                <th>{t('admin_col_id')}</th>
                                <th>{t('admin_col_name')}</th>
                                <th>{t('email_label')}</th>
                                <th>{t('admin_col_role')}</th>
                                <th>{t('admin_col_reg')}</th>
                                <th>{t('admin_col_actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>#{user.id}</td>
                                    <td><strong>{user.username}</strong></td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`chip ${user.role === 'admin' ? 'chip-admin' : 'chip-user'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>{new Date(user.created_at).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US')}</td>
                                    <td>
                                        <button className="action-btn block-btn" onClick={() => alert(t('admin_block_btn') + ' ' + t('status_processing'))}>{t('admin_block_btn')}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;