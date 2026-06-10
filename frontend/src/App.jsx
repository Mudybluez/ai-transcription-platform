import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import Profile from './pages/Profile';
import GlobalMindMap from './pages/GlobalMindMap';

// Простой защищенный роут
const ProtectedRoute = ({ children, requireAdmin = false, requirePro = false }) => {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('role');

    if (!token) {
        return <Navigate to="/login" />;
    }

    if (requireAdmin && userRole !== 'admin') {
        return <Navigate to="/" />; // Если не админ, кидаем на главную
    }

    if (requirePro && userRole !== 'Pro' && userRole !== 'admin') {
        return <Navigate to="/profile" />; // Если не Pro+, кидаем в профиль/биллинг
    }

    return children;
};

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                
                {/* Кабинет обычного пользователя */}
                <Route path="/" element={
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                } />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/mindmap" element={<ProtectedRoute requirePro={true}><GlobalMindMap /></ProtectedRoute>} />
                {/* Админ панель */}
                <Route path="/admin" element={
                    <ProtectedRoute requireAdmin={true}>
                        <AdminPanel />
                    </ProtectedRoute>
                } />
            </Routes>
        </BrowserRouter>
    );
}

export default App;