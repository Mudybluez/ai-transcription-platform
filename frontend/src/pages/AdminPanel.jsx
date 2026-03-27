import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Функция для загрузки данных при открытии страницы
        const fetchData = async () => {
            try {
                // Делаем два запроса параллельно для скорости
                const [usersResponse, jobsResponse] = await Promise.all([
                    api.get('/users/all'), // Идет в User Service
                    api.get('/upload/jobs/all') // Идет в Upload Service
                ]);
                
                setUsers(usersResponse.data);
                setJobs(jobsResponse.data);
            } catch (error) {
                console.error('Ошибка загрузки данных для админки:', error);
                alert('Не удалось загрузить данные. Проверьте консоль.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) return <div style={{ padding: '20px' }}>Загрузка данных панели...</div>;

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>⚙️ Панель Администратора</h2>
                <Link to="/" style={{ padding: '8px 15px', backgroundColor: '#e5e7eb', textDecoration: 'none', color: '#000', borderRadius: '5px' }}>
                    Вернуться в Dashboard
                </Link>
            </header>
            <hr style={{ margin: '20px 0' }}/>

            <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                {/* Таблица пользователей */}
                <section style={{ flex: '1 1 400px' }}>
                    <h3>👥 Пользователи ({users.length})</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #333', backgroundColor: '#f9fafb' }}>
                                    <th style={{ padding: '10px' }}>ID</th>
                                    <th style={{ padding: '10px' }}>Имя</th>
                                    <th style={{ padding: '10px' }}>Email</th>
                                    <th style={{ padding: '10px' }}>Роль</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        <td style={{ padding: '10px' }}>{user.id}</td>
                                        <td style={{ padding: '10px' }}>{user.username}</td>
                                        <td style={{ padding: '10px' }}>{user.email}</td>
                                        <td style={{ padding: '10px' }}>
                                            <span style={{ 
                                                backgroundColor: user.role === 'admin' ? '#fef08a' : '#e5e7eb',
                                                padding: '3px 8px', borderRadius: '12px', fontSize: '12px'
                                            }}>
                                                {user.role}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Таблица задач */}
                <section style={{ flex: '1 1 400px' }}>
                    <h3>📡 Очередь задач ({jobs.length})</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #333', backgroundColor: '#f9fafb' }}>
                                    <th style={{ padding: '10px' }}>ID</th>
                                    <th style={{ padding: '10px' }}>User ID</th>
                                    <th style={{ padding: '10px' }}>Файл</th>
                                    <th style={{ padding: '10px' }}>Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.map(job => (
                                    <tr key={job.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        <td style={{ padding: '10px' }}>{job.id}</td>
                                        <td style={{ padding: '10px' }}>{job.user_id}</td>
                                        <td style={{ padding: '10px' }} title={job.file_name}>
                                            {job.file_name.length > 20 ? job.file_name.substring(0, 20) + '...' : job.file_name}
                                        </td>
                                        <td style={{ padding: '10px', fontWeight: 'bold', 
                                            color: job.status === 'COMPLETED' ? 'green' : 
                                                   job.status.includes('FAILED') ? 'red' : 'orange' 
                                        }}>
                                            {job.status}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AdminPanel;