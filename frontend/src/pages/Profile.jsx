import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import './Extras.css'; // Общий файл стилей для новых страниц

const Profile = () => {
    const [stats, setStats] = useState({ totalAnalyzed: 0 });
    
    // Достаем данные пользователя из localStorage (мы сохраняли их при логине)
    const user = {
        username: localStorage.getItem('username') || 'Студент',
        email: localStorage.getItem('email') || 'student@turbo.ai',
        role: localStorage.getItem('role') || 'user'
    };

    useEffect(() => {
        // Получаем историю, чтобы посчитать статистику
        const fetchStats = async () => {
            try {
                const res = await api.get('/history');
                setStats({ totalAnalyzed: res.data.length });
            } catch (e) {
                console.error(e);
            }
        };
        fetchStats();
    }, []);

    return (
        <div className="dashboard-container fade-in">
            <header className="top-nav">
                <Link to="/" className="logo" style={{textDecoration: 'none'}}>✨ AI Transcription Platform</Link>
                <div>
                    <Link to="/" className="nav-link">В библиотеку</Link>
                </div>
            </header>

            <div className="profile-wrapper fade-in-up">
                <div className="profile-card">
                    <div className="profile-avatar">
                        {user.username.charAt(0).toUpperCase()}
                    </div>
                    <h2>{user.username}</h2>
                    <p className="profile-email">{user.email}</p>
                    
                    <div className="role-badge">
                        {user.role === 'admin' ? '👑 Администратор' : '🎓 Пользователь PRO'}
                    </div>

                    <div className="profile-stats">
                        <div className="stat-box">
                            <span className="stat-number">{stats.totalAnalyzed}</span>
                            <span className="stat-label">Видео разобрано</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-number">∞</span>
                            <span className="stat-label">Токенов ИИ</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;