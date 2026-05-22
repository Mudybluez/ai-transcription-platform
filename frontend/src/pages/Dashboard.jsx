import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import './Dashboard.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import MindMap from './MindMap';
import SolarSystemBackground from './SolarSystemBackground';
import { downloadYoutubeClientSide } from '../utils/youtubeDownloader';

const Dashboard = () => {
    // 1. Hooks (States & Refs)
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [status, setStatus] = useState('');
    const [history, setHistory] = useState([]);
    const [inputMode, setInputMode] = useState('youtube'); 
    const [selectedFile, setSelectedFile] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [audioChunks, setAudioChunks] = useState([]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [pollingJobId, setPollingJobId] = useState(null);
    const [activeItem, setActiveItem] = useState(null);
    const [currentTab, setCurrentTab] = useState('summary');
    const [animationClass, setAnimationClass] = useState('');
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [quizAnswers, setQuizAnswers] = useState({});
    const [revealedAnswers, setRevealedAnswers] = useState({}); 
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [highlightText, setHighlightText] = useState(null);

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const canvasRef = useRef(null);
    const timerIntervalRef = useRef(null);
    const touchStartX = useRef(0);

    const currentLang = (i18n.language || 'ru').split('-')[0].toLowerCase();

    // 2. Functions
    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
        setIsMobileMenuOpen(false);
    };

    const NavItems = () => (
        <>
            <select 
                className="lang-switcher" 
                onChange={(e) => changeLanguage(e.target.value)} 
                value={i18n.language}
            >
                <option value="en">EN</option>
                <option value="ru">RU</option>
                <option value="kk">KK</option>
            </select>

            {localStorage.getItem('role') === 'admin' && (
                <Link to="/admin" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('admin_panel')}</Link>
            )}
            <Link to="/mindmap" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('tab_mindmap', 'Карта знаний')}</Link>
            <Link to="/profile" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('profile')}</Link>
            <span className="nav-link logout" onClick={() => {
                localStorage.clear();
                window.location.href = '/login';
            }}>{t('logout')}</span>
        </>
    );

    useEffect(() => {
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const drawVisualizer = () => {
        if (!analyserRef.current || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            animationFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = 1.5; // Сделали намного уже
            let barHeight;
            let x = 0;
            
            // Рисуем только значимые частоты (первые 80%)
            const countToDraw = Math.min(bufferLength, 100); 
            
            for (let i = 0; i < countToDraw; i++) {
                barHeight = dataArray[i] / 1.5;
                
                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#a855f7');
                gradient.addColorStop(1, '#6366f1');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1.5; // Увеличили плотность
            }
        };
        draw();
    };

    // Обработчик свайпа для карточек
    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const diff = touchStartX.current - touchEndX;

        if (Math.abs(diff) > 30) { 
            if (diff > 0) { // Свайп влево = следующая
                if (currentCardIndex < (activeItem?.analysis?.flashcards?.length - 1)) {
                    setAnimationClass('sliding-next');
                    setTimeout(() => {
                        setIsFlipped(false);
                        setCurrentCardIndex(p => p + 1);
                        setAnimationClass('');
                    }, 500);
                }
            } else { // Свайп вправо = предыдущая
                if (currentCardIndex > 0) {
                    setAnimationClass('sliding-prev');
                    setTimeout(() => {
                        setIsFlipped(false);
                        setCurrentCardIndex(p => p - 1);
                        setAnimationClass('');
                    }, 500);
                }
            }
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 300);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    useEffect(() => {
        loadHistory();
    }, []);

    // Эффект для обработки перехода с глобальной карты связей (state из react-router)
    useEffect(() => {
        if (location.state && history.length > 0) {
            const { openItemId, highlightText: stateHighlightText } = location.state;
            if (openItemId) {
                const itemToOpen = history.find(item => String(item.id) === String(openItemId));
                if (itemToOpen) {
                    openItem(itemToOpen, stateHighlightText);
                    // Очищаем state, чтобы при перезагрузке страницы не открывалось заново
                    window.history.replaceState({}, document.title);
                }
            } else if (stateHighlightText) {
                setHighlightText(stateHighlightText);
                window.history.replaceState({}, document.title);
            }
        }
    }, [location.state, history]);

    // Эффект для подсветки предложений и прокрутки при клике на ноду карты связей
    useEffect(() => {
        if (!highlightText || !activeItem) return;

        let attempts = 0;
        const maxAttempts = 10;

        const tryHighlight = () => {
            // Очищаем предыдущую подсветку
            const prevMarks = document.querySelectorAll('mark.highlight-mark');
            prevMarks.forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(mark.textContent), mark);
                    parent.normalize();
                }
            });

            const query = highlightText.trim();
            if (!query) return;

            // Контейнеры с текстом анализа
            const containers = document.querySelectorAll('.analysis-summary, .markdown-body, .insight-card, .takeaways-box, .topic-card');
            
            if (containers.length === 0) {
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(tryHighlight, 100);
                }
                return;
            }

            let foundElement = null;

            // Функция очистки строки от пунктуации и пробелов
            const cleanStr = (s) => s.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()?"'–—]/g, "");

            // Функция поиска индекса совпадения (с поддержкой очистки от пунктуации)
            const findMatchIndex = (text, q) => {
                let idx = text.toLowerCase().indexOf(q.toLowerCase());
                if (idx >= 0) return { index: idx, length: q.length };

                const cleanedQuery = cleanStr(q);
                if (cleanedQuery.length < 3) return null;

                const cleanedText = cleanStr(text);
                const cleanIdx = cleanedText.indexOf(cleanedQuery);
                if (cleanIdx >= 0) {
                    for (let start = 0; start < text.length; start++) {
                        for (let len = cleanedQuery.length; len <= text.length - start; len++) {
                            const candidate = text.substring(start, start + len);
                            if (cleanStr(candidate) === cleanedQuery) {
                                return { index: start, length: len };
                            }
                        }
                    }
                }
                return null;
            };

            containers.forEach(container => {
                const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
                const nodesToReplace = [];
                let node;
                while (node = walk.nextNode()) {
                    const text = node.nodeValue;
                    let matchResult = findMatchIndex(text, query);
                    let matchedLength = query.length;

                    // Fallback 1: первые 25 символов
                    if (!matchResult && query.length > 25) {
                        const sub = query.substring(0, 25);
                        matchResult = findMatchIndex(text, sub);
                        if (matchResult) matchedLength = sub.length;
                    }

                    // Fallback 2: первые 15 символов
                    if (!matchResult && query.length > 15) {
                        const sub = query.substring(0, 15);
                        matchResult = findMatchIndex(text, sub);
                        if (matchResult) matchedLength = sub.length;
                    }

                    if (matchResult) {
                        nodesToReplace.push({ node, text, index: matchResult.index, length: matchedLength });
                    }
                }

                nodesToReplace.forEach(({ node, text, index, length }) => {
                    const parent = node.parentNode;
                    if (!parent || parent.tagName === 'MARK' || parent.classList.contains('highlight-mark')) return;

                    const before = text.substring(0, index);
                    const match = text.substring(index, index + length);
                    const after = text.substring(index + length);

                    const fragment = document.createDocumentFragment();
                    if (before) fragment.appendChild(document.createTextNode(before));

                    const mark = document.createElement('mark');
                    mark.className = 'highlight-mark';
                    mark.textContent = match;
                    fragment.appendChild(mark);

                    if (after) fragment.appendChild(document.createTextNode(after));

                    parent.replaceChild(fragment, node);
                    if (!foundElement) {
                        foundElement = mark;
                    }
                });
            });

            if (foundElement) {
                foundElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                foundElement.classList.add('pulse-highlight');
                setTimeout(() => {
                    foundElement.classList.remove('pulse-highlight');
                }, 3000);
            } else {
                // Если не нашли на этой итерации, но контейнеры уже есть,
                // возможно данные еще рендерятся внутри них. Попробуем еще раз чуть позже.
                attempts++;
                if (attempts < 5) {
                    setTimeout(tryHighlight, 200);
                }
            }
        };

        const timer = setTimeout(tryHighlight, 100);
        return () => clearTimeout(timer);
    }, [highlightText, activeItem, currentTab]);

    // авто-перенаправления
    useEffect(() => {
        let interval;
        if (pollingJobId) {
            interval = setInterval(async () => {
                try {
                    const res = await api.get('/history');
                    const historyData = res.data.items || [];
                    
                    // Only update history if polling is active
                    setHistory(historyData);
                    
                    const finishedJob = historyData.find(j => j.job_id === pollingJobId && j.structured_analysis);
                    if (finishedJob) {
                        clearInterval(interval);
                        setPollingJobId(null);
                        setStatus('');
                        openItem(finishedJob);
                        loadHistory();
                    }
                } catch (e) {
                    console.error(e);
                }
            }, 3000); 
        }
        return () => clearInterval(interval);
    }, [pollingJobId]);

    const loadHistory = async () => {
        try {
            const response = await api.get('/history');
            setHistory(response.data.items || []);
        } catch (error) {
            console.error("Ошибка загрузки истории");
        }
    };

    const openItem = async (item, initialHighlight = null) => {
        const analysis = typeof item.structured_analysis === 'string' 
            ? JSON.parse(item.structured_analysis) 
            : item.structured_analysis;
            
        let mindmap = null;
        try {
            const mmRes = await api.get(`/mindmap/mindmap/${item.job_id || item.id}`);
            mindmap = mmRes.data;
        } catch (e) {
            if (analysis.mind_map) {
                mindmap = {
                    transcription_id: item.job_id,
                    nodes: analysis.mind_map.nodes,
                    links: analysis.mind_map.links
                };
            }
        }

        setActiveItem({ ...item, analysis, mindmap });
        setCurrentTab('summary');
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setQuizAnswers({});
        setRevealedAnswers({});
        setHighlightText(initialHighlight);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(t('btn_loading'));
        try {
            let response;
            if (inputMode === 'youtube') {
                if (!youtubeUrl) {
                    alert("Пожалуйста, введите ссылку на YouTube");
                    return;
                }
                // Больше не передаем language, так как анализ теперь мультиязычный
                response = await api.post('/upload/youtube', { url: youtubeUrl });
                setYoutubeUrl('');
            } else if (inputMode === 'file' || inputMode === 'record') {
                if (!selectedFile) {
                    alert("Пожалуйста, выберите файл или запишите аудио");
                    return;
                }
                const formData = new FormData();
                formData.append('language', currentLang); 
                formData.append('mediaFile', selectedFile); 
                response = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                setSelectedFile(null);
            }
            
            if (response && response.data.job_id) {
                setPollingJobId(response.data.job_id);
            }
        } catch (err) {
            const errorMsg = err.response?.data?.message || "Произошла ошибка при отправке данных на сервер.";
            setStatus('Ошибка добавления задачи');
            alert(errorMsg);
            console.error(err);
        }
    };

    // Логика записи
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Настройка визуализатора
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const recorder = new MediaRecorder(stream);
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const file = new File([blob], `recorded_audio_${Date.now()}.webm`, { type: 'audio/webm' });
                setSelectedFile(file);
            };
            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
            setRecordingTime(0);

            // Таймер
            timerIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            // Визуал (ждем пока отрисуется канвас)
            setTimeout(drawVisualizer, 100);

        } catch (err) {
            console.error("Ошибка доступа к микрофону", err);
            alert("Нет доступа к микрофону");
        }
    };

    const stopRecording = () => {
        if (mediaRecorder) {
            mediaRecorder.stop();
            setIsRecording(false);
            mediaRecorder.stream.getTracks().forEach(track => track.stop());

            if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }

            if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            }

            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        }
    };

    const deleteHistoryItem = async (e, id) => {
        e.stopPropagation(); // Чтобы не открывалась карточка
        if (!window.confirm(t('confirm_delete'))) return;

        try {
            await api.delete(`/history/${id}`);
            setHistory(prev => prev.filter(item => item.id !== id));
        } catch (error) {
            alert("Не удалось удалить запись");
        }
    };

    const copyToClipboard = () => {
        if (!activeItem || !activeItem.analysis) return;
        
        const summary = getMarkdownText(activeItem.analysis.summary?.[currentLang] || activeItem.analysis.summary);
        const detailed = getMarkdownText(activeItem.analysis.detailed_analysis?.[currentLang] || activeItem.analysis.detailed_analysis);
        const title = (activeItem.analysis.title?.[currentLang] || activeItem.analysis.title) || `Analysis #${activeItem.job_id}`;
        
        const textToCopy = `# ${title}

## Summary
${summary}

## Detailed Analysis
${detailed}`;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert(t('copied_alert', 'Скопировано в буфер обмена'));
        }).catch(err => {
            console.error('Ошибка при копировании:', err);
        });
    };

    // Навигация по карточкам

    const nextCard = () => {
        setAnimationClass('sliding-next');
        setTimeout(() => {
            setIsFlipped(false);
            setCurrentCardIndex(p => p + 1);
            setAnimationClass('');
        }, 500);
    };
    const prevCard = () => {
        setAnimationClass('sliding-prev');
        setTimeout(() => {
            setIsFlipped(false);
            setCurrentCardIndex(p => p - 1);
            setAnimationClass('');
        }, 500);
    };

    const getMarkdownText = (data) => {
        if (!data) return '';
        if (typeof data === 'string') return data;
        if (Array.isArray(data)) return data.join('\n\n'); 
        return JSON.stringify(data, null, 2); 
    };

    // Хелпер для получения текста на нужном языке (с фолбеком на строку)
    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[currentLang] || obj['ru'] || '';
    };

    return (
        <>
            <SolarSystemBackground history={history} />
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

            {!activeItem ? (
                <div className="fade-in-up">
                    <section className="hero-section">
                        <h1>{t('hero_title')}</h1>
                        <p>{t('hero_subtitle')}</p>
                        
                        <div className="mode-selector">
                            <button className={inputMode === 'youtube' ? 'active' : ''} onClick={() => setInputMode('youtube')}>{t('type_youtube')}</button>
                            <button className={inputMode === 'file' ? 'active' : ''} onClick={() => setInputMode('file')}>{t('type_upload')}</button>
                            <button className={inputMode === 'record' ? 'active' : ''} onClick={() => setInputMode('record')}>{t('type_record')}</button>
                        </div>

                        <form className="input-group" onSubmit={handleSubmit}>
                            {inputMode === 'youtube' && (
                                <input 
                                    type="url" 
                                    className="yt-input" 
                                    placeholder={t('input_placeholder')} 
                                    value={youtubeUrl}
                                    onChange={(e) => setYoutubeUrl(e.target.value)}
                                    disabled={!!pollingJobId}
                                    required
                                />
                            )}

                            {inputMode === 'file' && (
                                <div className="file-input-wrapper">
                                    <input 
                                        type="file" 
                                        accept="audio/*,video/*"
                                        onChange={(e) => setSelectedFile(e.target.files[0])}
                                        disabled={!!pollingJobId}
                                        className="file-input-hidden"
                                        id="file-upload"
                                    />
                                    <label htmlFor="file-upload" className="yt-input file-label">
                                        {selectedFile ? selectedFile.name : t('upload_placeholder')}
                                    </label>
                                </div>
                            )}

                            {inputMode === 'record' && (
                                <div className="record-controls">
                                    <div className="record-status-container">
                                        {!isRecording ? (
                                            <button type="button" className="btn-record" onClick={startRecording} disabled={!!pollingJobId}>
                                                {t('record_start')}
                                            </button>
                                        ) : (
                                            <div className="recording-active-ui">
                                                <button type="button" className="btn-record recording" onClick={stopRecording}>
                                                    {t('record_stop')}
                                                </button>
                                                <span className="recording-timer">{formatTime(recordingTime)}</span>
                                                <canvas ref={canvasRef} className="visualizer-canvas" width="300" height="40"></canvas>
                                            </div>
                                        )}
                                        {selectedFile && !isRecording && (
                                            <span className="file-ready-badge">{t('record_ready')}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <button type="submit" className="btn-primary" disabled={!!pollingJobId || (inputMode !== 'youtube' && !selectedFile)}>
                                {pollingJobId ? t('btn_loading') : t('btn_process')}
                            </button>
                        </form>
                        {status && <div className="status-pulse">{status}</div>}
                    </section>

                    <section>
                        <h2 className="section-title">{t('library')}</h2>
                        <div className="history-grid">
                            {history.map((item) => {
                                const analysis = typeof item.structured_analysis === 'string' 
                                    ? JSON.parse(item.structured_analysis) 
                                    : item.structured_analysis;
                                const isReady = !!analysis;

                                return (
                                    <div key={item.id} className={`history-card ${!isReady ? 'processing' : ''}`} onClick={() => isReady && openItem(item)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <h3>{isReady ? getLangText(analysis.title) : `${t('history_item_title')} #${item.job_id}`}</h3>
                                            <button 
                                                className="delete-item-btn" 
                                                onClick={(e) => deleteHistoryItem(e, item.id)}
                                                title={t('delete_btn')}
                                            >
                                                {t('delete_btn')}
                                            </button>
                                        </div>
                                        <p>
                                            {!isReady 
                                                ? t('status_processing', 'Видео в процессе обработки...') 
                                                : (getLangText(analysis.summary).substring(0, 80) + '...')}
                                        </p>
                                        {isReady && <span className="card-link">{t('open_btn', 'Открыть')}</span>}
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </div>
            ) : (
                <div className="fade-in">
                    <div className="analysis-header">
                        <button className="back-btn" onClick={() => { setActiveItem(null); setHighlightText(null); }} style={{ marginBottom: 0 }}>
                            {t('back_btn')}
                        </button>
                        <button className="btn-primary copy-btn" onClick={copyToClipboard}>
                            {t('copy_btn')}
                        </button>
                    </div>
                    
                    <div className="tabs-container">
                        {['summary', 'mindmap', 'flashcards', 'quiz', 'transcript'].map(tab => (
                            <button 
                                key={tab}
                                className={`tab-btn ${currentTab === tab ? 'active' : ''}`} 
                                onClick={() => setCurrentTab(tab)}
                            >
                                {tab === 'summary' && t('tab_summary', 'Анализ')}
                                {tab === 'mindmap' && t('tab_mindmap', 'Карта')}
                                {tab === 'flashcards' && t('tab_flashcards', 'Карточки')}
                                {tab === 'quiz' && t('tab_quiz', 'Тест')}
                                {tab === 'transcript' && t('tab_text', 'Текст')}
                            </button>
                        ))}
                    </div>

                    <div className="content-box slide-up">
                        {currentTab === 'summary' && (
                            <div className="analysis-layout">
                                <div className="markdown-body hero-summary">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(getLangText(activeItem.analysis?.summary))}
                                    </ReactMarkdown>
                                </div>

                                <h2 className="section-title" style={{marginTop: '40px'}}>{t('key_insights')}</h2>
                                <div className="insights-grid">
                                    {activeItem.analysis?.key_topics?.map((topic, i) => (
                                    <div key={i} className="insight-card">
                                            <div className="insight-icon">{t('insight_part')} {i + 1}</div>
                                            <div>
                                        <h4>{getLangText(topic.title)}</h4>
                                                <ul className="insight-points">
                                                    {(topic.key_points?.[currentLang] || topic.key_points?.['ru'] || topic.key_points)?.map((pt, j) => <li key={j}>{pt}</li>)}
                                                </ul>
                                                <div className="insight-relevance">
                                                    <strong>{t('why_important', 'Почему это важно:')}</strong> {getLangText(topic.relevance)}
                                    </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <h2 className="section-title" style={{marginTop: '50px'}}>{t('detailed_analysis')}</h2>
                                <div className="markdown-body detailed-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(getLangText(activeItem.analysis?.detailed_analysis))}
                                    </ReactMarkdown>
                                </div>

                                <div className="takeaways-box">
                                    <h3>{t('takeaways', 'Главные выводы')}</h3>
                                    <ul>
                                        {(activeItem.analysis?.takeaways?.[currentLang] || activeItem.analysis?.takeaways?.['ru'] || activeItem.analysis?.takeaways)?.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {currentTab === 'mindmap' && activeItem.mindmap && (
                            <MindMap 
                                data={activeItem.mindmap} 
                                onNavigateToTopic={(topicName) => {
                                    setCurrentTab('summary');
                                    setHighlightText(topicName);
                                }}
                            />
                        )}

                        {currentTab === 'transcript' && (
                            <div className="transcript-text">
                                {activeItem.raw_text}
                            </div>
                        )}

                        {currentTab === 'flashcards' && (
                            <div className="carousel-section">
                                <button className="arrow-btn prev" onClick={prevCard} disabled={currentCardIndex === 0}>‹</button>

                                <div className={`flashcard-scene ${animationClass}`} onClick={() => setIsFlipped(!isFlipped)} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                                    <div className={`flashcard-inner ${isFlipped ? 'is-flipped' : ''}`}>
                                        <div className="flashcard-front">
                                            <span className="card-counter">{currentCardIndex + 1} / {activeItem.analysis?.flashcards?.length}</span>
                                            <h3>{getLangText(activeItem.analysis?.flashcards?.[currentCardIndex]?.question)}</h3>
                                            <span className="flip-hint">{t('click_to_flip', 'Нажми, чтобы перевернуть')}</span>
                                        </div>
                                        <div className="flashcard-back">
                                            <p>{getLangText(activeItem.analysis?.flashcards?.[currentCardIndex]?.answer)}</p>
                                        </div>
                                    </div>
                                </div>

                                <button className="arrow-btn next" onClick={nextCard} disabled={currentCardIndex === (activeItem.analysis?.flashcards?.length - 1)}>›</button>
                            </div>
                        )}

                        {currentTab === 'quiz' && (
                            <div className="quiz-container">
                                {activeItem.analysis?.quiz?.map((q, qIndex) => {
                                    const options = q.options?.[currentLang] || q.options?.['ru'] || q.options;
                                    const correctAnswer = getLangText(q.correct_answer);
                                    
                                    const isAnswered = quizAnswers[qIndex] !== undefined;
                                    const isCorrect = quizAnswers[qIndex] === correctAnswer;
                                    const isRevealed = revealedAnswers[qIndex];

                                    return (
                                <div key={qIndex} className="quiz-card">
                                            <h3><span className="q-num">{qIndex + 1}</span> {getLangText(q.question)}</h3>
                                            <div className="options-grid">
                                                {options?.map((opt, optIndex) => {
                                                    let btnClass = "quiz-option";
                                                    if (isAnswered || isRevealed) {
                                                        if (opt === correctAnswer && (isCorrect || isRevealed)) btnClass += " correct";
                                                        else if (quizAnswers[qIndex] === opt && !isCorrect) btnClass += " wrong";
                                                        else btnClass += " disabled";
                                                    }

                                                    return (
                                                        <button 
                                                            key={optIndex} 
                                                            className={btnClass}
                                                            onClick={() => !isAnswered && setQuizAnswers({...quizAnswers, [qIndex]: opt})}
                                                            disabled={isAnswered || isRevealed}
                                                        >
                                                            {opt}
                                                        </button>
                                                    )
                                                })}
                                </div>
                                            {isAnswered && !isCorrect && !isRevealed && (
                                                <button className="reveal-btn fade-in" onClick={() => setRevealedAnswers({...revealedAnswers, [qIndex]: true})}>
                                                    {t('show_answer', 'Показать правильный ответ')}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {showScrollTop && (
                <button 
                    className="scroll-top-btn" 
                    onClick={scrollToTop}
                    style={{
                        position: 'fixed',
                        bottom: '30px',
                        right: '30px',
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        backgroundColor: '#6366f1',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        zIndex: 1000,
                        transition: 'all 0.3s ease'
                    }}
                >
                    ↑
                </button>
            )}
        </div>
        </>
    );
};

export default Dashboard;