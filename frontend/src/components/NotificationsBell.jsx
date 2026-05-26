import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { addSocketListener } from '../utils/sharedSocket';

export default function NotificationsBell() {
    const { t, i18n } = useTranslation();
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    // Загрузка уведомлений по HTTP при монтировании
    const fetchNotifications = async () => {
        try {
            const response = await api.get('/notifications');
            setNotifications(response.data);
        } catch (error) {
            console.error('Ошибка загрузки уведомлений:', error);
        }
    };

    useEffect(() => {
        fetchNotifications();

        // Подписка на общий WebSocket для получения живых уведомлений
        const unsubscribe = addSocketListener((message) => {
            if (message.type === 'notification') {
                console.log('🔔 Получено живое уведомление:', message.notification);
                setNotifications(prev => [message.notification, ...prev]);
            }
        });

        // Клик снаружи для закрытия дропдауна
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            unsubscribe();
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Пометить одно прочитанным
    const handleReadSingle = async (id, e) => {
        e.stopPropagation();
        try {
            await api.post(`/notifications/${id}/read`);
            setNotifications(prev => 
                prev.map(n => n.id === id ? { ...n, is_read: true } : n)
            );
        } catch (error) {
            console.error('Ошибка при прочтении уведомления:', error);
        }
    };

    // Пометить все прочитанными
    const handleReadAll = async () => {
        try {
            await api.post('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            console.error('Ошибка прочтения всех уведомлений:', error);
        }
    };

    // Выбор текста уведомления на активном языке
    const getNotificationMessage = (notif) => {
        const lang = i18n.language || 'ru';
        const msgKey = `message_${lang.substring(0, 2)}`;
        if (notif.data && notif.data[msgKey]) {
            return notif.data[msgKey];
        }
        return notif.data?.message_ru || notif.data?.message_en || t('new_notification', 'Новое уведомление');
    };

    // Иконка в зависимости от типа
    const getNotificationIcon = (type) => {
        switch (type) {
            case 'ANALYSIS_READY':
                return '📊';
            case 'LIMITS_EXCEEDED':
                return '⚠️';
            case 'ADMIN_RESPONSE':
                return '💬';
            default:
                return '🔔';
        }
    };

    return (
        <div className="notifications-bell-container" ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button 
                className={`bell-button ${unreadCount > 0 ? 'has-unread' : ''}`} 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'rgba(30, 41, 59, 0.55)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    width: '42px',
                    height: '42px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: 'white',
                    fontSize: '18px',
                    outline: 'none'
                }}
            >
                🔔
                {unreadCount > 0 && (
                    <span 
                        className="badge" 
                        style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-4px',
                            background: 'linear-gradient(135deg, #ef4444, #f43f5e)',
                            color: 'white',
                            borderRadius: '50%',
                            minWidth: '18px',
                            height: '18px',
                            padding: '0 4px',
                            fontSize: '10px',
                            fontWeight: '800',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '2px solid #0f172a',
                            boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
                            animation: 'pulse 2s infinite'
                        }}
                    >
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div 
                    className="notifications-dropdown fade-in-up"
                    style={{
                        position: 'absolute',
                        top: '52px',
                        right: '0',
                        width: '360px',
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                        zIndex: 9999,
                        overflow: 'hidden',
                        animation: 'fadeInUp 0.2s ease-out'
                    }}
                >
                    {/* Шапка дропдауна */}
                    <div 
                        style={{
                            padding: '16px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(30, 41, 59, 0.3)'
                        }}
                    >
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#f8fafc' }}>
                            {t('notif_title')}
                        </h4>
                        {unreadCount > 0 && (
                            <button 
                                onClick={handleReadAll}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#6366f1',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    transition: 'background 0.2s',
                                    outline: 'none'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(99, 102, 241, 0.1)'}
                                onMouseLeave={(e) => e.target.style.background = 'none'}
                            >
                                ✓ {t('notif_clear_all')}
                            </button>
                        )}
                    </div>

                    {/* Список уведомлений */}
                    <div 
                        style={{
                            maxHeight: '380px',
                            overflowY: 'auto',
                            padding: '8px 0'
                        }}
                    >
                        {notifications.length === 0 ? (
                            <div 
                                style={{
                                    padding: '40px 20px',
                                    textAlign: 'center',
                                    color: '#94a3b8',
                                    fontSize: '13px'
                                }}
                            >
                                <div style={{ fontSize: '24px', marginBottom: '10px' }}>📭</div>
                                {t('notif_empty')}
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <div 
                                    key={notif.id}
                                    style={{
                                        padding: '14px 16px',
                                        display: 'flex',
                                        gap: '12px',
                                        alignItems: 'flex-start',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                                        background: notif.is_read ? 'transparent' : 'rgba(99, 102, 241, 0.04)',
                                        transition: 'all 0.3s',
                                        position: 'relative'
                                    }}
                                >
                                    <span style={{ fontSize: '20px', lineHeight: '1' }}>
                                        {getNotificationIcon(notif.type)}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p 
                                            style={{
                                                margin: 0,
                                                fontSize: '13px',
                                                lineHeight: '1.4',
                                                color: notif.is_read ? '#cbd5e1' : '#f8fafc',
                                                fontWeight: notif.is_read ? '400' : '600',
                                                wordBreak: 'break-word'
                                            }}
                                        >
                                            {getNotificationMessage(notif)}
                                        </p>
                                        <span 
                                            style={{
                                                fontSize: '10px',
                                                color: '#64748b',
                                                display: 'block',
                                                marginTop: '4px'
                                            }}
                                        >
                                            {new Date(notif.created_at).toLocaleString(
                                                i18n.language.startsWith('ru') ? 'ru-RU' : i18n.language.startsWith('kk') ? 'kk-KZ' : 'en-US',
                                                { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }
                                            )}
                                        </span>
                                    </div>
                                    {!notif.is_read && (
                                        <button
                                            onClick={(e) => handleReadSingle(notif.id, e)}
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                color: '#10b981',
                                                borderRadius: '50%',
                                                width: '24px',
                                                height: '24px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                transition: 'all 0.2s',
                                                outline: 'none'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.target.style.background = '#10b981';
                                                e.target.style.color = 'white';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                                                e.target.style.color = '#10b981';
                                            }}
                                            title={t('dismiss', 'Скрыть')}
                                        >
                                            ✓
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
