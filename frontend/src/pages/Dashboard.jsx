import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import './Dashboard.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import MindMap from './MindMap';
import HeroParticles from './HeroParticles';
import NotificationsBell from '../components/NotificationsBell';
import { addSocketListener, sendSocketMessage } from '../utils/sharedSocket';
import Icon from '../components/Icon';

const NavItems = ({
    userRole,
    changeLanguage,
    i18n,
    setIsMobileMenuOpen,
    setIsFeedbackModalOpen,
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

            {localStorage.getItem('role') === 'admin' && (
                <Link to="/admin" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>
                    <Icon name="shield" size={14} style={{ marginRight: 4 }} />
                    {t('admin_panel', 'Админка')}
                </Link>
            )}
            <Link to="/mindmap" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>
                <Icon name="network" size={14} style={{ marginRight: 4 }} />
                {t('tab_mindmap', 'Карта знаний')}
            </Link>
            
            <span className="nav-link" onClick={() => { setIsFeedbackModalOpen(true); setIsMobileMenuOpen(false); }} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                <Icon name="message_circle" size={14} style={{ marginRight: 4 }} />
                {t('feedback_nav', 'Отзывы')}
            </span>

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

export default function Dashboard() {
    const { t, i18n } = useTranslation();
    const location = useLocation();

    // Core States
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
    
    // Detail and tabs
    const [activeItem, setActiveItem] = useState(null);
    const [currentTab, setCurrentTab] = useState('summary');
    const [animationClass, setAnimationClass] = useState('');
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [quizAnswers, setQuizAnswers] = useState({});
    const [revealedAnswers, setRevealedAnswers] = useState({}); 
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [highlightText, setHighlightText] = useState(null);
    
    const [userRole, setUserRole] = useState(localStorage.getItem('role') || 'Standard');
    const [remainingRequests, setRemainingRequests] = useState(null);

    // Feedback States
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [isFeedbackPromptOpen, setIsFeedbackPromptOpen] = useState(false);
    const [feedbackModalTab, setFeedbackModalTab] = useState('write');
    const [feedbacks, setFeedbacks] = useState([]);
    const [feedbackRating, setFeedbackRating] = useState('Fine');
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

    // Refs
    const heroTriggerRef = useRef(null);
    const modeListRef = useRef(null);
    const detailTabsRef = useRef(null);

    // UI Pill Indicators Coordinates
    const [modePill, setModePill] = useState({ left: 0, width: 0 });
    const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });

    const MODES = [
        { id: 'youtube', label: 'YouTube', icon: 'youtube' },
        { id: 'file', label: t('type_upload', 'Файл'), icon: 'file' },
        { id: 'record', label: t('type_record', 'Запись'), icon: 'mic' }
    ];

    const DETAIL_TABS = [
        { id: 'summary', label: t('tab_summary', 'Анализ'), icon: 'file_text' },
        { id: 'mindmap', label: t('tab_mindmap', 'Карта'), icon: 'network' },
        { id: 'flashcards', label: t('tab_flashcards', 'Карточки'), icon: 'layers' },
        { id: 'quiz', label: t('tab_quiz', 'Тест'), icon: 'help_circle' },
        { id: 'transcript', label: t('tab_text', 'Текст'), icon: 'text_align' }
    ];

    // Measure mode selector pill
    useLayoutEffect(() => {
        const measure = () => {
            if (!modeListRef.current || activeItem) return;
            const idx = MODES.findIndex(m => m.id === inputMode);
            const btn = modeListRef.current.querySelectorAll('.mode')[idx];
            if (btn) setModePill({ left: btn.offsetLeft, width: btn.offsetWidth });
        };
        measure();
        if (document.fonts?.ready) document.fonts.ready.then(measure);
        const ro = new ResizeObserver(measure);
        if (modeListRef.current) ro.observe(modeListRef.current);
        return () => ro.disconnect();
    }, [inputMode, activeItem]);

    // Measure details tabs underline indicator
    useLayoutEffect(() => {
        const measure = () => {
            if (!detailTabsRef.current || !activeItem) return;
            const idx = DETAIL_TABS.findIndex(t => t.id === currentTab);
            const btn = detailTabsRef.current.querySelectorAll('.tab')[idx];
            if (btn) setTabIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
        };
        measure();
        if (document.fonts?.ready) document.fonts.ready.then(measure);
        const ro = new ResizeObserver(measure);
        if (detailTabsRef.current) ro.observe(detailTabsRef.current);
        return () => ro.disconnect();
    }, [currentTab, activeItem]);

    // Smooth Momentum Wheel Scroll Setup
    useEffect(() => {
        let targetScrollY = window.scrollY;
        let currentScrollY = window.scrollY;
        let isMoving = false;

        const onWheel = (e) => {
            if (e.ctrlKey || e.shiftKey) return;
            
            const path = e.composedPath() || [];
            for (const element of path) {
                if (element === document.body || element === document.documentElement) break;
                if (element.scrollHeight > element.clientHeight) {
                    if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') return;
                    const style = element.style || {};
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') return;
                    const className = element.className || '';
                    if (typeof className === 'string' && (className.includes('scroll') || className.includes('modal'))) return;
                }
            }

            e.preventDefault();
            targetScrollY = Math.max(0, Math.min(
                document.documentElement.scrollHeight - window.innerHeight,
                targetScrollY + e.deltaY * 0.85
            ));

            if (!isMoving) {
                isMoving = true;
                requestAnimationFrame(updateScroll);
            }
        };

        const updateScroll = () => {
            const diff = targetScrollY - currentScrollY;
            if (Math.abs(diff) > 0.5) {
                currentScrollY += diff * 0.14;
                window.scrollTo(0, currentScrollY);
                requestAnimationFrame(updateScroll);
            } else {
                currentScrollY = targetScrollY;
                window.scrollTo(0, currentScrollY);
                isMoving = false;
            }
        };

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

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
        setIsMobileMenuOpen(false);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Recording live frequencies canvas visualizer
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
            
            const barWidth = 1.5;
            let barHeight;
            let x = 0;
            
            const countToDraw = Math.min(bufferLength, 100); 
            
            for (let i = 0; i < countToDraw; i++) {
                barHeight = dataArray[i] / 1.5;
                
                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#8AB4F8');
                gradient.addColorStop(1, '#C4C6FF');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1.5;
            }
        };
        draw();
    };

    // Feedback Actions
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

        // Map frontend display values to backend-accepted rating keys
        const ratingMap = {
            'Excellent': 'Good',
            'Fine':      'Fine',
            'Normal':    'Okay',
            'Bad':       'Bad',
            'Terrible':  'Very Bad'
        };
        const backendRating = ratingMap[feedbackRating] || feedbackRating;

        setIsSubmittingFeedback(true);
        try {
            const csrfRes = await api.get('/csrf-token');
            const csrfToken = csrfRes.data.csrfToken;

            await api.post('/feedbacks', {
                rating: backendRating,
                message: feedbackMessage
            }, {
                headers: {
                    'X-CSRF-Token': csrfToken
                }
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
            if (res.data) {
                if (res.data.role) {
                    localStorage.setItem('role', res.data.role);
                    setUserRole(res.data.role);
                }
                if (res.data.remaining_requests !== undefined) {
                    setRemainingRequests(res.data.remaining_requests);
                }
            }
        } catch (e) {
            console.error("Error fetching user profile", e);
        }
    };



    // Flashcards swipe events
    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const diff = touchStartX.current - touchEndX;

        if (Math.abs(diff) > 30) { 
            if (diff > 0) {
                if (currentCardIndex < (activeItem?.analysis?.flashcards?.length - 1)) {
                    nextCard();
                }
            } else {
                if (currentCardIndex > 0) {
                    prevCard();
                }
            }
        }
    };

    const nextCard = () => {
        setAnimationClass('sliding-next');
        setTimeout(() => {
            setIsFlipped(false);
            setCurrentCardIndex(p => p + 1);
            setAnimationClass('');
        }, 300);
    };
    const prevCard = () => {
        setAnimationClass('sliding-prev');
        setTimeout(() => {
            setIsFlipped(false);
            setCurrentCardIndex(p => p - 1);
            setAnimationClass('');
        }, 300);
    };

    // Scroll to Top
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
    }, []);

    useEffect(() => {
        if (isFeedbackModalOpen) {
            fetchUserFeedbacks();
        }
    }, [isFeedbackModalOpen]);

    // Handle transition back from GlobalMindMap
    useEffect(() => {
        if (location.state && history.length > 0) {
            const { openItemId, highlightText: stateHighlightText } = location.state;
            if (openItemId) {
                const itemToOpen = history.find(item => String(item.id) === String(openItemId));
                if (itemToOpen) {
                    openItem(itemToOpen, stateHighlightText);
                    window.history.replaceState({}, document.title);
                }
            } else if (stateHighlightText) {
                setHighlightText(stateHighlightText);
                window.history.replaceState({}, document.title);
            }
        }
    }, [location.state, history]);

    // Highlight text on map node click
    useEffect(() => {
        if (!highlightText || !activeItem) return;

        let attempts = 0;
        const maxAttempts = 10;

        const tryHighlight = () => {
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

            const containers = document.querySelectorAll('.analysis-summary, .prose, .insight, .takeaways-box');
            
            if (containers.length === 0) {
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(tryHighlight, 100);
                }
                return;
            }

            let foundElement = null;
            const cleanStr = (s) => s.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()?"'–—]/g, "");

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

                    if (!matchResult && query.length > 25) {
                        const sub = query.substring(0, 25);
                        matchResult = findMatchIndex(text, sub);
                        if (matchResult) matchedLength = sub.length;
                    }

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
                attempts++;
                if (attempts < 5) {
                    setTimeout(tryHighlight, 200);
                }
            }
        };

        const timer = setTimeout(tryHighlight, 100);
        return () => clearTimeout(timer);
    }, [highlightText, activeItem, currentTab]);

    // WebSocket auto-polling with fallback HTTP checks
    useEffect(() => {
        if (!pollingJobId) return;

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

        const unsubscribe = addSocketListener(async (data) => {
            try {
                console.log("📥 WebSocket message received:", data);
                if (data.type === 'status' && data.jobId === pollingJobId) {
                    if (data.status === 'COMPLETED') {
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

                                // Feedback prompt on 2nd completed analysis
                                const prevCount = parseInt(localStorage.getItem('analysisCompletedCount') || '0', 10);
                                const nextCount = prevCount + 1;
                                localStorage.setItem('analysisCompletedCount', String(nextCount));
                                if (nextCount % 2 === 0) {
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
                        setPollingJobId(null);
                        setStatus('Ошибка добавления задачи');
                        alert(`Ошибка анализа: ${data.status.replace('FAILED:', '')}`);
                        loadHistory();
                    } else {
                        if (data.status === 'PROCESSING') {
                            setStatus(t('btn_loading') || 'Обработка...');
                        }
                    }
                }
            } catch (err) {
                console.error("Error processing WebSocket message:", err);
            }
        });

        sendSocketMessage({
            type: 'subscribe',
            jobId: pollingJobId
        });

        return () => {
            unsubscribe();
            if (pollInterval) clearInterval(pollInterval);
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
                fetchUserProfile();
            }
        } catch (err) {
            const errorMsg = err.response?.data?.message || "Произошла ошибка при отправке данных на сервер.";
            setStatus('Ошибка добавления задачи');
            alert(errorMsg);
            console.error(err);
        }
    };

    // Live Audio Recording Controls
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
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

            timerIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

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
        e.stopPropagation();
        if (!window.confirm(t('confirm_delete', 'Вы уверены, что хотите удалить эту запись?'))) return;

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

    const getMarkdownText = (data) => {
        if (!data) return '';
        if (typeof data === 'string') return data;
        if (Array.isArray(data)) return data.join('\n\n'); 
        return JSON.stringify(data, null, 2); 
    };

    const getLangText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[currentLang] || obj['ru'] || '';
    };

    return (
        <>
            <div className="dashboard-container">
                {/* Redesigned Premium Top Navigation */}
                <header className="top-nav">
                    <button className="hamburger" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
                    <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img src="/logo.webp" alt="Logo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                        <span>AI Transcription</span>
                    </div>
                    <div className="nav-links-desktop">
                        <NavItems 
                            userRole={userRole} 
                            changeLanguage={changeLanguage} 
                            i18n={i18n} 
                            setIsMobileMenuOpen={setIsMobileMenuOpen} 
                            setIsFeedbackModalOpen={setIsFeedbackModalOpen} 
                            t={t} 
                        />
                    </div>
                </header>

                {/* Mobile Drawer Overlay */}
                <div className={`mobile-overlay ${isMobileMenuOpen ? 'open' : ''}`} onClick={() => setIsMobileMenuOpen(false)} />
                <div className={`mobile-menu-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
                    <button style={{background:'none', border:'none', color:'white', fontSize:'24px', alignSelf:'flex-end', marginBottom:'20px', cursor:'pointer'}} onClick={() => setIsMobileMenuOpen(false)}>×</button>
                    <NavItems 
                        userRole={userRole} 
                        changeLanguage={changeLanguage} 
                        i18n={i18n} 
                        setIsMobileMenuOpen={setIsMobileMenuOpen} 
                        setIsFeedbackModalOpen={setIsFeedbackModalOpen} 
                        t={t} 
                    />
                </div>

                {!activeItem ? (
                    <div className="fade-in">
                        {/* Redesigned Hero with snapping star field */}
                        <section className="hero">
                            <div className="hero__canvas">
                                <HeroParticles triggerRef={heroTriggerRef} density={130} accent="#8AB4F8" />
                            </div>
                            <div className="hero__wrap">
                                <span className="hero__eyebrow">
                                    <span className="dot" />
                                    {t('hero_eyebrow', 'ИИ-генератор · {{count}} кредита сегодня', { count: (userRole.toLowerCase() === 'pro' || userRole.toLowerCase() === 'admin') ? '∞' : (remainingRequests !== null ? remainingRequests : 2) })}
                                </span>
                                <div ref={heroTriggerRef} className="hero__trigger">
                                    <h1 className="hero__title">{t('hero_title', 'Преврати видео в знания')}</h1>
                                    <p className="hero__sub">{t('hero_subtitle', 'ИИ соберёт конспект, 10 вопросов теста и колоду карточек за минуту.')}</p>

                                    <div className="modes" ref={modeListRef}>
                                        <span className="modes__pill" style={{ left: modePill.left, width: modePill.width }} />
                                        {MODES.map(m => (
                                            <button
                                                key={m.id}
                                                className={`mode ${inputMode === m.id ? 'is-active' : ''}`}
                                                onClick={() => {
                                                    setInputMode(m.id);
                                                    setSelectedFile(null);
                                                    stopRecording();
                                                }}
                                            >
                                                <Icon name={m.icon} size={14} />
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="input-row">
                                        {inputMode === 'youtube' && (
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <span className="field-icon">
                                                    <Icon name="link" size={17} />
                                                </span>
                                                <input 
                                                    className="field" 
                                                    placeholder="Вставь ссылку на YouTube..."
                                                    value={youtubeUrl}
                                                    onChange={e => setYoutubeUrl(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(e); }}
                                                    disabled={!!pollingJobId}
                                                />
                                            </div>
                                        )}

                                        {inputMode === 'file' && (
                                            <div 
                                                className="file-upload-drag-zone" 
                                                onClick={() => !pollingJobId && document.getElementById('file-input').click()}
                                                style={{
                                                    border: '1px dashed var(--border-medium)',
                                                    borderRadius: '12px',
                                                    padding: '16px 24px',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    background: 'var(--bg-surface)',
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 12,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <Icon name="upload" size={17} style={{ color: 'var(--accent-primary)' }} />
                                                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                                    {selectedFile ? `${t('file_selected', 'Выбран файл:')} ${selectedFile.name}` : t('drag_and_drop', 'Перетащи файл или нажми, чтобы загрузить')}
                                                </p>
                                                <input 
                                                    id="file-input"
                                                    type="file"
                                                    accept="audio/*,video/*"
                                                    style={{ display: 'none' }}
                                                    onChange={e => {
                                                        if (e.target.files && e.target.files[0]) {
                                                            setSelectedFile(e.target.files[0]);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {inputMode === 'record' && (
                                            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                                {isRecording ? (
                                                    <div className="record-controls">
                                                        <div className="recording-active-ui">
                                                            <button type="button" className="btn-record recording" onClick={stopRecording}>■</button>
                                                            <span className="recording-timer">{formatTime(recordingTime)}</span>
                                                            <canvas ref={canvasRef} className="visualizer-canvas" />
                                                        </div>
                                                    </div>
                                                ) : selectedFile ? (
                                                    <div className="record-controls">
                                                        <div className="record-status-container">
                                                            <button type="button" className="btn btn--danger btn--sm" onClick={() => setSelectedFile(null)}>
                                                                <Icon name="trash" size={12} />
                                                                {t('delete_btn', 'Удалить')}
                                                            </button>
                                                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                                <Icon name="mic" size={14} style={{ color: 'var(--accent-primary)' }} />
                                                                {t('record_ready', 'Аудиофайл готов к отправке')} ({selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB' : ''})
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button type="button" className="btn btn--ghost" onClick={startRecording} style={{ width: '100%' }}>
                                                        <Icon name="mic" size={15} style={{ color: '#ef4444' }} />
                                                        {t('start_recording', 'Начать запись голоса')}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <button 
                                            className="btn btn--primary" 
                                            onClick={handleSubmit} 
                                            disabled={!!pollingJobId || (inputMode === 'youtube' ? !youtubeUrl : !selectedFile)}
                                            style={{ height: 44 }}
                                        >
                                            {pollingJobId ? t('btn_loading', 'В работе...') : t('btn_process', 'Создать разбор')}
                                            <Icon name={pollingJobId ? 'loader' : 'arrow_up_right'} className={pollingJobId ? 'spin' : ''} size={15} />
                                        </button>
                                    </div>

                                    {status && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                                            <span className="status-dot status-dot--pending spin" />
                                            <span>{status}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Library Grid with premium redesigned cards */}
                        <section className="page" style={{ padding: '0 24px', maxWidth: '1200px', margin: '0 auto' }}>
                            <div className="library-head" style={{ marginBottom: 20 }}>
                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, margin: 0 }}>
                                    {t('library', 'Твоя библиотека')}
                                </h2>
                                <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                                    {history.length} {t('items_count', 'разборов')}
                                </span>
                            </div>

                            <div className="grid">
                                {history.map((item) => {
                                    const analysis = typeof item.structured_analysis === 'string' 
                                        ? JSON.parse(item.structured_analysis) 
                                        : item.structured_analysis;
                                    const isReady = !!analysis;

                                    return (
                                        <article key={item.id} className="card fade-in" onClick={() => isReady && openItem(item)}>
                                            <div className="card__head">
                                                <h3 className="card__title">
                                                    {isReady ? getLangText(analysis.title) : `${t('history_item_title', 'Разбор')} #${item.job_id}`}
                                                </h3>
                                                <button
                                                    className="card__delete"
                                                    aria-label="Удалить"
                                                    onClick={(e) => deleteHistoryItem(e, item.id)}
                                                >
                                                    <Icon name="trash" size={15} />
                                                </button>
                                            </div>
                                            <p className="card__sub">
                                                {!isReady 
                                                    ? t('status_processing', 'Видео в процессе обработки ИИ...') 
                                                    : (getLangText(analysis.summary).substring(0, 110) + '...')}
                                            </p>
                                            <div className="card__foot">
                                                <span className="card__date">
                                                    <Icon name="clock" size={12} />
                                                    {new Date(item.created_at || item.createdAt || Date.now()).toLocaleDateString()}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    {isReady ? (
                                                        <>
                                                            <span className="card__lang" style={{ textTransform: 'uppercase' }}>
                                                                {item.language || 'ru'}
                                                            </span>
                                                            <span style={{ color: 'var(--accent-primary)', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                {t('open_btn', 'Открыть')}
                                                                <Icon name="arrow_right" size={13} />
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="status-dot status-dot--pending">В работе</span>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                ) : (
                    /* Redesigned detail screen views */
                    <main className="page" data-screen-label="detail" style={{ maxWidth: 840, margin: '0 auto', padding: '0 24px 80px' }}>
                        <a className="crumb" onClick={(e) => { e.preventDefault(); setActiveItem(null); setHighlightText(null); }} href="#">
                            <Icon name="arrow_left" size={14} />
                            {t('back_btn', 'Назад в библиотеку')}
                        </a>

                        <div className="detail-head">
                            <div>
                                <h1 className="detail-title">
                                    {getLangText(activeItem.analysis?.title) || `Analysis #${activeItem.job_id}`}
                                </h1>
                                <div className="detail-meta">
                                    <span className="detail-meta__item">
                                        <Icon name="calendar" size={13} /> 
                                        {new Date(activeItem.created_at || activeItem.createdAt || Date.now()).toLocaleDateString()}
                                    </span>
                                    <span className="detail-meta__item" style={{ textTransform: 'uppercase' }}>
                                        <Icon name="globe" size={13} /> 
                                        {activeItem.language || 'ru'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn--ghost btn--sm" onClick={copyToClipboard}>
                                    <Icon name="copy" size={14} />
                                    {t('copy_btn', 'Копировать')}
                                </button>
                            </div>
                        </div>

                        {/* Sliding Tabs selection underline */}
                        <div className="tabs" ref={detailTabsRef}>
                            {DETAIL_TABS.map(tab => (
                                <button 
                                    key={tab.id}
                                    className={`tab ${currentTab === tab.id ? 'is-active' : ''}`} 
                                    onClick={() => setCurrentTab(tab.id)}
                                >
                                    <Icon name={tab.icon} size={14} />
                                    {tab.label}
                                </button>
                            ))}
                            <span className="tab__indicator" style={{ left: tabIndicator.left, width: tabIndicator.width }} />
                        </div>

                        {/* Analysis list Tab */}
                        {currentTab === 'summary' && (
                            <div className="fade-in">
                                <div className="prose hero-summary">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(getLangText(activeItem.analysis?.summary))}
                                    </ReactMarkdown>
                                </div>

                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, margin: '48px 0 24px' }}>
                                    {t('key_insights', 'Ключевые инсайты')}
                                </h2>

                                <div className="insights">
                                    {activeItem.analysis?.key_topics?.map((topic, i) => (
                                        <div key={i} className="insight">
                                            <div className={`insight__bar insight__bar--${['primary', 'secondary', 'success', 'warning'][i % 4]}`} />
                                            <div className="insight__body">
                                                <span className="insight__chip">{t('insight_part', 'Часть')} {i + 1}</span>
                                                <h3 className="insight__title">{getLangText(topic.title)}</h3>
                                                <ul className="insight__list">
                                                    {(topic.key_points?.[currentLang] || topic.key_points?.['ru'] || topic.key_points)?.map((pt, j) => <li key={j}>{pt}</li>)}
                                                </ul>
                                                <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 12, fontStyle: 'italic' }}>
                                                    <strong>{t('why_important', 'Почему это важно:')}</strong> {getLangText(topic.relevance)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, margin: '64px 0 24px' }}>
                                    {t('detailed_analysis', 'Подробный разбор')}
                                </h2>
                                <div className="prose detailed-content" style={{ marginBottom: 48 }}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(getLangText(activeItem.analysis?.detailed_analysis))}
                                    </ReactMarkdown>
                                </div>

                                <div style={{ display: 'grid', gap: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '8px 24px' }}>
                                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, margin: '16px 0 8px' }}>
                                        {t('takeaways', 'Главные выводы')}
                                    </h3>
                                    {(activeItem.analysis?.takeaways?.[currentLang] || activeItem.analysis?.takeaways?.['ru'] || activeItem.analysis?.takeaways)?.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 16, padding: '16px 0', borderBottom: i === ((activeItem.analysis?.takeaways?.length || 1) - 1) ? 'none' : '1px solid var(--border-subtle)' }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontSize: 12, marginTop: 2, minWidth: 18 }}>
                                                0{i + 1}
                                            </span>
                                            <p style={{ margin: 0, color: '#D9DBDE', fontSize: 14.5, lineHeight: 1.6 }}>{item}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Interactive Mindmap node graph Tab */}
                        {currentTab === 'mindmap' && activeItem.mindmap && (
                            <div className="fade-in">
                                <MindMap 
                                    data={activeItem.mindmap} 
                                    onNavigateToTopic={(topicName) => {
                                        setCurrentTab('summary');
                                        setHighlightText(topicName);
                                    }}
                                />
                            </div>
                        )}

                        {/* Flip Flashcards Tab */}
                        {currentTab === 'flashcards' && activeItem.analysis?.flashcards && (
                            <div className="fade-in" style={{ padding: '24px 0' }}>
                                <div className="flash-stage">
                                    <button 
                                        className="flash-arrow" 
                                        onClick={prevCard} 
                                        disabled={currentCardIndex === 0} 
                                        aria-label="Назад"
                                    >
                                        <Icon name="chevron_left" size={18} />
                                    </button>
                                    <div
                                        className={`flash-card ${isFlipped ? 'is-flipped' : ''} ${animationClass}`}
                                        onClick={() => setIsFlipped(!isFlipped)}
                                        onTouchStart={handleTouchStart}
                                        onTouchEnd={handleTouchEnd}
                                    >
                                        <div className="flash-face">
                                            <span className="flash-face__count">
                                                {currentCardIndex + 1} / {activeItem.analysis.flashcards.length}
                                            </span>
                                            <p className="flash-face__q">
                                                {getLangText(activeItem.analysis.flashcards[currentCardIndex]?.question)}
                                            </p>
                                            <span className="flash-face__hint">{t('click_to_flip', 'Нажми, чтобы перевернуть')}</span>
                                        </div>
                                        <div className="flash-face flash-face--back">
                                            <span className="flash-face__count">
                                                {currentCardIndex + 1} / {activeItem.analysis.flashcards.length}
                                            </span>
                                            <p className="flash-face__a">
                                                {getLangText(activeItem.analysis.flashcards[currentCardIndex]?.answer)}
                                            </p>
                                            <span className="flash-face__hint">{t('click_to_flip', 'Нажми, чтобы перевернуть')}</span>
                                        </div>
                                    </div>
                                    <button 
                                        className="flash-arrow" 
                                        onClick={nextCard} 
                                        disabled={currentCardIndex === (activeItem.analysis.flashcards.length - 1)} 
                                        aria-label="Дальше"
                                    >
                                        <Icon name="chevron_right" size={18} />
                                    </button>
                                </div>
                                <div className="flash-progress">
                                    <div className="flash-progress__bar" style={{ width: `${((currentCardIndex + 1) / activeItem.analysis.flashcards.length) * 100}%` }} />
                                </div>
                                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5, marginTop: 16 }}>
                                    {t('flashcard_tip', '←/→ для навигации, кликайте на карточку для переворота')}
                                </p>
                            </div>
                        )}

                        {/* Interactive Quiz questions Tab */}
                        {currentTab === 'quiz' && activeItem.analysis?.quiz && (
                            <div className="fade-in">
                                {activeItem.analysis.quiz.map((q, qIndex) => {
                                    const options = q.options?.[currentLang] || q.options?.['ru'] || q.options;
                                    const correctAnswer = getLangText(q.correct_answer);
                                    
                                    const isAnswered = quizAnswers[qIndex] !== undefined;
                                    const isCorrect = quizAnswers[qIndex] === correctAnswer;
                                    const isRevealed = revealedAnswers[qIndex];

                                    return (
                                        <div key={qIndex} className="quiz-q">
                                            <div className="quiz-q__head">
                                                <span className="quiz-q__num">{qIndex + 1}</span>
                                                <h3 className="quiz-q__title">{getLangText(q.question)}</h3>
                                            </div>
                                            <div className="quiz-opts">
                                                {options?.map((opt, optIndex) => {
                                                    let cls = "quiz-opt";
                                                    const isOptChosen = quizAnswers[qIndex] === opt;
                                                    
                                                    if (isAnswered || isRevealed) {
                                                        if (opt === correctAnswer) {
                                                            cls += " is-correct";
                                                        } else if (isOptChosen) {
                                                            cls += " is-wrong";
                                                        }
                                                    }

                                                    return (
                                                        <button
                                                            key={optIndex}
                                                            className={cls}
                                                            onClick={() => !isAnswered && setQuizAnswers({...quizAnswers, [qIndex]: opt})}
                                                            disabled={isAnswered || isRevealed}
                                                        >
                                                            <span className="quiz-opt__mark">
                                                                {((isAnswered || isRevealed) && opt === correctAnswer) && (
                                                                    <Icon name="check" size={11} strokeWidth={3} />
                                                                )}
                                                                {((isAnswered || isRevealed) && isOptChosen && !isCorrect) && (
                                                                    <Icon name="x" size={11} strokeWidth={3} />
                                                                )}
                                                            </span>
                                                            <span>{opt}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Raw Transcript Text Tab */}
                        {currentTab === 'transcript' && (
                            <div className="prose fade-in" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: 'var(--text-secondary)', fontSize: '14.5px' }}>
                                {activeItem.raw_text}
                            </div>
                        )}
                    </main>
                )}
            </div>

            {/* Scroll to Top floating action button */}
            {showScrollTop && (
                <button 
                    onClick={scrollToTop}
                    style={{
                        position: 'fixed',
                        bottom: '30px',
                        right: '30px',
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--bg-base)',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 999,
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <Icon name="chevron_up" size={18} strokeWidth={2.5} />
                </button>
            )}

            {/* Interactive Feedback Overlay Dialog */}
            {isFeedbackModalOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 16
                }} onClick={() => setIsFeedbackModalOpen(false)}>
                    <div style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border-medium)',
                        borderRadius: 14, width: '100%', maxWidth: 450, padding: 24,
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{t('feedback_nav', 'Отзывы')}</h2>
                            <button style={{ color: 'var(--text-secondary)', fontSize: 20 }} onClick={() => setIsFeedbackModalOpen(false)}>×</button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border-subtle)', marginBottom: 20 }}>
                            <button className={`btn btn--sm ${feedbackModalTab === 'write' ? 'btn--ghost' : 'btn--quiet'}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} onClick={() => setFeedbackModalTab('write')}>{t('write_feedback', 'Оставить отзыв')}</button>
                            <button className={`btn btn--sm ${feedbackModalTab === 'history' ? 'btn--ghost' : 'btn--quiet'}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} onClick={() => setFeedbackModalTab('history')}>{t('history_feedback', 'Мои отзывы')}</button>
                        </div>

                        {feedbackModalTab === 'write' ? (
                            <form onSubmit={handleFeedbackSubmit}>
                                <label className="label">{t('rating_label', 'Оценка')}</label>
                                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                                    {[
                                        { value: 'Excellent', labelKey: 'rating_excellent', labelFallback: 'Отлично' },
                                        { value: 'Fine',      labelKey: 'rating_fine',      labelFallback: 'Хорошо' },
                                        { value: 'Normal',    labelKey: 'rating_normal',    labelFallback: 'Нормально' },
                                        { value: 'Bad',       labelKey: 'rating_bad',       labelFallback: 'Плохо' },
                                        { value: 'Terrible',  labelKey: 'rating_terrible',  labelFallback: 'Ужасно' }
                                    ].map(rating => (
                                        <button
                                            type="button"
                                            key={rating.value}
                                            className={`btn btn--sm ${feedbackRating === rating.value ? 'btn--primary' : 'btn--ghost'}`}
                                            onClick={() => setFeedbackRating(rating.value)}
                                        >
                                            {t(rating.labelKey, rating.labelFallback)}
                                        </button>
                                    ))}
                                </div>
                                <label className="label">{t('message_label', 'Сообщение')}</label>
                                <textarea
                                    className="field"
                                    rows={4}
                                    style={{ height: 'auto', padding: 12, resize: 'vertical', fontFamily: 'var(--font-body)', marginBottom: 20 }}
                                    placeholder={t('feedback_placeholder', 'Что улучшить?')}
                                    value={feedbackMessage}
                                    onChange={e => setFeedbackMessage(e.target.value)}
                                    required
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIsFeedbackModalOpen(false)}>{t('cancel', 'Отмена')}</button>
                                    <button type="submit" className="btn btn--primary btn--sm" disabled={isSubmittingFeedback}>
                                        {isSubmittingFeedback ? t('sending', 'Отправка...') : t('send', 'Отправить')}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {feedbacks.length === 0 ? (
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', margin: '20px 0' }}>Еще нет оставленных отзывов.</p>
                                ) : feedbacks.map((fb, idx) => (
                                    <div key={idx} style={{ padding: 12, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                                            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{fb.rating}</span>
                                            <span style={{ color: 'var(--text-tertiary)' }}>{new Date(fb.created_at || fb.createdAt || Date.now()).toLocaleDateString()}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{fb.message}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Analysis completes feedback invitation prompt */}
            {isFeedbackPromptOpen && (
                <div style={{
                    position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-medium)',
                    borderRadius: 12, padding: 18, width: '100%', maxWidth: 350,
                    boxShadow: '0 12px 30px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 10
                }} className="fade-in">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)', fontWeight: 600, fontSize: 13 }}>
                            <Icon name="message_circle" size={14} />
                            Мы ценим ваше мнение!
                        </span>
                        <button style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setIsFeedbackPromptOpen(false)}>×</button>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        Понравилось ли вам качество структурированного анализа? Оставьте короткий отзыв, чтобы помочь нам сделать систему лучше.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button className="btn btn--quiet btn--sm" onClick={() => setIsFeedbackPromptOpen(false)}>Позже</button>
                        <button className="btn btn--primary btn--sm" onClick={() => { setIsFeedbackPromptOpen(false); setIsFeedbackModalOpen(true); setFeedbackModalTab('write'); }}>
                            Да, конечно!
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}