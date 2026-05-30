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

    // Pan & Zoom & Node Drag States & Refs
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [panStart, setPanStart] = useState(null);
    const [customNodePositions, setCustomNodePositions] = useState({});

    const draggingNodeIdRef = useRef(null);
    const dragStartOffsetRef = useRef({ x: 0, y: 0 });
    const hasDraggedRef = useRef(false);

    const graphWrapperRef = useRef(null);
    const stageRef = useRef(null);

    // Zoom on wheel towards mouse cursor
    const handleWheel = (e) => {
        e.preventDefault();
        const zoomFactor = 1.08;
        const nextScale = e.deltaY < 0 ? transform.scale * zoomFactor : transform.scale / zoomFactor;
        const clampedScale = Math.max(0.2, Math.min(5, nextScale));

        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setTransform(prev => {
            const dx = mouseX - prev.x;
            const dy = mouseY - prev.y;
            return {
                scale: clampedScale,
                x: mouseX - dx * (clampedScale / prev.scale),
                y: mouseY - dy * (clampedScale / prev.scale)
            };
        });
    };

    // Stage Mouse Down: Pan Start
    const handleStageMouseDown = (e) => {
        if (e.button !== 0) return; // Only left click drag
        if (e.target.closest('g') || draggingNodeIdRef.current) return;
        
        setPanStart({
            x: e.clientX - transform.x,
            y: e.clientY - transform.y
        });
    };

    // Node Drag Start
    const handleNodeDragStart = (e, node) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        draggingNodeIdRef.current = node.id;
        hasDraggedRef.current = false;

        const svgRect = graphWrapperRef.current.getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left;
        const mouseY = e.clientY - svgRect.top;

        // Transform mouse point back to untransformed coordinate space
        const localX = (mouseX - transform.x) / transform.scale;
        const localY = (mouseY - transform.y) / transform.scale;

        dragStartOffsetRef.current = {
            x: localX - node.x,
            y: localY - node.y
        };
    };

    // Stage Mouse Move (handles panning and node dragging)
    const handleStageMouseMove = (e) => {
        if (draggingNodeIdRef.current) {
            hasDraggedRef.current = true;
            const svgRect = graphWrapperRef.current.getBoundingClientRect();
            const mouseX = e.clientX - svgRect.left;
            const mouseY = e.clientY - svgRect.top;

            const localX = (mouseX - transform.x) / transform.scale;
            const localY = (mouseY - transform.y) / transform.scale;

            const targetX = localX - dragStartOffsetRef.current.x;
            const targetY = localY - dragStartOffsetRef.current.y;

            setCustomNodePositions(prev => ({
                ...prev,
                [draggingNodeIdRef.current]: { x: targetX, y: targetY }
            }));
            return;
        }

        if (panStart) {
            setTransform(prev => ({
                ...prev,
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            }));
        }
    };

    // Stage Mouse Up
    const handleStageMouseUp = () => {
        setPanStart(null);
        draggingNodeIdRef.current = null;
    };

    // Stage Touch Start: Pan Start
    const handleStageTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        if (e.target.closest('g') || draggingNodeIdRef.current) return;
        
        setPanStart({
            x: touch.clientX - transform.x,
            y: touch.clientY - transform.y
        });
    };

    // Node Touch Start
    const handleNodeTouchStart = (e, node) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();

        const touch = e.touches[0];
        draggingNodeIdRef.current = node.id;
        hasDraggedRef.current = false;

        const svgRect = graphWrapperRef.current.getBoundingClientRect();
        const mouseX = touch.clientX - svgRect.left;
        const mouseY = touch.clientY - svgRect.top;

        const localX = (mouseX - transform.x) / transform.scale;
        const localY = (mouseY - transform.y) / transform.scale;

        dragStartOffsetRef.current = {
            x: localX - node.x,
            y: localY - node.y
        };
    };

    // Stage Touch Move (handles panning and node dragging on mobile)
    const handleStageTouchMove = (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];

        if (draggingNodeIdRef.current) {
            hasDraggedRef.current = true;
            const svgRect = graphWrapperRef.current.getBoundingClientRect();
            const mouseX = touch.clientX - svgRect.left;
            const mouseY = touch.clientY - svgRect.top;

            const localX = (mouseX - transform.x) / transform.scale;
            const localY = (mouseY - transform.y) / transform.scale;

            const targetX = localX - dragStartOffsetRef.current.x;
            const targetY = localY - dragStartOffsetRef.current.y;

            setCustomNodePositions(prev => ({
                ...prev,
                [draggingNodeIdRef.current]: { x: targetX, y: targetY }
            }));
            return;
        }

        if (panStart) {
            setTransform(prev => ({
                ...prev,
                x: touch.clientX - panStart.x,
                y: touch.clientY - panStart.y
            }));
        }
    };

    // Stage Touch End
    const handleStageTouchEnd = () => {
        setPanStart(null);
        draggingNodeIdRef.current = null;
    };

    // Direct zoom controls
    const handleButtonZoom = (factor) => {
        setTransform(prev => {
            const nextScale = prev.scale * factor;
            const clampedScale = Math.max(0.2, Math.min(5, nextScale));
            const mouseX = graphSize.w / 2;
            const mouseY = graphSize.h / 2;

            const dx = mouseX - prev.x;
            const dy = mouseY - prev.y;
            return {
                scale: clampedScale,
                x: mouseX - dx * (clampedScale / prev.scale),
                y: mouseY - dy * (clampedScale / prev.scale)
            };
        });
    };

    const handleResetZoom = () => {
        setTransform({ x: 0, y: 0, scale: 1 });
        setCustomNodePositions({});
    };

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

    // Radial graph builder from actual history items with custom draggable override support
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
            x: customNodePositions['root']?.x ?? cx,
            y: customNodePositions['root']?.y ?? cy,
            type: 'root',
            meta: t('mindmap_meta_count', { count: history.length })
        });

        const activeAnalyses = history.filter(item => {
            const analysis = typeof item.structured_analysis === 'string'
                ? JSON.parse(item.structured_analysis)
                : item.structured_analysis;
            return !!analysis;
        });

        if (activeAnalyses.length === 0) return { nodes: resultNodes, links: resultLinks };

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
            const computedIx = cx + Math.cos(angle) * clusterRadius;
            const computedIy = cy + Math.sin(angle) * clusterRadius;

            const ix = customNodePositions[analysisId]?.x ?? computedIx;
            const iy = customNodePositions[analysisId]?.y ?? computedIy;

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
                const computedTx = ix + Math.cos(ta) * subRadius;
                const computedTy = iy + Math.sin(ta) * subRadius;

                const tx = customNodePositions[topicId]?.x ?? computedTx;
                const ty = customNodePositions[topicId]?.y ?? computedTy;

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
    }, [history, graphSize, customNodePositions]);

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

            {/* Map Toolbar Header */}
            <main className="page" data-screen-label="map" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 80px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
                            {t('tab_mindmap', 'Карта знаний')}
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: 14 }}>
                            {t('mindmap_subtitle', { count: history.length })}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>
                                <Icon name="search" size={14} />
                            </span>
                            <input
                                className="field"
                                placeholder={t('search_placeholder', 'Поиск по карте...')}
                                style={{ height: 36, fontSize: 13, padding: '0 12px 0 34px', width: 220 }}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button className="btn btn--ghost btn--sm" onClick={toggleFullscreen} style={{ height: 36 }}>
                            <Icon name="maximize" size={14} />
                            {isFullscreen ? t('immersive_close', 'Свернуть') : t('immersive_expand', 'Во весь экран')}
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
                        {t('mindmap_filter_all', 'Все разборы')}
                    </button>
                    <button
                        className={`btn btn--sm ${selectedCategoryFilter === 'ru' ? 'btn--ghost' : 'btn--quiet'}`}
                        style={{ borderColor: selectedCategoryFilter === 'ru' ? 'var(--border-medium)' : 'transparent' }}
                        onClick={() => setSelectedCategoryFilter('ru')}
                    >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)', marginRight: 4, display: 'inline-block' }} />
                        {t('lang_ru', 'Русский (RU)')}
                    </button>
                    <button
                        className={`btn btn--sm ${selectedCategoryFilter === 'en' ? 'btn--ghost' : 'btn--quiet'}`}
                        style={{ borderColor: selectedCategoryFilter === 'en' ? 'var(--border-medium)' : 'transparent' }}
                        onClick={() => setSelectedCategoryFilter('en')}
                    >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-secondary)', marginRight: 4, display: 'inline-block' }} />
                        {t('lang_en', 'English (EN)')}
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
                            <svg 
                                viewBox={`0 0 ${graphSize.w} ${graphSize.h}`} 
                                width="100%" 
                                height="100%" 
                                style={{ display: 'block', cursor: panStart ? 'grabbing' : 'grab', userSelect: 'none' }}
                                onWheel={handleWheel}
                                onMouseDown={handleStageMouseDown}
                                onMouseMove={handleStageMouseMove}
                                onMouseUp={handleStageMouseUp}
                                onMouseLeave={handleStageMouseUp}
                                onTouchStart={handleStageTouchStart}
                                onTouchMove={handleStageTouchMove}
                                onTouchEnd={handleStageTouchEnd}
                                onTouchCancel={handleStageTouchEnd}
                            >
                                <defs>
                                    <radialGradient id="mapRootGlow" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
                                    </radialGradient>
                                </defs>

                                <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
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
                                                style={{ transition: 'opacity .25s', cursor: 'pointer' }}
                                                onMouseEnter={() => !pinnedNodeId && setHoverNodeId(n.id)}
                                                onMouseLeave={() => !pinnedNodeId && setHoverNodeId(null)}
                                                onMouseDown={(e) => handleNodeDragStart(e, n)}
                                                onTouchStart={(e) => handleNodeTouchStart(e, n)}
                                                onClick={(e) => {
                                                    if (hasDraggedRef.current) {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        return;
                                                    }
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
                                </g>
                            </svg>
                        )}
                    </div>

                    {/* Direct Zoom Controls */}
                    <div className="map-zoom-controls" style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
                        <button className="btn btn--quiet btn--sm" style={{ padding: 0, width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'rgba(11, 11, 15, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontWeight: 600 }} onClick={() => handleButtonZoom(1.15)}>+</button>
                        <button className="btn btn--quiet btn--sm" style={{ padding: 0, width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'rgba(11, 11, 15, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontWeight: 600 }} onClick={() => handleButtonZoom(0.85)}>-</button>
                        <button className="btn btn--quiet btn--sm" style={{ padding: '0 8px', height: 32, display: 'grid', placeItems: 'center', background: 'rgba(11, 11, 15, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 11 }} onClick={handleResetZoom}>Reset</button>
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
                            {t('mindmap_collapse_esc', 'Свернуть (Esc)')}
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
                                {focusNode.type === 'item' ? t('mindmap_type_analysis', 'Разбор') : t('mindmap_type_topic', 'Ключевая тема')}
                                {pinnedNodeId && <span style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="pin" size={10} /> {t('mindmap_pinned', 'закреплен')}</span>}
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
                                        {t('mindmap_open_analysis', 'Открыть разбор')}
                                        <Icon name="arrow_right" size={13} />
                                    </button>
                                ) : (
                                    <button className="btn className btn--primary btn--sm" onClick={() => navigate('/', { state: { openItemId: idMap[focusNode.analysisId]?.libId, highlightText: focusNode.label } })}>
                                        {t('mindmap_find_in_summary', 'Найти в конспекте')}
                                        <Icon name="search" size={12} />
                                    </button>
                                )}
                                {pinnedNodeId && (
                                    <button className="btn btn--ghost btn--sm" onClick={() => setPinnedNodeId(null)}>
                                        {t('mindmap_unpin', 'Открепить')}
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
                            {t('mindmap_legend_you_ru', 'Вы / Разбор RU')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-secondary)' }} />
                            {t('mindmap_legend_en', 'Разбор EN')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                            {t('mindmap_legend_topic', 'Тема')}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
