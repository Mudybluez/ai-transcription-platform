import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import './Dashboard.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const Dashboard = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [status, setStatus] = useState('');
    const [history, setHistory] = useState([]);
    
    // Авто-обновление при загрузке
    const [pollingJobId, setPollingJobId] = useState(null);

    const [activeItem, setActiveItem] = useState(null);
    const [currentTab, setCurrentTab] = useState('summary');

    // Состояния интерактива
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    
    const [quizAnswers, setQuizAnswers] = useState({});
    const [revealedAnswers, setRevealedAnswers] = useState({}); // Для кнопки "Узнать ответ"

    useEffect(() => {
        loadHistory();
    }, []);

    // Магия авто-перенаправления
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
            }, 3000); // Проверяем каждые 3 секунды
        }
        return () => clearInterval(interval);
    }, [pollingJobId]);

    const loadHistory = async () => {
        try {
            const response = await api.get('/history');
            setHistory(response.data);
        } catch (error) {
            console.error("Ошибка загрузки истории");
        }
    };

    const handleYoutubeSubmit = async (e) => {
        e.preventDefault();
        if (!youtubeUrl) return;
        setStatus('Анализируем видео... Пожалуйста, подождите ⏳');
        try {
            const response = await api.post('/upload/youtube', { url: youtubeUrl });
            setYoutubeUrl('');
            setPollingJobId(response.data.job_id); // Начинаем следить за этим ID
        } catch (err) {
            setStatus('Ошибка добавления видео');
        }
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
        if (Array.isArray(data)) return data.join('\n\n'); // Если это массив строк, склеиваем их
        return JSON.stringify(data, null, 2); // На крайний случай, если это объект
    };

    return (
        <div className="dashboard-container fade-in">
            <header className="top-nav">
                <div className="logo">✨ AI Transcription Platform</div>
                <div>
                    {localStorage.getItem('role') === 'admin' && (
                        <Link to="/admin" className="nav-link">Admin-Panel</Link>
                    )}
                    
                    <Link to="/profile" className="nav-link">Profile</Link>
                    
                    <span className="nav-link logout" onClick={() => {
                        localStorage.clear();
                        window.location.href = '/login';
                    }}>Log-out</span>
                </div>
            </header>

            {!activeItem ? (
                <div className="fade-in-up">
                    <section className="hero-section">
                        <h1>Преврати видео в знания</h1>
                        <p>ИИ сгенерирует конспект, 10 вопросов для теста и карточки.</p>
                        
                        <form className="input-group" onSubmit={handleYoutubeSubmit}>
                            <input 
                                type="url" 
                                className="yt-input" 
                                placeholder="Вставь ссылку на YouTube..." 
                                value={youtubeUrl}
                                onChange={(e) => setYoutubeUrl(e.target.value)}
                                disabled={!!pollingJobId}
                                required
                            />
                            <button type="submit" className="btn-primary" disabled={!!pollingJobId}>
                                {pollingJobId ? 'Обработка...' : 'Создать магию'}
                            </button>
                        </form>
                        {status && <div className="status-pulse">{status}</div>}
                    </section>

                    <section>
                        <h2 className="section-title">Твоя библиотека</h2>
                        <div className="history-grid">
                            {history.map((item) => {
                                const analysis = typeof item.structured_analysis === 'string' 
                                    ? JSON.parse(item.structured_analysis) 
                                    : item.structured_analysis;
                                const isReady = !!analysis;

                                return (
                                    <div key={item.id} className={`history-card ${!isReady ? 'processing' : ''}`} onClick={() => isReady && openItem(item)}>
                                        <h3>Разбор #{item.job_id}</h3>
                                        <p>
                                            {!isReady 
                                                ? 'Видео в процессе обработки...' 
                                                : (analysis?.summary?.substring(0, 80) + '...')}
                                        </p>
                                        {isReady && <span className="card-link">Открыть →</span>}
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </div>
            ) : (
                <div className="fade-in">
                    <button className="back-btn" onClick={() => setActiveItem(null)}>
                        ← Назад в библиотеку
                    </button>
                    
                    <div className="tabs-container">
                        {['summary', 'flashcards', 'quiz', 'transcript'].map(tab => (
                            <button 
                                key={tab}
                                className={`tab-btn ${currentTab === tab ? 'active' : ''}`} 
                                onClick={() => setCurrentTab(tab)}
                            >
                                {tab === 'summary' && 'Анализ'}
                                {tab === 'flashcards' && 'Карточки'}
                                {tab === 'quiz' && 'Тест'}
                                {tab === 'transcript' && 'Текст'}
                            </button>
                        ))}
                    </div>

                    <div className="content-box slide-up">
                        {currentTab === 'summary' && (
                            <div className="analysis-layout">
                                {/* Главное резюме (Markdown) */}
                                <div className="markdown-body hero-summary">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(activeItem.analysis?.summary)}
                                    </ReactMarkdown>
                                </div>

                                {/* Ключевые инсайты (Теперь они наполнены контентом!) */}
                                <h2 className="section-title" style={{marginTop: '40px'}}>💡 Ключевые инсайты</h2>
                                <div className="insights-grid">
                                    {activeItem.analysis?.key_topics?.map((topic, i) => (
                                        <div key={i} className="insight-card">
                                            <div className="insight-icon">🎯</div>
                                            <div>
                                                <h4>{topic.title}</h4>
                                                <ul className="insight-points">
                                                    {topic.key_points?.map((pt, j) => <li key={j}>{pt}</li>)}
                                                </ul>
                                                <div className="insight-relevance">
                                                    <strong>Почему это важно:</strong> {topic.relevance}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Детальный анализ с таблицами и картинками (Markdown) */}
                                <h2 className="section-title" style={{marginTop: '50px'}}>📚 Детальный разбор</h2>
                                <div className="markdown-body detailed-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {getMarkdownText(activeItem.analysis?.detailed_analysis)}
                                    </ReactMarkdown>
                                </div>

                                {/* Главные выводы */}
                                <div className="takeaways-box">
                                    <h3>Главные выводы</h3>
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
                                {/* Стрелки теперь позиционируются абсолютно относительно секции */}
                                <button 
                                    className="arrow-btn prev" 
                                    onClick={prevCard} 
                                    disabled={currentCardIndex === 0}
                                    title="Предыдущая"
                                >❮</button>
                                
                                <button 
                                    className="arrow-btn next" 
                                    onClick={nextCard} 
                                    disabled={currentCardIndex === (activeItem.analysis?.flashcards?.length - 1)}
                                    title="Следующая"
                                >❯</button>

                                {/* Стабильный родитель для 3D перспективы. Жесткий центр. */}
                                <div className="flashcard-scene" onClick={() => setIsFlipped(!isFlipped)}>
                                    <div className={`flashcard-inner ${isFlipped ? 'is-flipped' : ''}`}>
                                        <div className="flashcard-front">
                                            <span className="card-counter">{currentCardIndex + 1} / {activeItem.analysis?.flashcards?.length}</span>
                                            <h3>{activeItem.analysis?.flashcards?.[currentCardIndex]?.question}</h3>
                                            <span className="flip-hint">Нажми, чтобы перевернуть</span>
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
                                                    Показать правильный ответ 👁️
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