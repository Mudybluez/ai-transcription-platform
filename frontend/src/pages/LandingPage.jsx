import React, { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HeroParticles from './HeroParticles';
import Icon from '../components/Icon';
import './LandingPage.css';

// Локализованные тексты для Landing Page (RU, EN, KK)
const texts = {
    ru: {
        badge: "Новое: Интеллектуальный анализ Gemini 3.1 Flash Lite",
        title_prefix: "Превратите медиа в ",
        title_accent: "структурированные знания",
        title_suffix: " мгновенно.",
        subtitle: "Загружайте лекции, подкасты, аудиофайлы или видео с YouTube. ИИ автоматически создаст текстовую расшифровку, глубокий конспект, интерактивные тесты, карточки запоминания и визуальные 3D интеллект-карты.",
        cta_start: "Начать бесплатно",
        cta_learn: "Узнать больше",
        features_title: "Возможности платформы",
        features_subtitle: "Все необходимые инструменты для эффективного обучения и работы с информацией",
        how_title: "Как это работает?",
        pricing_title: "Простые тарифные планы",
        pricing_subtitle: "Выберите тариф, который лучше всего подходит для ваших задач обучения",
        popular_badge: "Популярно",
        month: "/мес",
        billing_select: "Выбрать тариф",
        footer_desc: "ZenScribe — ИИ-платформа для структурирования лекций, видео и аудио в конспекты, тесты и интерактивные карточки.",
        footer_copyright: "© 2026 ZenScribe. Все права защищены.",
        
        feature_items: [
            {
                icon: "brain",
                title: "ИИ-анализ контента",
                desc: "Автоматическое извлечение сути лекций, определение ключевых тем и создание емких конспектов."
            },
            {
                icon: "network",
                title: "Интерактивные карты знаний",
                desc: "Визуализация связей между терминами и концепциями с помощью динамических 2D/3D графов D3."
            },
            {
                icon: "layers",
                title: "Активное запоминание",
                desc: "Автоматическая генерация интерактивных тестов и двусторонних 3D флеш-карт на основе загруженных медиа."
            },
            {
                icon: "mic",
                title: "Гибридная расшифровка",
                desc: "Скачивание готовых субтитров YouTube или распознавание аудио на локальном GPU с помощью OpenAI Whisper."
            },
            {
                icon: "maximize",
                title: "Нарезка кадров видеоряда",
                desc: "Автоматическое извлечение скриншотов из лекций с помощью FFmpeg и встраивание их в текстовый анализ."
            },
            {
                icon: "bell",
                title: "WebSocket уведомления",
                desc: "Push-уведомления в реальном времени при завершении анализа и отслеживание статуса обработки."
            }
        ],
        how_steps: [
            {
                num: "1",
                title: "Загрузите медиа",
                desc: "Вставьте ссылку на YouTube или перетащите аудио/видео файл любого популярного формата."
            },
            {
                num: "2",
                title: "ИИ анализирует контент",
                desc: "Система транскрибирует аудио и передает текст в Gemini 3.1 Flash Lite для многоуровневого анализа."
            },
            {
                num: "3",
                title: "Изучайте и запоминайте",
                desc: "Читайте интерактивный конспект, проходите тесты, тренируйтесь на карточках и исследуйте карту связей."
            }
        ],
        pricing_plans: [
            {
                name: "Standard",
                price: "0",
                features: [
                    "2 запроса каждые 12 часов",
                    "Локальная транскрибация Whisper",
                    "ИИ конспект на 3 языках",
                    "Генерация флеш-карт и тестов"
                ]
            },
            {
                name: "Lite",
                price: "2.5",
                popular: true,
                features: [
                    "20 запросов в месяц",
                    "Локальная транскрибация Whisper",
                    "ИИ конспект на 3 языках",
                    "Генерация флеш-карт и тестов",
                    "Приоритетная очередь обработки"
                ]
            },
            {
                name: "Pro",
                price: "7.5",
                features: [
                    "100 запросов в месяц",
                    "Нарезка кадров видео (FFmpeg)",
                    "Доступ к 2D/3D интерактивной карте",
                    "Уведомления в реальном времени",
                    "Приоритетная поддержка"
                ]
            }
        ]
    },
    en: {
        badge: "New: Intelligent Gemini 3.1 Flash Lite Analysis",
        title_prefix: "Turn media into ",
        title_accent: "structured knowledge",
        title_suffix: " instantly.",
        subtitle: "Upload lectures, podcasts, audio, or YouTube links. AI will automatically generate text transcriptions, summaries, interactive tests, flashcards, and 3D knowledge mind maps.",
        cta_start: "Get Started Free",
        cta_learn: "Learn More",
        features_title: "Platform Features",
        features_subtitle: "All the essential tools for effective learning and information processing",
        how_title: "How It Works",
        pricing_title: "Simple Pricing Plans",
        pricing_subtitle: "Choose the plan that fits your learning requirements best",
        popular_badge: "Popular",
        month: "/mo",
        billing_select: "Choose Plan",
        footer_desc: "ZenScribe is an AI-powered platform designed to structure lectures, video, and audio into structured summaries, interactive quizzes, and flashcards.",
        footer_copyright: "© 2026 ZenScribe. All rights reserved.",
        
        feature_items: [
            {
                icon: "brain",
                title: "AI Content Analysis",
                desc: "Automatic extraction of core lecture concepts, key topics identification, and concise summaries."
            },
            {
                icon: "network",
                title: "Interactive Mind Maps",
                desc: "Visualization of relationships between terms and concepts using dynamic D3 2D/3D force graphs."
            },
            {
                icon: "layers",
                title: "Active Recall & Learning",
                desc: "Automatic generation of interactive quizzes and double-sided 3D flashcards based on uploaded media."
            },
            {
                icon: "mic",
                title: "Hybrid Transcription",
                desc: "Downloading ready YouTube transcripts or processing local audio files using OpenAI Whisper on GPU."
            },
            {
                icon: "maximize",
                title: "Video Timeline Screenshotting",
                desc: "Automatic frame extraction from lecture videos using FFmpeg and embedding them directly into analysis."
            },
            {
                icon: "bell",
                title: "WebSocket Live Notifications",
                desc: "Real-time push notifications upon report completion and live task processing tracking."
            }
        ],
        how_steps: [
            {
                num: "1",
                title: "Upload Media",
                desc: "Paste a YouTube link or drag-and-drop an audio/video file in any popular format."
            },
            {
                num: "2",
                title: "AI Processes Content",
                desc: "The system transcribes audio and sends text to Gemini 3.1 Flash Lite for structured analysis."
            },
            {
                num: "3",
                title: "Study & Learn",
                desc: "Read interactive summaries, complete quizzes, practice with flashcards, and explore the knowledge graph."
            }
        ],
        pricing_plans: [
            {
                name: "Standard",
                price: "0",
                features: [
                    "2 requests every 12 hours",
                    "Local Whisper transcription",
                    "AI summary in 3 languages",
                    "Quizzes & Flashcards generation"
                ]
            },
            {
                name: "Lite",
                price: "2.5",
                popular: true,
                features: [
                    "20 requests per month",
                    "Local Whisper transcription",
                    "AI summary in 3 languages",
                    "Quizzes & Flashcards generation",
                    "Priority queue processing"
                ]
            },
            {
                name: "Pro",
                price: "7.5",
                features: [
                    "100 requests per month",
                    "Video timeline frame cutting",
                    "2D/3D Interactive Mind Map access",
                    "Real-time live notifications",
                    "Priority customer support"
                ]
            }
        ]
    },
    kk: {
        badge: "Жаңа: Gemini 3.1 Flash Lite интеллектуалды талдауы",
        title_prefix: "Медианы ",
        title_accent: "құрылымдық білімге",
        title_suffix: " айналдырыңыз.",
        subtitle: "Дәрістерді, подкасттарды, аудиофайлдарды немесе YouTube бейнелерін жүктеңіз. Жасанды интеллект мәтіндік транскрипцияны, конспектілерді, интерактивті тесттерді, жаттау карточкаларын және 3D интеллект-карталарын автоматты түрде жасайды.",
        cta_start: "Тегін бастау",
        cta_learn: "Толығырақ білу",
        features_title: "Платформа мүмкіндіктері",
        features_subtitle: "Ақпаратпен тиімді жұмыс істеу және оқу үшін барлық қажетті құралдар",
        how_title: "Бұл қалай жұмыс істейді?",
        pricing_title: "Қарапайым тарифтік жоспарлар",
        pricing_subtitle: "Оқу міндеттеріңізге сәйкес келетін тарифті таңдаңыз",
        popular_badge: "Танымал",
        month: "/ай",
        billing_select: "Тарифті таңдау",
        footer_desc: "ZenScribe — дәрістерді, бейне және аудио материалдарды конспектілерге, тесттерге және интерактивті карточкаларға құрылымдауға арналған ЖИ платформасы.",
        footer_copyright: "© 2026 ZenScribe. Барлық құқықтар қорғалған.",
        
        feature_items: [
            {
                icon: "brain",
                title: "ЖИ контент талдауы",
                desc: "Дәрістердің негізгі мәнін автоматты түрде алу, негізгі тақырыптарды анықтау және конспектілер құру."
            },
            {
                icon: "network",
                title: "Интерактивті интеллект-карталар",
                desc: "D3 динамикалық 2D/3D графтары арқылы терминдер мен ұғымдар арасындағы байланыстарды визуализациялау."
            },
            {
                icon: "layers",
                title: "Белсенді жаттау и оқу",
                desc: "Жүктелген медиа негізінде интерактивті тесттер мен екі жақты 3D жаттау карточкаларын автоматты түрде жасау."
            },
            {
                icon: "mic",
                title: "Гибридті транскрипция",
                desc: "YouTube дайын субтитрлерін жүктеу немесе OpenAI Whisper көмегімен жергілікті GPU-де аудионы тану."
            },
            {
                icon: "maximize",
                title: "Бейнебаян кадрларын кесу",
                desc: "FFmpeg көмегімен дәріс бейнелерінен скриншоттарды автоматты түрде алу және оларды мәтіндік талдауға кірістіру."
            },
            {
                icon: "bell",
                title: "WebSocket хабарландырулары",
                desc: "Талдау аяқталған кезде нақты уақыттағы push-хабарландырулар және өңдеу күйін бақылау."
            }
        ],
        how_steps: [
            {
                num: "1",
                title: "Медианы жүктеңіз",
                desc: "YouTube сілтемесін қойыңыз немесе кез келген танымал форматтағы аудио/бейне файлды сүйреп апарыңыз."
            },
            {
                num: "2",
                title: "ЖИ контентті талдайды",
                desc: "Жүйе аудионы транскрипциялайды және мәтінді көп деңгейлі талдау үшін Gemini 3.1 Flash Lite-ке жібереді."
            },
            {
                num: "3",
                title: "Оқыңыз және жаттаңыз",
                desc: "Интерактивті конспектіні оқыңыз, тесттерден өтіңіз, карточкалармен жаттығыңыз және байланыстар картасын зерттеңіз."
            }
        ],
        pricing_plans: [
            {
                name: "Standard",
                price: "0",
                features: [
                    "Әр 12 сағат сайын 2 сұраныс",
                    "Whisper жергілікті транскрипциясы",
                    "3 тілдегі ЖИ конспектісі",
                    "Тесттер мен карточкаларды жасау"
                ]
            },
            {
                name: "Lite",
                price: "2.5",
                popular: true,
                features: [
                    "Айына 20 сұраныс",
                    "Whisper жергілікті транскрипциясы",
                    "3 тілдегі ЖИ конспектісі",
                    "Тесттер мен карточкаларды жасау",
                    "Басымдық кезекте өңдеу"
                ]
            },
            {
                name: "Pro",
                price: "7.5",
                features: [
                    "Айына 100 сұраныс",
                    "Бейнебаян кадрларын кесу (FFmpeg)",
                    "2D/3D интерактивті картасына рұқсат",
                    "Нақты уақыттағы хабарландырулар",
                    "Басымдық қолдау"
                ]
            }
        ]
    }
};

export default function LandingPage() {
    const { i18n } = useTranslation();
    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    // Если токен есть, мгновенно перенаправляем на дашборд
    if (token) {
        return <Navigate to="/dashboard" replace />;
    }

    const currentLang = (i18n.language || 'ru').split('-')[0].toLowerCase();
    const tLang = texts[currentLang] || texts.ru;

    const changeLanguage = (lang) => {
        i18n.changeLanguage(lang);
    };

    const scrollToFeatures = () => {
        const element = document.getElementById('features');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="landing">
            {/* Header */}
            <header className="landing-header">
                <div className="landing-header__inner">
                    <div className="landing-header__left">
                        <Link to="/" className="brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <img src="/logo.webp" alt="Logo" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                            ZenScribe
                        </Link>
                    </div>
                    <div className="landing-header__right">
                        {/* Выбор языка */}
                        <div className="lang-selector">
                            <button 
                                className={`lang-btn ${currentLang === 'ru' ? 'lang-btn--active' : ''}`}
                                onClick={() => changeLanguage('ru')}
                            >
                                RU
                            </button>
                            <button 
                                className={`lang-btn ${currentLang === 'en' ? 'lang-btn--active' : ''}`}
                                onClick={() => changeLanguage('en')}
                            >
                                EN
                            </button>
                            <button 
                                className={`lang-btn ${currentLang === 'kk' ? 'lang-btn--active' : ''}`}
                                onClick={() => changeLanguage('kk')}
                            >
                                KK
                            </button>
                        </div>
                        
                        <Link to="/login" className="btn btn--ghost btn--sm">
                            <Icon name="log_in" size={14} />
                            {currentLang === 'ru' ? 'Войти' : currentLang === 'kk' ? 'Киру' : 'Log in'}
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="landing-hero hero">
                {/* Background Particles */}
                <div className="hero-canvas-container">
                    <HeroParticles />
                </div>
                
                <div className="landing-hero__content">
                    <div className="badge">
                        <Icon name="zap" size={12} />
                        {tLang.badge}
                    </div>
                    <h1 className="landing-title">
                        {tLang.title_prefix}
                        <span>{tLang.title_accent}</span>
                        {tLang.title_suffix}
                    </h1>
                    <p className="landing-subtitle">
                        {tLang.subtitle}
                    </p>
                    <div className="landing-actions">
                        <Link to="/login?register=true" className="btn btn--primary">
                            {tLang.cta_start}
                            <Icon name="arrow_right" size={16} />
                        </Link>
                        <button className="btn btn--ghost" onClick={scrollToFeatures}>
                            {tLang.cta_learn}
                        </button>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="landing-section">
                <div className="section-header">
                    <h2 className="section-title">{tLang.features_title}</h2>
                    <p className="section-subtitle">{tLang.features_subtitle}</p>
                </div>
                
                <div className="features-grid">
                    {tLang.feature_items.map((item, index) => (
                        <div className="feature-card" key={index}>
                            <div className="feature-card__icon">
                                <Icon name={item.icon} size={24} />
                            </div>
                            <h3 className="feature-card__title">{item.title}</h3>
                            <p className="feature-card__desc">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* How It Works Section */}
            <section className="landing-section" style={{ background: 'rgba(255, 255, 255, 0.01)', borderY: '1px solid rgba(255, 255, 255, 0.02)' }}>
                <div className="section-header">
                    <h2 className="section-title">{tLang.how_title}</h2>
                </div>
                
                <div className="steps-container">
                    {tLang.how_steps.map((step, index) => (
                        <div className="step-item" key={index}>
                            <div className="step-num">{step.num}</div>
                            <div className="step-content">
                                <h3 className="step-title">{step.title}</h3>
                                <p className="step-desc">{step.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Pricing Section */}
            <section className="landing-section">
                <div className="section-header">
                    <h2 className="section-title">{tLang.pricing_title}</h2>
                    <p className="section-subtitle">{tLang.pricing_subtitle}</p>
                </div>
                
                <div className="pricing-grid">
                    {tLang.pricing_plans.map((plan, index) => (
                        <div className={`pricing-card ${plan.popular ? 'pricing-card--popular' : ''}`} key={index}>
                            <div className="pricing-card__name">{plan.name}</div>
                            <div className="pricing-card__price">
                                ${plan.price}
                                <span>{tLang.month}</span>
                            </div>
                            
                            <ul className="pricing-card__features">
                                {plan.features.map((feat, fIdx) => (
                                    <li className="pricing-card__feature-item" key={fIdx}>
                                        <Icon name="check" size={14} />
                                        {feat}
                                    </li>
                                ))}
                            </ul>
                            
                            <Link 
                                to="/login?register=true" 
                                className={`btn pricing-card__action ${plan.popular ? 'btn--primary' : 'btn--ghost'}`}
                            >
                                {tLang.billing_select}
                            </Link>
                        </div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="landing-footer__inner">
                    <div className="landing-footer__logo" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <img src="/logo.webp" alt="Logo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                        ZenScribe
                    </div>
                    <p className="landing-footer__text">{tLang.footer_desc}</p>
                    <div className="landing-footer__copy">{tLang.footer_copyright}</div>
                </div>
            </footer>
        </div>
    );
}
