import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ForceGraph2D from 'react-force-graph-2d';

const MindMap = ({ data, onNavigateToTopic }) => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language || 'ru';
    const [searchQuery, setSearchQuery] = useState('');
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [selectedNodeForModal, setSelectedNodeForModal] = useState(null);
    const fgRef = useRef();

    // Dimensions and immersive mode
    const [isImmersive, setIsImmersive] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 800, height: 700 });
    const wrapperRef = useRef(null);
    const originalTopRef = useRef(null);
    const initialScrollYRef = useRef(window.scrollY);

    // Lang text helper
    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[currentLang] || obj['ru'] || obj['en'] || '';
    };

    const prevKeyRef = useRef('');

    // Transform data for chronological DAG ForceGraph
    useEffect(() => {
        if (!data || !data.nodes) return;

        const key = `${currentLang}_${JSON.stringify(data)}`;
        if (key === prevKeyRef.current) return;
        prevKeyRef.current = key;

        const formattedNodes = data.nodes.map(node => {
            const rawText = getLangText(node.text);
            
            // Nodes styling based on their role in the chronology
            let color = '#6B6F76'; // Default detail node
            let val = 5;
            let fontSize = 3;

            if (node.type === 'root') {
                color = '#5487F6'; // Large blue hero node
                val = 14;
                fontSize = 4.5;
            } else if (node.type === 'topic') {
                color = '#9D9CFF'; // Glowing violet step nodes
                val = 9.5;
                fontSize = 3.5;
            }

            return {
                id: node.id,
                name: rawText,
                type: node.type,
                val,
                fontSize,
                color
            };
        });

        setGraphData({
            nodes: formattedNodes,
            links: (data.links || []).map(link => ({
                source: link.source,
                target: link.target,
                label: getLangText(link.label)
            }))
        });

        // Center on tree load
        setTimeout(() => {
            if (fgRef.current) {
                fgRef.current.zoomToFit(600, 100);
            }
        }, 300);

    }, [data, currentLang]);

    // Track wrapper dimensions
    useEffect(() => {
        if (!wrapperRef.current) return;
        
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                
                setDimensions({ 
                    width: isImmersive ? window.innerWidth : (width || 800), 
                    height: isImmersive ? window.innerHeight : (height || 700) 
                });
            }
        });
        
        resizeObserver.observe(wrapperRef.current);
        return () => resizeObserver.disconnect();
    }, [isImmersive]);

    // Lock body scroll in immersive mode to prevent background scroll and misalignment
    useEffect(() => {
        if (isImmersive) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isImmersive]);

    // Auto-fit graph when toggling fullscreen
    useEffect(() => {
        const timer = setTimeout(() => {
            if (fgRef.current) {
                fgRef.current.zoomToFit(600, 100);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [isImmersive]);

    // Close immersive on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isImmersive) {
                handleCloseImmersive();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isImmersive]);

    const handleCloseImmersive = () => {
        setIsImmersive(false);
        originalTopRef.current = null;
        initialScrollYRef.current = window.scrollY;
        setTimeout(() => {
            if (wrapperRef.current) {
                wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
    };

    const handleSearch = (e) => {
        const q = e.target.value;
        setSearchQuery(q);
        
        if (q && fgRef.current) {
            const foundNode = graphData.nodes.find(n => 
                n.name.toLowerCase().includes(q.toLowerCase())
            );
            if (foundNode) {
                fgRef.current.centerAt(foundNode.x, foundNode.y, 800);
                fgRef.current.zoom(3, 800);
            }
        }
    };

    // Zoom and navigation operations
    const zoomIn = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() * 1.35, 300);
        }
    };

    const zoomOut = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() / 1.35, 300);
        }
    };

    const zoomReset = () => {
        if (fgRef.current) {
            fgRef.current.zoomToFit(800, 80);
        }
    };

    return (
        <>
            {isImmersive && (
                <div className="mindmap-placeholder" style={{ height: '700px', width: '100%' }} />
            )}
            
            <div 
                ref={wrapperRef}
                className={`mindmap-wrapper ${isImmersive ? 'immersive' : ''}`} 
                style={isImmersive ? {} : { position: 'relative', width: '100%', height: '700px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', overflow: 'hidden' }}
            >
                {/* Header controls bar */}
                {isImmersive ? (
                    <div className="mindmap-immersive-header">
                        <h4>{t('timeline_tree_title', 'Хронологическое древо контента')}</h4>
                        <span className="mindmap-immersive-hint">{t('immersive_hint', 'Esc для выхода • Колесико для масштаба')}</span>
                        <button className="mindmap-close-immersive-btn" onClick={handleCloseImmersive}>
                            ✕ {t('immersive_close', 'Свернуть')}
                        </button>
                    </div>
                ) : (
                    <button 
                        className="mindmap-expand-btn" 
                        onClick={() => {
                            originalTopRef.current = window.scrollY;
                            setIsImmersive(true);
                        }}
                    >
                        ⛶ {t('immersive_expand', 'Во весь экран')}
                    </button>
                )}

                {/* Left search bar */}
                <div className="mindmap-search" style={{ position: 'absolute', top: isImmersive ? '80px' : '20px', left: '20px', zIndex: 10, width: '300px' }}>
                    <input 
                        type="text" 
                        placeholder={t('search_timeline_placeholder', 'Поиск этапов и тем...')} 
                        value={searchQuery}
                        onChange={handleSearch}
                        className="yt-input"
                        style={{ width: '100%', marginBottom: '5px', background: 'rgba(15, 23, 42, 0.8)' }}
                    />
                </div>

                {/* Premium Zoom floating buttons panel */}
                <div className="zoom-controls" style={{ 
                    position: 'absolute', 
                    bottom: '25px', 
                    right: '25px', 
                    zIndex: 10, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '8px', 
                    background: 'rgba(15, 23, 42, 0.85)',
                    padding: '8px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(8px)'
                }}>
                    <button 
                        onClick={zoomIn} 
                        style={{
                            width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                            background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '18px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >+</button>
                    <button 
                        onClick={zoomOut} 
                        style={{
                            width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                            background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '18px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >-</button>
                    <button 
                        onClick={zoomReset} 
                        style={{
                            width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                            background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '15px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >⛶</button>
                </div>

                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    backgroundColor="rgba(0,0,0,0)"
                    nodeLabel="name"
                    nodeColor={n => n.color}
                    nodeRelSize={6}
                    
                    // Force hierarchical left-to-right DAG layout
                    dagMode="lr"
                    dagLevelDistance={140}
                    
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={1}
                    linkCurvature={0}
                    
                    // Conditional coloring for timeline vs subtopic connectors
                    linkColor={link => {
                        const sId = typeof link.source === 'object' ? link.source.id : link.source;
                        const tId = typeof link.target === 'object' ? link.target.id : link.target;
                        const sNode = graphData.nodes.find(n => n.id === sId);
                        const tNode = graphData.nodes.find(n => n.id === tId);
                        
                        if (sNode?.type === 'topic' && tNode?.type === 'topic') {
                            return 'rgba(157, 156, 255, 0.75)'; // Bright violet step path
                        }
                        return 'rgba(255, 255, 255, 0.12)';
                    }}
                    
                    linkWidth={link => {
                        const sId = typeof link.source === 'object' ? link.source.id : link.source;
                        const tId = typeof link.target === 'object' ? link.target.id : link.target;
                        const sNode = graphData.nodes.find(n => n.id === sId);
                        const tNode = graphData.nodes.find(n => n.id === tId);
                        
                        if (sNode?.type === 'topic' && tNode?.type === 'topic') {
                            return 2.5; // Thicker chronological path
                        }
                        return 0.8;
                    }}
                    
                    dpr={Math.min(1.2, window.devicePixelRatio || 1)}
                    enableZoomInteraction={true}
                    enablePanInteraction={true}
                    enableNodeDrag={true}
                    
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const label = node.name;
                        
                        // Scale level of detail (LOD)
                        if (globalScale < 1.0) {
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, node.type === 'root' ? 6 : node.type === 'topic' ? 4 : 2.5, 0, 2 * Math.PI);
                            ctx.fillStyle = node.color;
                            ctx.fill();
                            return;
                        }
                        
                        const fontSize = node.fontSize || 3.0;
                        const fontStr = `${fontSize}px sans-serif`;
                        
                        if (ctx.__currentFont !== fontStr) {
                            ctx.font = fontStr;
                            ctx.__currentFont = fontStr;
                        }
                        
                        if (node.customWidth === undefined) {
                            const truncatedLabel = label.length > 25 ? label.substring(0, 22) + '...' : label;
                            const textWidth = ctx.measureText(truncatedLabel).width;
                            const padding = fontSize * 0.9;
                            node.customWidth = Math.max(node.val * 3, textWidth + padding * 2);
                            node.customHeight = fontSize * 2.2;
                            node.truncatedLabel = truncatedLabel;
                        }
                        
                        const nodeWidth = node.customWidth;
                        const nodeHeight = node.customHeight;
                        const displayLabel = node.truncatedLabel;

                        // Draw background pill shape
                        ctx.fillStyle = node.color;
                        ctx.beginPath();
                        const x = node.x - nodeWidth / 2;
                        const y = node.y - nodeHeight / 2;
                        const r = nodeHeight / 2;
                        
                        if (ctx.roundRect) {
                            ctx.roundRect(x, y, nodeWidth, nodeHeight, r);
                        } else {
                            ctx.moveTo(x + r, y);
                            ctx.lineTo(x + nodeWidth - r, y);
                            ctx.quadraticCurveTo(x + nodeWidth, y, x + nodeWidth, y + r);
                            ctx.lineTo(x + nodeWidth, y + nodeHeight - r);
                            ctx.quadraticCurveTo(x + nodeWidth, y + nodeHeight, x + nodeWidth - r, y + nodeHeight);
                            ctx.lineTo(x + r, y + nodeHeight);
                            ctx.quadraticCurveTo(x, y + nodeHeight, x, y + nodeHeight - r);
                            ctx.lineTo(x, y + r);
                            ctx.quadraticCurveTo(x, y, x + r, y);
                            ctx.closePath();
                        }
                        ctx.fill();

                        // Highlights on Search
                        if (searchQuery && label.toLowerCase().includes(searchQuery.toLowerCase())) {
                            ctx.strokeStyle = '#ffffff';
                            ctx.lineWidth = 2.5 / globalScale;
                            ctx.stroke();
                        }

                        // Text inside pill
                        if (ctx.textAlign !== 'center') ctx.textAlign = 'center';
                        if (ctx.textBaseline !== 'middle') ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(displayLabel, node.x, node.y);
                    }}
                    warmupTicks={120}
                    cooldownTicks={25}
                    onNodeClick={node => {
                        fgRef.current.centerAt(node.x, node.y, 800);
                        fgRef.current.zoom(3, 800);
                        setSelectedNodeForModal(node);
                    }}
                />

                {selectedNodeForModal && (
                    <div className="mindmap-modal-overlay fade-in">
                        <div className="mindmap-modal-content slide-up">
                            <h3>{t('navigate_question', 'Вы хотите перейти к анализу этой темы?')}</h3>
                            <p className="topic-highlight">"{selectedNodeForModal.name}"</p>
                            <div className="modal-actions">
                                <button 
                                    className="btn-primary" 
                                    onClick={() => {
                                        if (onNavigateToTopic) {
                                            onNavigateToTopic(selectedNodeForModal.name, selectedNodeForModal);
                                        }
                                        setSelectedNodeForModal(null);
                                        if (isImmersive) {
                                            setIsImmersive(false);
                                        }
                                    }}
                                >
                                    {t('navigate_confirm', 'Перейти')}
                                </button>
                                <button 
                                    className="btn-secondary" 
                                    onClick={() => setSelectedNodeForModal(null)}
                                >
                                    {t('navigate_cancel', 'Отклонить')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default MindMap;
