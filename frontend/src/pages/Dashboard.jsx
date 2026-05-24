import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import './Dashboard.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import MindMap from './MindMap';
import SolarSystemBackground from './SolarSystemBackground';
import HeroParticles from './HeroParticles';
import { downloadYoutubeClientSide } from '../utils/youtubeDownloader';
import NotificationsBell from '../components/NotificationsBell';

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
    const [introState, setIntroState] = useState(() => {
        return localStorage.getItem('skipIntro') === 'true' ? 'completed' : 'playing';
    });
    const [isInitiallySkipped] = useState(() => {
        return localStorage.getItem('skipIntro') === 'true';
    });

    const [userRole, setUserRole] = useState(localStorage.getItem('role') || 'Standard');

    // Feedback states
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [isFeedbackPromptOpen, setIsFeedbackPromptOpen] = useState(false);
    const [feedbackModalTab, setFeedbackModalTab] = useState('write');
    const [feedbacks, setFeedbacks] = useState([]);
    const [feedbackRating, setFeedbackRating] = useState('Fine');
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

    const fetchUserFeedbacks = async () => {
        try {
            const response = await api.get('/feedbacks');
            setFeedbacks(response.data);
        } catch (error) {
            console.error('Ошибка загрузки отзывов:', error);
        }
    };

    const handleFeedbackSubmit = async (e) => {
        e.preventDefault();
        if (!feedbackMessage.trim()) return;

        setIsSubmittingFeedback(true);
        try {
            await api.post('/feedbacks', {
                rating: feedbackRating,
                message: feedbackMessage
            });
            alert(t('feedback_success_alert', 'Спасибо за ваш отзыв!'));
            setFeedbackMessage('');
            setFeedbackRating('Fine');
            fetchUserFeedbacks();
            setFeedbackModalTab('history');
        } catch (error) {
            alert(error.response?.data?.message || t('error_alert'));
        } finally {
            setIsSubmittingFeedback(false);
        }
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

    const handleIntroComplete = () => {
        setIntroState('blurring');
        localStorage.setItem('skipIntro', 'true');
        setTimeout(() => {
            setIntroState('completed');
        }, 1200);
    };

    const skipIntro = () => {
        setIntroState('blurring');
        localStorage.setItem('skipIntro', 'true');
        setTimeout(() => {
            setIntroState('completed');
        }, 1200);
    };

    // Плавный скролл мыши с использованием инерции и requestAnimationFrame (60 FPS без зависимостей)
    useEffect(() => {
        let targetScrollY = window.scrollY;
        let currentScrollY = window.scrollY;
        let isMoving = false;

        const onWheel = (e) => {
            if (e.ctrlKey || e.shiftKey) return;
            
            // Предотвращаем конфликт с локальными скроллбарами модальных окон, MindMap или текстовых полей
            const path = e.composedPath() || [];
            for (const element of path) {
                if (element === document.body || element === document.documentElement) break;
                if (element.scrollHeight > element.clientHeight) {
                    // Используем сверхбыстрые проверки без вызова getComputedStyle (Reflow-free)
                    if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
                        return;
                    }
                    const style = element.style || {};
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
                        return;
                    }
                    const className = element.className || '';
                    if (typeof className === 'string' && (className.includes('scroll') || className.includes('modal'))) {
                        return;
                    }
                }
            }

            e.preventDefault();
            targetScrollY = Math.max(0, Math.min(
                document.documentElement.scrollHeight - window.innerHeight,
                targetScrollY + e.deltaY * 0.85 // Депфирование шага
            ));

            if (!isMoving) {
                isMoving = true;
                requestAnimationFrame(updateScroll);
            }
        };

        const updateScroll = () => {
            const diff = targetScrollY - currentScrollY;
            if (Math.abs(diff) > 0.5) {
                currentScrollY += diff * 0.14; // Коэффициент сглаживания t (увеличен с 0.085 для большей упругости/отзывчивости)
                window.scrollTo(0, currentScrollY);
                requestAnimationFrame(updateScroll);
            } else {
                currentScrollY = targetScrollY;
                window.scrollTo(0, currentScrollY);
                isMoving = false;
            }
        };

        // Синхронизируем координаты скролла при кликах, переходах или ресайзе
        const syncScroll = () => {
            if (!isMoving) {
                targetScrollY = window.scrollY;
                currentScrollY = window.scrollY;
            }
        };

        window.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('scroll', syncScroll);
        
        return () => {
            window.removeEventListener('wheel', onWheel);
            window.removeEventListener('scroll', syncScroll);
        };
    }, []);

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

    const NavItems = () => {
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

                {localStorage.getItem('role') === 'admin' && (
                    <Link to="/admin" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('admin_panel')}</Link>
                )}
                <Link to="/mindmap" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('tab_mindmap', 'Карта знаний')}</Link>
                
                <span className="nav-link" onClick={() => { setIsFeedbackModalOpen(true); setIsMobileMenuOpen(false); }} style={{ cursor: 'pointer' }}>
                    💬 {t('feedback_nav')}
                </span>

                <Link to="/profile" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>{t('profile')}</Link>
                <span className="nav-link logout" onClick={() => {
                    localStorage.clear();
                    window.location.href = '/login';
                }}>{t('logout')}</span>
            </>
        );
    };

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
        let lastShowScrollTop = false;
        const handleScroll = () => {
            const nextShow = window.scrollY > 300;
            if (nextShow !== lastShowScrollTop) {
                lastShowScrollTop = nextShow;
                setShowScrollTop(nextShow);
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    useEffect(() => {
        loadHistory();
        fetchUserProfile();
        fetchUserFeedbacks();
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

    // авто-перенаправления через WebSockets с резервным HTTP-пуллингом
    useEffect(() => {
        if (!pollingJobId) return;

        let socket = null;
        let pollInterval = null;
        let isFallbackActive = false;

        const startHttpFallback = () => {
            if (isFallbackActive) return;
            isFallbackActive = true;
            console.log("⚠️ Switching to HTTP polling fallback...");
            
            pollInterval = setInterval(async () => {
                try {
                    const res = await api.get('/history');
                    const historyData = res.data.items || [];
                    setHistory(historyData);
                    
                    const finishedJob = historyData.find(j => j.job_id === pollingJobId && j.structured_analysis);
                    if (finishedJob) {
                        clearInterval(pollInterval);
                        setPollingJobId(null);
                        setStatus('');
                        openItem(finishedJob);
                        loadHistory();
                    }
                } catch (e) {
                    console.error("Error in HTTP polling fallback:", e);
                }
            }, 3000);
        };

        try {
            const token = localStorage.getItem('token');
            const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = `${wsProtocol}://${window.location.host}/api/ws?token=${encodeURIComponent(token || '')}`;

            console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log("✅ WebSocket connection opened");
                socket.send(JSON.stringify({
                    type: 'subscribe',
                    jobId: pollingJobId
                }));
            };

            socket.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("📥 WebSocket message received:", data);
                    if (data.type === 'status' && data.jobId === pollingJobId) {
                        if (data.status === 'COMPLETED') {
                            console.log("🎉 Analysis completed! Fetching results...");
                            try {
                                const res = await api.get('/history');
                                const historyData = res.data.items || [];
                                setHistory(historyData);
                                
                                const finishedJob = historyData.find(j => j.job_id === pollingJobId);
                                if (finishedJob) {
                                    setPollingJobId(null);
                                    setStatus('');
                                    openItem(finishedJob);
                                    loadHistory();
                                    socket.close();

                                    // Show feedback prompt every 2nd completed analysis
                                    const prevCount = parseInt(localStorage.getItem('analysisCompletedCount') || '0', 10);
                                    const nextCount = prevCount + 1;
                                    localStorage.setItem('analysisCompletedCount', String(nextCount));
                                    if (nextCount % 2 === 0) {
                                        // Small delay so the results panel has time to render first
                                        setTimeout(() => setIsFeedbackPromptOpen(true), 1500);
                                    }
                                } else {
                                    startHttpFallback();
                                }
                            } catch (err) {
                                console.error("Error loading completed job:", err);
                                startHttpFallback();
                            }
                        } else if (data.status.startsWith('FAILED')) {
                            console.error("❌ Analysis failed:", data.status);
                            setPollingJobId(null);
                            setStatus('Ошибка добавления задачи');
                            alert(`Ошибка анализа: ${data.status.replace('FAILED:', '')}`);
                            loadHistory();
                            socket.close();
                        } else {
                            if (data.status === 'PROCESSING') {
                                setStatus(t('btn_loading') || 'Обработка...');
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error parsing WebSocket message:", err);
                }
            };

            socket.onerror = (err) => {
                console.error("❌ WebSocket error:", err);
                startHttpFallback();
            };

            socket.onclose = (event) => {
                console.log(`🔌 WebSocket connection closed (code: ${event.code})`);
                if (pollingJobId && !isFallbackActive && event.code !== 1000) {
                    startHttpFallback();
                }
            };
        } catch (err) {
            console.error("Failed to initialize WebSocket:", err);
            startHttpFallback();
        }

        return () => {
            if (socket) {
                socket.close();
            }
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
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
            <SolarSystemBackground 
                history={history} 
                introState={introState} 
                onIntroComplete={handleIntroComplete}
                isPaused={isFeedbackModalOpen || isFeedbackPromptOpen}
            />
            {introState === 'playing' && (
                <button className="skip-intro-btn" onClick={skipIntro}>
                    {t('skip_intro', 'Пропустить')}
                </button>
            )}
            <div className={`dashboard-container ${introState === 'completed' ? 'intro-fade-in' : 'intro-active'} ${isInitiallySkipped ? 'intro-fast' : ''}`}>
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
                    <section className="hero-section" style={{ position: 'relative' }}>
                        {introState === 'completed' && <HeroParticles />}
                        <h1 style={{ position: 'relative', zIndex: 2 }}>{t('hero_title')}</h1>
                        <p style={{ position: 'relative', zIndex: 2 }}>{t('hero_subtitle')}</p>
                        
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

            {/* Two-step feedback prompt: shown after every 2nd analysis */}
            {isFeedbackPromptOpen && (
                <div
                    className="modal-overlay fade-in"
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10001,
                    }}
                >
                    <div
                        className="fade-in-up"
                        style={{
                            background: 'rgba(22, 33, 55, 0.95)',
                            backdropFilter: 'blur(24px)',
                            border: '1px solid rgba(168, 85, 247, 0.25)',
                            borderRadius: '24px',
                            padding: '36px 32px',
                            width: '90%',
                            maxWidth: '420px',
                            boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px',
                        }}
                    >
                        <div style={{ fontSize: '48px', lineHeight: 1 }}>💬</div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', background: 'linear-gradient(135deg, #a855f7, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                {t('feedback_prompt_title', 'Понравился анализ?')}
                            </h3>
                            <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#94a3b8', lineHeight: 1.5 }}>
                                {t('feedback_prompt_subtitle', 'Уделите минуту и оставьте отзыв — это помогает нам стать лучше.')}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => {
                                    setIsFeedbackPromptOpen(false);
                                    setFeedbackModalTab('write');
                                    setIsFeedbackModalOpen(true);
                                }}
                                style={{
                                    flex: 1, padding: '13px', borderRadius: '14px',
                                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                                    color: 'white', fontWeight: '700', fontSize: '14px',
                                    border: 'none', cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(168, 85, 247, 0.35)',
                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.45)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 15px rgba(168,85,247,0.35)'; }}
                            >
                                ✍️ {t('feedback_prompt_submit', 'Оставить отзыв')}
                            </button>
                            <button
                                onClick={() => setIsFeedbackPromptOpen(false)}
                                style={{
                                    flex: 1, padding: '13px', borderRadius: '14px',
                                    background: 'rgba(30, 41, 59, 0.6)',
                                    color: '#94a3b8', fontWeight: '600', fontSize: '14px',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(51,65,85,0.6)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30,41,59,0.6)'; }}
                            >
                                {t('feedback_prompt_skip', 'Пропустить')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isFeedbackModalOpen && (
                <div 
                    className="modal-overlay fade-in"
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(12px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                    }}
                    onClick={() => setIsFeedbackModalOpen(false)}
                >
                    <div 
                        className="modal-content fade-in-up"
                        style={{
                            background: 'rgba(30, 41, 59, 0.85)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '24px',
                            width: '90%',
                            maxWidth: '520px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            overflow: 'hidden',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Шапка модалки */}
                        <div style={{
                            padding: '24px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(15, 23, 42, 0.2)'
                        }}>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', background: 'linear-gradient(135deg, #a855f7, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                {t('feedback_title')}
                            </h2>
                            <button 
                                onClick={() => setIsFeedbackModalOpen(false)}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', outline: 'none' }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Переключатель вкладок */}
                        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <button 
                                onClick={() => setFeedbackModalTab('write')}
                                style={{
                                    flex: 1, padding: '14px', border: 'none', background: 'none', color: feedbackModalTab === 'write' ? '#a855f7' : '#94a3b8',
                                    fontWeight: '700', fontSize: '14px', cursor: 'pointer', borderBottom: feedbackModalTab === 'write' ? '2px solid #a855f7' : 'none', outline: 'none'
                                }}
                            >
                                {t('feedback_modal_title')}
                            </button>
                            <button 
                                onClick={() => setFeedbackModalTab('history')}
                                style={{
                                    flex: 1, padding: '14px', border: 'none', background: 'none', color: feedbackModalTab === 'history' ? '#a855f7' : '#94a3b8',
                                    fontWeight: '700', fontSize: '14px', cursor: 'pointer', borderBottom: feedbackModalTab === 'history' ? '2px solid #a855f7' : 'none', outline: 'none'
                                }}
                            >
                                {t('feedback_nav')} ({feedbacks.length})
                            </button>
                        </div>

                        {/* Содержимое вкладок */}
                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            {feedbackModalTab === 'write' ? (
                                <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div>
                                        <label style={{ display: 'block', color: '#cbd5e1', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                                            {t('feedback_rating_label')}
                                        </label>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            {[
                                                { key: 'Fine', emoji: '🤩', text: t('rating_fine') },
                                                { key: 'Good', emoji: '😊', text: t('rating_good') },
                                                { key: 'Okay', emoji: '😐', text: t('rating_okay') },
                                                { key: 'Bad', emoji: '😞', text: t('rating_bad') },
                                                { key: 'Very Bad', emoji: '🤬', text: t('rating_very_bad') }
                                            ].map((r) => (
                                                <button
                                                    key={r.key}
                                                    type="button"
                                                    onClick={() => setFeedbackRating(r.key)}
                                                    style={{
                                                        flex: 1, padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                                                        borderRadius: '12px', background: feedbackRating === r.key ? 'rgba(168, 85, 247, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                                                        border: feedbackRating === r.key ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.06)',
                                                        cursor: 'pointer', color: 'white', transition: 'all 0.2s', outline: 'none'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '24px' }}>{r.emoji}</span>
                                                    <span style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', tracking: '0.5px' }}>{r.text}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <textarea
                                            placeholder={t('feedback_comment_placeholder')}
                                            value={feedbackMessage}
                                            onChange={(e) => setFeedbackMessage(e.target.value)}
                                            required
                                            style={{
                                                width: '100%', minHeight: '110px', padding: '14px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.3)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', fontSize: '13px', outline: 'none', resize: 'vertical'
                                            }}
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmittingFeedback}
                                        style={{
                                            padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                                            color: 'white', fontWeight: '700', fontSize: '14px', border: 'none', cursor: 'pointer',
                                            boxShadow: '0 4px 15px rgba(168, 85, 247, 0.3)', transition: 'all 0.2s', outline: 'none'
                                        }}
                                    >
                                        {isSubmittingFeedback ? t('btn_loading') : t('feedback_submit_btn')}
                                    </button>
                                </form>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {feedbacks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8', fontSize: '13px' }}>
                                            💬 Поделитесь своим мнением о нашей системе!
                                        </div>
                                    ) : (
                                        feedbacks.map((f) => {
                                            const ratingEmoji = {
                                                'Fine': '🤩', 'Good': '😊', 'Okay': '😐', 'Bad': '😞', 'Very Bad': '🤬'
                                            }[f.rating] || '💬';

                                            return (
                                                <div 
                                                    key={f.id} 
                                                    style={{
                                                        padding: '16px', borderRadius: '16px', background: 'rgba(15, 23, 42, 0.25)',
                                                        border: '1px solid rgba(255, 255, 255, 0.04)', display: 'flex', flexDirection: 'column', gap: '10px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: '18px' }}>
                                                            {ratingEmoji} <strong style={{ fontSize: '12px', color: '#cbd5e1' }}>{t(`rating_${f.rating.toLowerCase().replace(' ', '_')}`)}</strong>
                                                        </span>
                                                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                            {new Date(f.created_at).toLocaleDateString(i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US')}
                                                        </span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '13px', color: '#f8fafc', lineHeight: '1.4', wordBreak: 'break-word' }}>{f.message}</p>
                                                    
                                                    {/* Ответ админа (маскированный) */}
                                                    {f.reply && (
                                                        <div style={{
                                                            marginTop: '8px', padding: '12px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.08)',
                                                            borderLeft: '3px solid #6366f1', display: 'flex', flexDirection: 'column', gap: '6px'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#818cf8', textTransform: 'uppercase' }}>
                                                                    🛡️ {t('feedback_admin_role')}
                                                                </span>
                                                                <span style={{ fontSize: '9px', color: '#64748b' }}>
                                                                    {new Date(f.reply.created_at).toLocaleDateString(i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US')}
                                                                </span>
                                                            </div>
                                                            <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4', wordBreak: 'break-word' }}>{f.reply.text}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    );
};

export default Dashboard;