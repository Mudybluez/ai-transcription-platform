import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

export default function Footer() {
    const { t } = useTranslation();

    return (
        <footer style={{
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            padding: '40px 24px 32px',
            marginTop: '80px',
            fontFamily: 'var(--font-body)',
            width: '100%'
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '32px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '32px'
                }}>
                    <div style={{ maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '18px' }}>
                            <img src="/logo.webp" alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                            <span>ZenScribe</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                            {t('footer_desc', 'ZenScribe — ИИ-платформа для структурирования лекций, видео и аудио в конспекты, тесты и интерактивные карточки.')}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
                        {/* Contacts / Links */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '12.5px', fontWeight: 600, textTransform: 'uppercase', tracking: '0.05em', color: 'var(--text-tertiary)' }}>
                                {t('footer_contact', 'Связаться со мной')}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <a 
                                    href="mailto:mdi.ksymov@gmail.com" 
                                    style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '8px', 
                                        color: 'var(--accent-primary)', 
                                        fontSize: '13.5px', 
                                        textDecoration: 'none',
                                        transition: 'opacity 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = 0.85}
                                    onMouseLeave={e => e.currentTarget.style.opacity = 1}
                                >
                                    <Icon name="mail" size={14} />
                                    <span>mdi.ksymov@gmail.com</span>
                                </a>
                                <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                                    {t('footer_created_by', 'Разработано с заботой о студентах')}
                                </span>
                            </div>
                        </div>

                        {/* Project / GitHub */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '12.5px', fontWeight: 600, textTransform: 'uppercase', tracking: '0.05em', color: 'var(--text-tertiary)' }}>
                                {t('footer_project', 'Проект')}
                            </h4>
                            <a 
                                href="https://github.com/Mudybluez/ai-transcription-platform" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '8px', 
                                    color: 'var(--text-secondary)', 
                                    fontSize: '13.5px', 
                                    textDecoration: 'none',
                                    transition: 'color 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                                </svg>
                                <span>GitHub Repository</span>
                                <Icon name="arrow_up_right" size={11} style={{ opacity: 0.6 }} />
                            </a>
                        </div>
                    </div>
                </div>

                <div style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px'
                }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                        {t('footer_copyright', '© 2026 ZenScribe. Все права защищены.')}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        v1.2.0
                    </span>
                </div>
            </div>
        </footer>
    );
}
