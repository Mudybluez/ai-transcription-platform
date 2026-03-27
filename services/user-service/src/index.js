const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

app.use(express.json());

// Регистрация нового пользователя
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Проверяем, существует ли пользователь
        const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }

        // Хэшируем пароль
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Сохраняем в базу
        const newUser = await db.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, role',
            [username, email, hashedPassword]
        );

        res.status(201).json({ message: 'Пользователь успешно зарегистрирован', user: newUser.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при регистрации' });
    }
});

// Вход в систему (Login)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Ищем пользователя
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        const user = userResult.rows[0];

        // Сверяем пароль
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        // Генерируем JWT токен
        const payload = {
            userId: user.id,
            role: user.role
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        res.status(200).json({
            message: 'Успешный вход',
            token,
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при входе' });
    }
});

// Роут для получения профиля текущего пользователя (требует токен)
// Важно: API Gateway уже проверил токен и передал запрос сюда
app.get('/profile/:id', async (req, res) => {
    try {
        const userResult = await db.query('SELECT id, username, email, role, created_at FROM users WHERE id = $1', [req.params.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        res.json(userResult.rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});
app.get('/all', async (req, res) => {
    try {
        // Запрашиваем всех пользователей, но без паролей!
        const usersResult = await db.query('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC');
        res.status(200).json(usersResult.rows);
    } catch (error) {
        console.error('Ошибка при получении списка пользователей:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

app.listen(PORT, () => {
    console.log(`👤 User Service запущен на порту ${PORT}`);
});