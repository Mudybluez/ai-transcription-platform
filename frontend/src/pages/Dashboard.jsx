import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import './Dashboard.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';

const Dashboard = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [analysisLang, setAnalysisLang] = useState('ru'); 
    const [status, setStatus] = useState('');
    const [history, setHistory] = useState([]);
    
    // Новые состояния для способов ввода
    const [inputMode, setInputMode] = useState('youtube'); // 'youtube', 'file', 'record'
    const [selectedFile, setSelectedFile] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [audioChunks, setAudioChunks] = useState([]);

    const [recordingTime, setRecordingTime] = useState(0);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const canvasRef = useRef(null);
    const timerIntervalRef = useRef(null);

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

    // Авто-обновление при загрузке
    const [pollingJobId, setPollingJobId] = useState(null);

    const [activeItem, setActiveItem] = useState(null);
    const [currentTab, setCurrentTab] = useState('summary');

    // Состояния интерактива
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    
    const [quizAnswers, setQuizAnswers] = useState({});
    const [revealedAnswers, setRevealedAnswers] = useState({}); // Для кнопки "Узнать ответ"

    const { t, i18n } = useTranslation();

// Функция для смены языка
const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
};

    useEffect(() => {
        loadHistory();
    }, []);

    // авто-перенаправления
    useEffect(() => {
        let interval;
        if (pollingJobId) {
            interval = setInterval(async () => {
                try {
                    const res = await api.get('/history');
                    setHistory(res.data);
                    
                    const finishedJob = res.data.find(j => j.job_id === pollingJobId && j.structured_analysis);
                    if (finishedJob) {
                        clearInterval(interval);
                        setPollingJobId(null);
                        setStatus('');
                        openItem(finishedJob); // Автоматически открываем результат!
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
            setHistory(response.data);
        } catch (error) {
            console.error("Ошибка загрузки истории");
            if (error.response && error.response.status !== 401 && error.response.status !== 403) {
                alert("Не удалось загрузить историю разборов. Проверьте соединение с сервером.");
            }
        }
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
                response = await api.post('/upload/youtube', { url: youtubeUrl, language: analysisLang });
                setYoutubeUrl('');
            } else if (inputMode === 'file' || inputMode === 'record') {
                if (!selectedFile) {
                    alert("Пожалуйста, выберите файл или запишите аудио");
                    return;
                }
                const formData = new FormData();
                formData.append('language', analysisLang); // Сначала текст
                formData.append('mediaFile', selectedFile); // Потом файл
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
            analyser.fftSize = 256; // Больше полосок для детальности
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
        
        const summary = getMarkdownText(activeItem.analysis.summary);
        const detailed = getMarkdownText(activeItem.analysis.detailed_analysis);
        const title = activeItem.analysis.title || `Analysis #${activeItem.job_id}`;
        
        const textToCopy = `# ${title}\n\n## Summary\n${summary}\n\n## Detailed Analysis\n${detailed}`;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert(t('copied_alert', 'Скопировано в буфер обмена'));
        }).catch(err => {
            console.error('Ошибка при копировании:', err);
        });
    };

    const openItem = (item) => {
        const analysis = typeof item.structured_analysis === 'string' 
            ? JSON.parse(item.structured_analysis) 
            : item.structured_analysis;
            
        setActiveItem({ ...item, analysis });
        setCurrentTab('summary');
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setQuizAnswers({});
        setRevealedAnswers({});
    };

    // Навигация по карточкам
    const nextCard = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentCardIndex(p => p + 1), 150);
    };
    const prevCard = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentCardIndex(p => p - 1), 150);
    };

    const getMarkdownText = (data) => {
        if (!data) return '';
        if (typeof data === 'string') return data;
        if (Array.isArray(data)) return data.join('\n\n'); 
        return JSON.stringify(data, null, 2); // На крайний случай, если это объект
    };

    return (
        <div className="dashboard-container fade-in">
            <header className="top-nav">
                <div className="logo">{t('app_name')}</div>
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

                    {localStorage.getItem('role') === 'admin' && (
                        <Link to="/admin" className="nav-link">{t('admin_panel')}</Link>
                    )}
                    <Link to="/profile" className="nav-link">{t('profile')}</Link>
                    <span className="nav-link logout" onClick={() => {
                        localStorage.clear();
                        window.location.href = '/login';
                    }}>{t('logout')}</span>
                </div>
            </header>

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

                            <select 
                                className="yt-input" 
                                style={{ width: '140px', padding: '0 15px', cursor: 'pointer' }}
                                value={analysisLang}
                                onChange={(e) => setAnalysisLang(e.target.value)}
                                disabled={!!pollingJobId}
                            >
                                <option value="ru">Русский</option>
                                <option value="en">English</option>
                                <option value="kk">Қазақша</option>
                            </select>
                            
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
                                            <h3>{isReady && analysis?.title ? analysis.title : `${t('history_item_title')} #${item.job_id}`}</h3>
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
                                                : (analysis?.summary?.substring(0, 80) + '...')}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <button className="back-btn" onClick={() => setActiveItem(null)} style={{ marginBottom: 0 }}>
                            {t('back_btn')}
                        </button>
                        <button className="btn-primary" onClick={copyToClipboard} style={{ padding: '8px 20px', fontSize: '14px' }}>
                            {t('copy_btn')}
                        </button>
                    </div>
                    
                    <div className="tabs-container">
                        {['summary', 'flashcards', 'quiz', 'transcript'].map(tab => (
                            <button 
                                key={tab}
                                className={`tab-btn ${currentTab === tab ? 'active' : ''}`} 
                                onClick={() => setCurrentTab(tab)}
                            >
                                {tab === 'summary' && t('tab_summary', 'Анализ')}
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
                                        {getMarkdownText(activeItem.analysis?.summary)}
                                    </ReactMarkdown>
                                </div>

                                <h2 className="section-title" style={{marginTop: '40px'}}>Ключевые инсайты</h2>
                                <div className="insights-grid">
                                    {activeItem.analysis?.key_topics?.map((topic, i) => (
                                        <div key={i} className="insight-card">
                                            <div className="insight-icon">{t('insight_part')} {i + 1}</div>
                                            <div>
                                                <h4>{topic.title}</h4>
                                                <ul className="insight-points">
                                                    {topic.key_points?.map((pt, j) => <li key={j}>{pt}</li>)}
                                                </ul>
                                                <div className="insight-relevance">
                                                    <strong>{t('why_important', 'Почему это важно:')}</strong> {topic.relevance}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <h2 className="section-title" style={{marginTop: '50px'}}>Детальный разбор</h2>
                                <div className="markdown-body detailed-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(activeItem.analysis?.detailed_analysis)}
                                    </ReactMarkdown>
                                </div>

                                <div className="takeaways-box">
                                    <h3>{t('takeaways', 'Главные выводы')}</h3>
                                    <ul>
                                        {activeItem.analysis?.takeaways?.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {currentTab === 'transcript' && (
                            <div className="transcript-text">
                                {activeItem.raw_text}
                            </div>
                        )}

                        {currentTab === 'flashcards' && (
                            <div className="carousel-section">
                                <button className="arrow-btn prev" onClick={prevCard} disabled={currentCardIndex === 0}>Назад</button>
                                <button className="arrow-btn next" onClick={nextCard} disabled={currentCardIndex === (activeItem.analysis?.flashcards?.length - 1)}>Вперед</button>

                                <div className="flashcard-scene" onClick={() => setIsFlipped(!isFlipped)}>
                                    <div className={`flashcard-inner ${isFlipped ? 'is-flipped' : ''}`}>
                                        <div className="flashcard-front">
                                            <span className="card-counter">{currentCardIndex + 1} / {activeItem.analysis?.flashcards?.length}</span>
                                            <h3>{activeItem.analysis?.flashcards?.[currentCardIndex]?.question}</h3>
                                            <span className="flip-hint">{t('click_to_flip', 'Нажми, чтобы перевернуть')}</span>
                                        </div>
                                        <div className="flashcard-back">
                                            <p>{activeItem.analysis?.flashcards?.[currentCardIndex]?.answer}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentTab === 'quiz' && (
                            <div className="quiz-container">
                                {activeItem.analysis?.quiz?.map((q, qIndex) => {
                                    const isAnswered = quizAnswers[qIndex] !== undefined;
                                    const isCorrect = quizAnswers[qIndex] === q.correct_answer;
                                    const isRevealed = revealedAnswers[qIndex];

                                    return (
                                        <div key={qIndex} className="quiz-card">
                                            <h3><span className="q-num">{qIndex + 1}</span> {q.question}</h3>
                                            <div className="options-grid">
                                                {q.options?.map((opt, optIndex) => {
                                                    let btnClass = "quiz-option";
                                                    if (isAnswered || isRevealed) {
                                                        if (opt === q.correct_answer && (isCorrect || isRevealed)) btnClass += " correct";
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
        </div>
    );
};

export default Dashboard;