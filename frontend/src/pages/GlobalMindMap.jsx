import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import './Dashboard.css';
import { useTranslation } from 'react-i18next';
import MindMap from './MindMap';

const GlobalMindMap = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const currentLang = (i18n.language || 'ru').split('-')[0].toLowerCase();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [history, setHistory] = useState([]);
    const [mindMapData, setMindMapData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);

    const [userRole, setUserRole] = useState(localStorage.getItem('role') || 'Standard');

    const fetchUserProfile = async () => {
        const userId = localStorage.getItem('userId');
        if (!userId) return;
        try {
            const res = await api.get(`/users/profile/${userId}`);
            if (res.data && res.data.role) {
                localStorage.setItem('role', res.data.role);
                setUserRole(res.data.role);
            }
        } catch (e) {
            console.error("Error fetching user profile", e);
        }
    };

    useEffect(() => {
        loadHistory();
        fetchUserProfile();
    }, []);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const response = await api.get('/history');
            const items = response.data.items || [];
            setHistory(items);
            generateGlobalMindMap(items);
        } catch (error) {
            console.error("Ошибка загрузки истории для MindMap");
        } finally {
            setLoading(false);
        }
    };

    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[currentLang] || obj['ru'] || obj['en'] || '';
    };

    const generateGlobalMindMap = (items) => {
        const nodes = [];
        const links = [];

        // 1. Корень - Пользователь
        const userName = localStorage.getItem('username') || 'User';
        nodes.push({ id: 'user_root', text: userName, type: 'root' });

        const topicMap = {}; // text -> { originalText: str, count: N, analyses: [ids] }
        const analysisNodeIds = new Set();

        // Собираем данные
        items.forEach(item => {
            const analysis = typeof item.structured_analysis === 'string' 
                ? JSON.parse(item.structured_analysis) 
                : item.structured_analysis;
            
            if (!analysis) return;

            const analysisId = `analysis_${item.id}`;
            const analysisTitle = getLangText(analysis.title) || `Analysis #${item.job_id}`;
            
            // Собираем темы для группировки
            const topics = analysis.key_topics || [];
            topics.forEach(topic => {
                const topicText = getLangText(topic.title);
                if (!topicText) return;

                const normalizedText = topicText.toLowerCase().trim();
                if (!topicMap[normalizedText]) {
                    topicMap[normalizedText] = { originalText: topicText, count: 0, analyses: [] };
                }
                topicMap[normalizedText].count += 1;
                if (!topicMap[normalizedText].analyses.includes(analysisId)) {
                    topicMap[normalizedText].analyses.push(analysisId);
                }
            });
        });

        // Сортируем и берем топ-10 тем
        const topTopics = Object.values(topicMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const analysisInTopTopics = new Set();

        // 2. Создаем узлы ТОП-тем и связываем их с анализами
        topTopics.forEach((topic, index) => {
            const topicId = `global_topic_${index}`;
            nodes.push({ 
                id: topicId, 
                text: topic.originalText, 
                type: 'topic', 
                category: 'Frequent Topic' 
            });

            links.push({ source: 'user_root', target: topicId, label: { ru: 'Тема', en: 'Topic', kk: 'Тақырып' } });

            topic.analyses.forEach(analysisId => {
                links.push({ source: topicId, target: analysisId, label: { ru: 'Разбор', en: 'Analysis', kk: 'Талдау' } });
                analysisInTopTopics.add(analysisId);
            });
        });

        // 3. Создаем сами узлы анализов и их Key Points (один раз для каждого анализа)
        items.forEach(item => {
            const analysis = typeof item.structured_analysis === 'string' 
                ? JSON.parse(item.structured_analysis) 
                : item.structured_analysis;
            
            if (!analysis) return;
            const analysisId = `analysis_${item.id}`;
            const analysisTitle = getLangText(analysis.title) || `Analysis #${item.job_id}`;

            // Добавляем узел анализа
            nodes.push({ 
                id: analysisId, 
                text: analysisTitle, 
                type: 'topic',
                category: analysisTitle
            });

            // Если анализ не попал в ТОП-темы, цепляем его к корню
            if (!analysisInTopTopics.has(analysisId)) {
                links.push({ source: 'user_root', target: analysisId, label: { ru: 'Разное', en: 'Other', kk: 'Басқа' } });
            }

            // Добавляем Key Points (только один раз на анализ)
            if (analysis.key_topics) {
                const allPoints = [];
                analysis.key_topics.forEach(kt => {
                    const pts = kt.key_points?.[currentLang] || kt.key_points?.['ru'] || kt.key_points || [];
                    pts.forEach(p => { if (!allPoints.includes(p)) allPoints.push(p); });
                });

                allPoints.slice(0, 3).forEach((point, pIdx) => {
                    const pointId = `${analysisId}_point_${pIdx}`;
                    nodes.push({
                        id: pointId,
                        text: point,
                        type: 'subtopic',
                        category: 'Key Point'
                    });
                    links.push({ source: analysisId, target: pointId, label: { ru: 'Деталь', en: 'Detail', kk: 'Мәлімет' } });
                });
            }
        });

        setMindMapData({ nodes, links });
    };

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
        setIsMobileMenuOpen(false);
    };

    const NavItems = () => {
        const displayRole = userRole === 'admin' ? 'Admin' : userRole;
        return (
            <>
                <span className={`role-badge-nav role-badge-${userRole.toLowerCase()}`}>
                    {displayRole}
                </span>

                <select 
                    className="lang-switcher" 
                    onChange={(e) => changeLanguage(e.target.value)} 
                    value={i18n.language}
                >
                    <option value="en">EN</option>
                    <option value="ru">RU</option>
                    <option value="kk">KK</option>
                </select>
                <Link to="/" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('back_btn')}</Link>
                <Link to="/profile" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('profile')}</Link>
                <span className="nav-link logout" onClick={() => {
                    localStorage.clear();
                    window.location.href = '/login';
                }}>{t('logout')}</span>
            </>
        );
    };

    return (
        <div className="dashboard-container fade-in">
            <header className="top-nav">
                <button className="hamburger" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
                <div className="logo">{t('app_name')}</div>
                <div className="nav-links-desktop">
                    <NavItems />
                </div>
            </header>

            <div className={`mobile-overlay ${isMobileMenuOpen ? 'open' : ''}`} onClick={() => setIsMobileMenuOpen(false)} />
            <div className={`mobile-menu-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
                <button style={{background:'none', border:'none', color:'white', fontSize:'24px', alignSelf:'flex-end', marginBottom:'20px', cursor:'pointer'}} onClick={() => setIsMobileMenuOpen(false)}>×</button>
                <NavItems />
            </div>

            <h2 className="section-title">{t('tab_mindmap')}</h2>

            <div className="content-box slide-up" style={{ minHeight: '700px' }}>
                {loading ? (
                    <div className="status-pulse" style={{ textAlign: 'center', padding: '100px' }}>
                        {t('btn_loading')}
                    </div>
                ) : history.length === 0 ? (
                    <div className="status-pulse" style={{ textAlign: 'center', padding: '100px' }}>
                        No analyses found. Create some to see your knowledge map.
                    </div>
                ) : (
                    <MindMap 
                        data={mindMapData} 
                        onNavigateToTopic={(topicName, node) => {
                            if (!node || !node.id) return;
                            const match = node.id.match(/^analysis_([^_]+)/);
                            if (match) {
                                const itemId = match[1];
                                let highlight = null;
                                if (node.id.includes('_point_')) {
                                    highlight = node.name;
                                }
                                navigate('/', { state: { openItemId: itemId, highlightText: highlight } });
                            } else if (node.id.startsWith('global_topic_')) {
                                navigate('/', { state: { highlightText: node.name } });
                            } else {
                                navigate('/', { state: { highlightText: node.name } });
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default GlobalMindMap;
