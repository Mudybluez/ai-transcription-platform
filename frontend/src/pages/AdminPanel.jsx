import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../api';
import './Extras.css';

const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const role = localStorage.getItem('role');

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await api.get('/users/all');
                setUsers(res.data);
            } catch (error) {
                console.error("Ошибка загрузки пользователей");
            }
        };
        fetchUsers();
    }, []);

    // Жесткая защита фронтенда
    if (role !== 'admin') {
        return <Navigate to="/" />;
    }

    return (
        <div className="dashboard-container fade-in">
            <header className="top-nav">
                <div className="logo">🛡️ Admin Panel</div>
                <div>
                    <Link to="/" className="nav-link">Выйти в Дашборд</Link>
                </div>
            </header>

            <div className="admin-layout fade-in-up">
                {/* Верхние виджеты статистики */}
                <div className="admin-widgets">
                    <div className="widget-card">
                        <h3>Всего пользователей</h3>
                        <div className="widget-value">{users.length}</div>
                    </div>
                    <div className="widget-card">
                        <h3>Статус серверов</h3>
                        <div className="widget-value status-ok">Онлайн 🟢</div>
                    </div>
                    <div className="widget-card">
                        <h3>ИИ Модель</h3>
                        <div className="widget-value text-purple">Gemini 2.5 Flash ⚡</div>
                    </div>
                </div>

                {/* Таблица пользователей */}
                <div className="admin-table-container">
                    <h2 style={{marginBottom: '20px'}}>Зарегистрированные пользователи</h2>
                    <table className="glass-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Имя (Username)</th>
                                <th>Email</th>
                                <th>Роль</th>
                                <th>Дата регистрации</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>#{user.id}</td>
                                    <td><strong>{user.username}</strong></td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`chip ${user.role === 'admin' ? 'chip-admin' : 'chip-user'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>{new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
                                    <td>
                                        <button className="action-btn block-btn">Заблокировать</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;