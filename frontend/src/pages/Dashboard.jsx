import React, { useState, useEffect } from 'react';
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
        }
    };

    const handleYoutubeSubmit = async (e) => {
        e.preventDefault();
        if (!youtubeUrl) return;
        setStatus(t('btn_loading')); // Заменил жесткий текст на перевод
        try {
            // НОВОЕ: Передаем analysisLang
            const response = await api.post('/upload/youtube', { url: youtubeUrl, language: analysisLang });
            setYoutubeUrl('');
            setPollingJobId(response.data.job_id);
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
                        
                        <form className="input-group" onSubmit={handleYoutubeSubmit}>
                            <input 
                                type="url" 
                                className="yt-input" 
                                placeholder={t('input_placeholder')} 
                                value={youtubeUrl}
                                onChange={(e) => setYoutubeUrl(e.target.value)}
                                disabled={!!pollingJobId}
                                required
                            />
                            <select 
                                className="yt-input" 
                                style={{ width: '140px', padding: '0 15px', cursor: 'pointer' }}
                                value={analysisLang}
                                onChange={(e) => setAnalysisLang(e.target.value)}
                                disabled={!!pollingJobId}
                            >
                                <option value="ru">🇷🇺 Русский</option>
                                <option value="en">🇬🇧 English</option>
                                <option value="kk">🇰🇿 Қазақша</option>
                            </select>
                            
                            <button type="submit" className="btn-primary" disabled={!!pollingJobId}>
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
                                        <h3>Разбор #{item.job_id}</h3>
                                        <p>
                                            {!isReady 
                                                ? t('status_processing', 'Видео в процессе обработки...') 
                                                : (analysis?.summary?.substring(0, 80) + '...')}
                                        </p>
                                        {isReady && <span className="card-link">{t('open_btn', 'Открыть →')}</span>}
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </div>
            ) : (
                <div className="fade-in">
                    <button className="back-btn" onClick={() => setActiveItem(null)}>
                        ← {t('back_btn', 'Назад в библиотеку')}
                    </button>
                    
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

                                <h2 className="section-title" style={{marginTop: '40px'}}>💡 {t('key_insights', 'Ключевые инсайты')}</h2>
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
                                                    <strong>{t('why_important', 'Почему это важно:')}</strong> {topic.relevance}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <h2 className="section-title" style={{marginTop: '50px'}}>📚 {t('detailed_analysis', 'Детальный разбор')}</h2>
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
                                <button className="arrow-btn prev" onClick={prevCard} disabled={currentCardIndex === 0}>❮</button>
                                <button className="arrow-btn next" onClick={nextCard} disabled={currentCardIndex === (activeItem.analysis?.flashcards?.length - 1)}>❯</button>

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
                                                    {t('show_answer', 'Показать правильный ответ 👁️')}
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