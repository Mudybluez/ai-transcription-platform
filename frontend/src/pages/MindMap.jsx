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

    // Размеры и иммерсивный (полноэкранный) режим
    const [isImmersive, setIsImmersive] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 800, height: 700 });
    const wrapperRef = useRef(null);
    const originalTopRef = useRef(null);
    const initialScrollYRef = useRef(window.scrollY);

    // Хелпер для текста
    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[currentLang] || obj['ru'] || obj['en'] || '';
    };

    // Трансформируем данные под формат ForceGraph
    useEffect(() => {
        if (!data || !data.nodes) return;

        const formattedNodes = data.nodes.map(node => ({
            id: node.id,
            name: getLangText(node.text),
            type: node.type,
            val: node.type === 'root' ? 10 : node.type === 'topic' ? 6 : 3,
            color: node.type === 'root' ? '#a855f7' : node.type === 'topic' ? '#6366f1' : '#4ade80'
        }));

        setGraphData({
            nodes: formattedNodes,
            links: data.links.map(link => ({
                source: link.source,
                target: link.target,
                label: getLangText(link.label)
            }))
        });
    }, [data, currentLang]);

    // Реактивное отслеживание размеров родительского контейнера через ResizeObserver
    useEffect(() => {
        if (!wrapperRef.current) return;
        
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                // Если мы в полноэкранном режиме, берем высоту из viewport
                setDimensions({ 
                    width: width || window.innerWidth, 
                    height: isImmersive ? window.innerHeight - 60 : (height || 700) 
                });
            }
        });
        
        resizeObserver.observe(wrapperRef.current);
        return () => resizeObserver.disconnect();
    }, [isImmersive]);

    // Автоматическое развертывание во весь экран при скролле вниз
    useEffect(() => {
        const handleScroll = () => {
            if (!wrapperRef.current) return;
            
            const rect = wrapperRef.current.getBoundingClientRect();
            
            if (!isImmersive) {
                const deltaScroll = window.scrollY - initialScrollYRef.current;
                
                // Срабатывает если пользователь скроллит вниз (на >40px)
                // И верхняя граница карты подошла к верху экрана (<= 150px)
                // И карта всё еще видна в нижней части экрана (rect.bottom > 200)
                if (deltaScroll > 40 && rect.top <= 150 && rect.bottom > 200) {
                    originalTopRef.current = window.scrollY;
                    setIsImmersive(true);
                }
            } else {
                // Если мы в иммерсивном режиме и пользователь отскроллил вверх выше точки входа
                if (originalTopRef.current !== null && window.scrollY < originalTopRef.current - 80) {
                    handleCloseImmersive();
                }
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isImmersive]);

    // Закрытие по кнопке Escape
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
        initialScrollYRef.current = window.scrollY; // Сбрасываем скролл отсчета, чтобы избежать мгновенного авто-разворачивания
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
                fgRef.current.centerAt(foundNode.x, foundNode.y, 1000);
                fgRef.current.zoom(2.5, 1000);
            }
        }
    };

    return (
        <>
            {/* Плейсхолдер для избежания "прыжка" верстки, когда карта переходит в position: fixed */}
            {isImmersive && (
                <div className="mindmap-placeholder" style={{ height: '700px', width: '100%' }} />
            )}
            
            <div 
                ref={wrapperRef}
                className={`mindmap-wrapper ${isImmersive ? 'immersive' : ''}`} 
                style={isImmersive ? {} : { position: 'relative', width: '100%', height: '700px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', overflow: 'hidden' }}
            >
                {/* Иммерсивный верхний бар управления */}
                {isImmersive ? (
                    <div className="mindmap-immersive-header">
                        <h4>{t('immersive_title', 'Интерактивная карта знаний')}</h4>
                        <span className="mindmap-immersive-hint">{t('immersive_hint', 'Esc для выхода • Колесико для масштаба')}</span>
                        <button className="mindmap-close-immersive-btn" onClick={handleCloseImmersive}>
                            ✕ {t('immersive_close', 'Свернуть')}
                        </button>
                    </div>
                ) : (
                    // Кнопка ручного развертывания
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

                <div className="mindmap-search" style={{ position: 'absolute', top: isImmersive ? '80px' : '20px', left: '20px', zIndex: 10, width: '300px' }}>
                    <input 
                        type="text" 
                        placeholder={t('search_placeholder', 'Поиск по карте...')} 
                        value={searchQuery}
                        onChange={handleSearch}
                        className="yt-input"
                        style={{ width: '100%', marginBottom: '5px', background: 'rgba(15, 23, 42, 0.8)' }}
                    />
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
                    linkDirectionalArrowLength={3.5}
                    linkDirectionalArrowRelPos={1}
                    linkCurvature={0.25}
                    linkColor={() => 'rgba(255,255,255,0.1)'}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const label = node.name;
                        // Сокращаем текст для отображения внутри ноды
                        const truncatedLabel = label.length > 20 ? label.substring(0, 17) + '...' : label;
                        
                        const fontSize = (node.type === 'root' ? 4 : node.type === 'topic' ? 3 : 2.5);
                        ctx.font = `${fontSize}px Sans-Serif`;
                        
                        const textWidth = ctx.measureText(truncatedLabel).width;
                        const padding = fontSize * 0.8;
                        const nodeWidth = Math.max(node.val * 3, textWidth + padding * 2);
                        const nodeHeight = fontSize * 2.2;

                        // Рисуем "плашку" (закругленный прямоугольник/овал)
                        ctx.fillStyle = node.color;
                        ctx.beginPath();
                        const x = node.x - nodeWidth / 2;
                        const y = node.y - nodeHeight / 2;
                        const r = nodeHeight / 2; // Радиус скругления для формы овала
                        
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
                        ctx.fill();

                        // Подсветка при поиске
                        if (searchQuery && label.toLowerCase().includes(searchQuery.toLowerCase())) {
                            ctx.strokeStyle = '#ffffff';
                            ctx.lineWidth = 2 / globalScale;
                            ctx.stroke();
                        }

                        // Текст внутри плашки
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(truncatedLabel, node.x, node.y);
                    }}
                    cooldownTicks={100}
                    onNodeClick={node => {
                        fgRef.current.centerAt(node.x, node.y, 1000);
                        fgRef.current.zoom(3, 1000);
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
