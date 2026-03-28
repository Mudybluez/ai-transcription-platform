import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  ru: {
    translation: {
      "app_name": "✨ AI Transcription Platform",
      "admin_panel": "Админ панель",
      "profile": "Профиль",
      "logout": "Выйти",
      "hero_title": "Преврати видео в знания",
      "hero_subtitle": "ИИ сгенерирует конспект, 10 вопросов для теста и карточки.",
      "input_placeholder": "Вставь ссылку на YouTube...",
      "btn_process": "Создать магию",
      "btn_loading": "Обработка...",
      "library": "Твоя библиотека",
      
      // Новые ключи для внутренностей разбора
      "status_processing": "Видео в процессе обработки...",
      "open_btn": "Открыть →",
      "back_btn": "Назад в библиотеку",
      "tab_summary": "Анализ",
      "tab_flashcards": "Карточки",
      "tab_quiz": "Тест",
      "tab_text": "Текст",
      "key_insights": "Ключевые инсайты",
      "why_important": "Почему это важно:",
      "detailed_analysis": "Детальный разбор",
      "takeaways": "Главные выводы",
      "click_to_flip": "Нажми, чтобы перевернуть",
      "show_answer": "Показать правильный ответ 👁️"
    }
  },
  en: {
    translation: {
      "app_name": "✨ AI Transcription Platform",
      "admin_panel": "Admin-Panel",
      "profile": "Profile",
      "logout": "Log-out",
      "hero_title": "Turn video into knowledge",
      "hero_subtitle": "AI will generate a summary, 10 quiz questions, and flashcards.",
      "input_placeholder": "Paste YouTube URL...",
      "btn_process": "Create Magic",
      "btn_loading": "Processing...",
      "library": "Your Library",
      
      // Новые ключи для внутренностей разбора
      "status_processing": "Video is processing...",
      "open_btn": "Open →",
      "back_btn": "Back to library",
      "tab_summary": "Summary",
      "tab_flashcards": "Flashcards",
      "tab_quiz": "Quiz",
      "tab_text": "Transcript",
      "key_insights": "Key Insights",
      "why_important": "Why it matters:",
      "detailed_analysis": "Detailed Analysis",
      "takeaways": "Key Takeaways",
      "click_to_flip": "Click to flip",
      "show_answer": "Show correct answer 👁️"
    }
  },
  kk: {
    translation: {
      "app_name": "✨ AI Transcription Platform",
      "admin_panel": "Әкімшілік панель",
      "profile": "Профиль",
      "logout": "Шығу",
      "hero_title": "Бейнені білімге айналдыр",
      "hero_subtitle": "Жасанды интеллект конспект, 10 тест сұрағын және карточкалар жасайды.",
      "input_placeholder": "YouTube сілтемесін енгізіңіз...",
      "btn_process": "Бастау",
      "btn_loading": "Өңделуде...",
      "library": "Сенің кітапханаң",
      
      // Новые ключи для внутренностей разбора
      "status_processing": "Бейне өңделуде...",
      "open_btn": "Ашу →",
      "back_btn": "Кітапханаға қайту",
      "tab_summary": "Талдау",
      "tab_flashcards": "Карточкалар",
      "tab_quiz": "Тест",
      "tab_text": "Мәтін",
      "key_insights": "Негізгі инсайттар",
      "why_important": "Бұл неліктен маңызды:",
      "detailed_analysis": "Толық талдау",
      "takeaways": "Негізгі қорытындылар",
      "click_to_flip": "Аудару үшін басыңыз",
      "show_answer": "Дұрыс жауапты көрсету 👁️"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ru', // Сделал русский языком по умолчанию
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;