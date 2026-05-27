import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import './Dashboard.css';
import { useTranslation } from 'react-i18next';
import NotificationsBell from '../components/NotificationsBell';
import Icon from '../components/Icon';

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
            <Link to="/profile" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>
                <Icon name="user" size={14} style={{ marginRight: 4 }} />
                {t('profile', 'Профиль')}
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

export default function GlobalMindMap() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const currentLang = (i18n.language || 'ru').split('-')[0].toLowerCase();
    
    // States
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(localStorage.getItem('role') || 'Standard');

    // MindMap Node Graph States
    const [graphSize, setGraphSize] = useState({ w: 1000, h: 640 });
    const [hoverNodeId, setHoverNodeId] = useState(null);
    const [pinnedNodeId, setPinnedNodeId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

    const graphWrapperRef = useRef(null);
    const stageRef = useRef(null);

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
            setHistory(response.data.items || []);
        } catch (error) {
            console.error("Ошибка загрузки истории");
        } finally {
            setLoading(false);
        }
    };

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
        setIsMobileMenuOpen(false);
    };

    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[currentLang] || obj['ru'] || obj['en'] || '';
    };

    // Fullscreen Event setup
    useEffect(() => {
        const onChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreen = () => {
        const el = stageRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
            document.exitFullscreen?.();
        } else if (el.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        }
    };

    // Measure SVG container dynamically
    useLayoutEffect(() => {
        if (!graphWrapperRef.current) return;
        const measure = () => {
            const r = graphWrapperRef.current.getBoundingClientRect();
            setGraphSize({ w: r.width, h: Math.max(580, r.height) });
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(graphWrapperRef.current);
        return () => ro.disconnect();
    }, [loading]);

    // Radial graph builder from actual history items
    const { nodes, links } = React.useMemo(() => {
        const resultNodes = [];
        const resultLinks = [];

        if (history.length === 0) return { nodes: resultNodes, links: resultLinks };

        const cx = graphSize.w / 2;
        const cy = graphSize.h / 2;

        // 1. Root User Node
        const userName = localStorage.getItem('username') || 'User';
        resultNodes.push({
            id: 'root',
            label: userName,
            x: cx,
            y: cy,
            type: 'root',
            meta: `${history.length} разборов`
        });

        const activeAnalyses = history.filter(item => {
            const analysis = typeof item.structured_analysis === 'string'
                ? JSON.parse(item.structured_analysis)
                : item.structured_analysis;
            return !!analysis;
        });

        if (activeAnalyses.length === 0) return { nodes: resultNodes, links: resultLinks };

        // 2. Classify items into dynamic clusters based on category or lang (Gaming, Tech, Culture, Science)
        // For dynamic implementation: we will cluster them by language/tag or just radial distribution!
        const itemsCount = activeAnalyses.length;
        const clusterRadius = Math.min(graphSize.w, graphSize.h) * 0.22;
        const subRadius = Math.min(graphSize.w, graphSize.h) * 0.14;

        activeAnalyses.forEach((item, index) => {
            const analysis = typeof item.structured_analysis === 'string'
                ? JSON.parse(item.structured_analysis)
                : item.structured_analysis;

            const analysisId = `item-${item.id}`;
            const analysisTitle = getLangText(analysis.title) || `Analysis #${item.job_id}`;
            const summary = getLangText(analysis.summary);

            // Compute radial position around root
            const angle = (index / itemsCount) * Math.PI * 2 - Math.PI / 2;
            const ix = cx + Math.cos(angle) * clusterRadius;
            const iy = cy + Math.sin(angle) * clusterRadius;

            // Language category mapping
            const lang = (item.language || 'ru').toLowerCase();
            const colorType = lang === 'ru' ? 'primary' : lang === 'en' ? 'secondary' : 'warning';

            resultNodes.push({
                id: analysisId,
                label: analysisTitle,
                short: analysisTitle.length > 30 ? analysisTitle.substring(0, 30) + '...' : analysisTitle,
                x: ix,
                y: iy,
                type: 'item',
                color: colorType,
                lang: lang.toUpperCase(),
                meta: summary,
                libId: item.id
            });

            resultLinks.push({ s: 'root', e: analysisId });

            // 3. Child Key Points / Topics around each analysis
            const topics = analysis.key_topics || [];
            const topicsCount = topics.length;

            topics.slice(0, 3).forEach((topic, j) => {
                const topicId = `topic-${item.id}-${j}`;
                const topicTitle = getLangText(topic.title);

                const spreadAngle = topicsCount === 1 ? 0 : ((j / (topicsCount - 1 || 1)) - 0.5) * 1.2;
                const ta = angle + spreadAngle;
                const tx = ix + Math.cos(ta) * subRadius;
                const ty = iy + Math.sin(ta) * subRadius;

                resultNodes.push({
                    id: topicId,
                    label: topicTitle,
                    x: tx,
                    y: ty,
                    type: 'topic',
                    meta: getLangText(topic.relevance),
                    analysisId
                });

                resultLinks.push({ s: analysisId, e: topicId });
            });
        });

        return { nodes: resultNodes, links: resultLinks };
    }, [history, graphSize]);

    const idMap = React.useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);

    const activeFocusedId = pinnedNodeId || hoverNodeId;

    // Filter connections
    const connectedNodeIds = React.useMemo(() => {
        if (!activeFocusedId) return null;
        const set = new Set([activeFocusedId]);
        
        // Find direct neighbors
        links.forEach(l => {
            if (l.s === activeFocusedId) set.add(l.e);
            if (l.e === activeFocusedId) set.add(l.s);
        });

        // Add parent connections to root
        const node = idMap[activeFocusedId];
        if (node?.type === 'topic' && node.analysisId) {
            set.add(node.analysisId);
            set.add('root');
        }
        if (node?.type === 'item') {
            set.add('root');
        }
        return set;
    }, [activeFocusedId, links, idMap]);

    // Graph Filters
    const isCategoryFiltered = (n) => {
        if (selectedCategoryFilter === 'all') return false;
        if (n.id === 'root') return false;
        
        const filterLang = selectedCategoryFilter.toUpperCase();
        if (n.type === 'item') {
            return n.lang !== filterLang;
        }
        if (n.type === 'topic') {
            const parent = idMap[n.analysisId];
            return parent?.lang !== filterLang;
        }
        return false;
    };

    const matchesSearch = (n) => {
        if (!searchQuery.trim()) return true;
        return n.label.toLowerCase().includes(searchQuery.toLowerCase());
    };

    const isDim = (n) => {
        if (isCategoryFiltered(n)) return true;
        if (!matchesSearch(n) && searchQuery.trim() && n.id !== 'root') return true;
        if (connectedNodeIds && !connectedNodeIds.has(n.id)) return true;
        return false;
    };

    const isLinkDim = (l) => {
        const ns = idMap[l.s], ne = idMap[l.e];
        if (!ns || !ne) return true;
        
        if (selectedCategoryFilter !== 'all') {
            if (isCategoryFiltered(ns) || isCategoryFiltered(ne)) return true;
        }
        if (connectedNodeIds && !(connectedNodeIds.has(l.s) && connectedNodeIds.has(l.e))) return true;
        return false;
    };

    const focusNode = activeFocusedId ? idMap[activeFocusedId] : null;

    const colorFor = (n) => {
        if (n.id === 'root') return 'var(--accent-primary)';
        if (n.type === 'item') {
            if (n.color === 'primary') return 'var(--accent-primary)';
            if (n.color === 'secondary') return 'var(--accent-secondary)';
            return 'var(--accent-warning)';
        }
        return 'var(--text-tertiary)';
    };

    return (
        <div className="dashboard-container fade-in">
            {/* Top Navigation */}
            <header className="top-nav">
                <button className="hamburger" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
                <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="sparkles" size={17} style={{ color: 'var(--accent-primary)' }} />
                    <span>AI Transcription</span>
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

            {/* Map Toolbar Header */}
            <main className="page" data-screen-label="map" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 80px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
                            {t('tab_mindmap', 'Карта знаний')}
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: 14 }}>
                            Все {history.length} разборов в едином созвездии. Наведите на узлы, чтобы проследить смысловые связи.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>
                                <Icon name="search" size={14} />
                            </span>
                            <input
                                className="field"
                                placeholder="Поиск по карте..."
                                style={{ height: 36, fontSize: 13, padding: '0 12px 0 34px', width: 220 }}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button className="btn btn--ghost btn--sm" onClick={toggleFullscreen} style={{ height: 36 }}>
                            <Icon name="maximize" size={14} />
                            {isFullscreen ? 'Свернуть' : 'Во весь экран'}
                        </button>
                    </div>
                </div>

                {/* Categories filtering chips */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button
                        className={`btn btn--sm ${selectedCategoryFilter === 'all' ? 'btn--ghost' : 'btn--quiet'}`}
                        style={{ borderColor: selectedCategoryFilter === 'all' ? 'var(--border-medium)' : 'transparent' }}
                        onClick={() => setSelectedCategoryFilter('all')}
                    >
                        Все разборы
                    </button>
                    <button
                        className={`btn btn--sm ${selectedCategoryFilter === 'ru' ? 'btn--ghost' : 'btn--quiet'}`}
                        style={{ borderColor: selectedCategoryFilter === 'ru' ? 'var(--border-medium)' : 'transparent' }}
                        onClick={() => setSelectedCategoryFilter('ru')}
                    >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)', marginRight: 4, display: 'inline-block' }} />
                        Русский (RU)
                    </button>
                    <button
                        className={`btn btn--sm ${selectedCategoryFilter === 'en' ? 'btn--ghost' : 'btn--quiet'}`}
                        style={{ borderColor: selectedCategoryFilter === 'en' ? 'var(--border-medium)' : 'transparent' }}
                        onClick={() => setSelectedCategoryFilter('en')}
                    >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-secondary)', marginRight: 4, display: 'inline-block' }} />
                        English (EN)
                    </button>
                </div>

                {/* SVG mindmap stage wrapper */}
                <div
                    ref={stageRef}
                    className="map-stage"
                    style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: isFullscreen ? 0 : 12,
                        height: isFullscreen ? '100vh' : 620,
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    <div ref={graphWrapperRef} style={{ width: '100%', height: '100%' }}>
                        {loading ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                                <span className="status-dot status-dot--pending spin" style={{ marginRight: 8 }} />
                                <span>{t('btn_loading', 'Загрузка...')}</span>
                            </div>
                        ) : history.length === 0 ? (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                                No analyses found. Create analyses on your library to map your knowledge graph.
                            </div>
                        ) : (
                            <svg viewBox={`0 0 ${graphSize.w} ${graphSize.h}`} width="100%" height="100%" style={{ display: 'block' }}>
                                <defs>
                                    <radialGradient id="mapRootGlow" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
                                    </radialGradient>
                                </defs>

                                {/* Link paths */}
                                {links.map((l, i) => {
                                    const A = idMap[l.s], B = idMap[l.e];
                                    if (!A || !B) return null;
                                    const dim = isLinkDim(l);
                                    return (
                                        <line 
                                            key={i}
                                            x1={A.x} y1={A.y}
                                            x2={B.x} y2={B.y}
                                            stroke="rgba(255,255,255,0.08)"
                                            strokeWidth={0.7}
                                            opacity={dim ? 0.12 : 1}
                                            style={{ transition: 'opacity .25s' }}
                                        />
                                    );
                                })}

                                {/* Nodes groups */}
                                {nodes.map(n => {
                                    const dim = isDim(n);
                                    const isRoot = n.id === 'root';
                                    const isItem = n.type === 'item';
                                    const isTopic = n.type === 'topic';
                                    
                                    const radius = isRoot ? 24 : isItem ? 6 : 3.5;
                                    const isFocus = activeFocusedId === n.id;
                                    const color = colorFor(n);

                                    return (
                                        <g
                                            key={n.id}
                                            opacity={dim ? 0.16 : 1}
                                            style={{ transition: 'opacity .25s', cursor: isItem || isTopic ? 'pointer' : 'default' }}
                                            onMouseEnter={() => !pinnedNodeId && setHoverNodeId(n.id)}
                                            onMouseLeave={() => !pinnedNodeId && setHoverNodeId(null)}
                                            onClick={() => {
                                                if (isItem) {
                                                    // Jump directly to the detailed view in dashboard with transition state
                                                    navigate('/', { state: { openItemId: n.libId } });
                                                } else {
                                                    setPinnedNodeId(p => p === n.id ? null : n.id);
                                                }
                                            }}
                                        >
                                            {isRoot && (
                                                <circle cx={n.x} cy={n.y} r={65} fill="url(#mapRootGlow)" />
                                            )}
                                            <circle 
                                                cx={n.x} cy={n.y} r={radius}
                                                fill={color}
                                                stroke={isFocus ? 'var(--accent-primary)' : 'transparent'}
                                                strokeWidth={1.5}
                                            />
                                            {isRoot && (
                                                <text x={n.x} y={n.y + 40} fill="var(--text-primary)" fontSize={13} fontWeight={600} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                                                    {n.label}
                                                </text>
                                            )}
                                            {isItem && (
                                                <text x={n.x} y={n.y - 12} fill="var(--text-secondary)" fontSize={10.5} fontWeight={500} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                                                    {n.short}
                                                </text>
                                            )}
                                            {isTopic && isFocus && (
                                                <text x={n.x} y={n.y - 8} fill="var(--text-secondary)" fontSize={10} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                                                    {n.label}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </svg>
                        )}
                    </div>

                    {/* Inline Fullscreen Escape helper */}
                    {isFullscreen && (
                        <button
                            onClick={toggleFullscreen}
                            className="btn btn--ghost btn--sm"
                            style={{
                                position: 'absolute',
                                top: 20, right: 20,
                                background: 'rgba(11, 11, 15, 0.7)',
                                backdropFilter: 'blur(8px)',
                                zIndex: 3,
                            }}
                        >
                            <Icon name="x" size={14} />
                            Свернуть (Esc)
                        </button>
                    )}

                    {/* Overlay Details Info Panel */}
                    {focusNode && focusNode.id !== 'root' && (
                        <div style={{
                            position: 'absolute',
                            bottom: 16, left: 16,
                            background: 'rgba(11, 11, 15, 0.92)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: 10,
                            padding: 16,
                            maxWidth: 340,
                            fontSize: 13,
                        }} className="fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: 'var(--text-tertiary)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                {focusNode.type === 'item' ? 'Разбор' : 'Ключевая тема'}
                                {pinnedNodeId && <span style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="pin" size={10} /> закреплен</span>}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4, color: 'var(--text-primary)', marginBottom: 8 }}>
                                {focusNode.label}
                            </div>
                            <p style={{ color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                                {focusNode.meta}
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {focusNode.type === 'item' ? (
                                    <button className="btn btn--primary btn--sm" onClick={() => navigate('/', { state: { openItemId: focusNode.libId } })}>
                                        Открыть разбор
                                        <Icon name="arrow_right" size={13} />
                                    </button>
                                ) : (
                                    <button className="btn className btn--primary btn--sm" onClick={() => navigate('/', { state: { openItemId: idMap[focusNode.analysisId]?.libId, highlightText: focusNode.label } })}>
                                        Найти в конспекте
                                        <Icon name="search" size={12} />
                                    </button>
                                )}
                                {pinnedNodeId && (
                                    <button className="btn btn--ghost btn--sm" onClick={() => setPinnedNodeId(null)}>
                                        Открепить
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Graph Legend */}
                    <div className="map-legend" style={{
                        position: 'absolute', top: 16, right: 16,
                        background: 'rgba(11, 11, 15, 0.7)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                        display: isFullscreen ? 'none' : 'flex',
                        flexDirection: 'column',
                        gap: 6
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                            Вы / Разбор RU
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-secondary)' }} />
                            Разбор EN
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                            Тема
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
