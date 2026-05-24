const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dns = require('dns').promises;
const db = require('./db');
const emailService = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

app.use(express.json());

// Функция для проверки силы пароля
const isPasswordStrongEnough = (password) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
    
    return score >= 3; // Минимум "Средний" уровень
};

// Функция для проверки синтаксиса и существования почтового домена (MX записи)
const validateEmailDeliverability = async (email) => {
    // 1. Проверка синтаксиса
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        return { isValid: false, reason: 'Некорректный синтаксис email-адреса.' };
    }

    const domain = email.split('@')[1].toLowerCase();

    // 2. Черный список одноразовых доменов временной почты
    const disposableDomains = [
        'mailinator.com', 'yopmail.com', '10minutemail.com', 'tempmail.com', 
        'dispostable.com', 'guerrillamail.com', 'sharklasers.com', 'getairmail.com',
        'temp-mail.org', 'trashmail.com', 'boun.cr'
    ];
    if (disposableDomains.includes(domain)) {
        return { isValid: false, reason: 'Регистрация с временных почтовых ящиков запрещена.' };
    }

    // 3. Проверка существования домена и наличия MX-записей через DNS
    try {
        const mxRecords = await dns.resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
            return { isValid: false, reason: 'Почтовый домен не существует или не может принимать сообщения (отсутствуют MX-записи).' };
        }
    } catch (err) {
        console.warn(`[Deliverability Check Failure] Domain: ${domain}, Error: ${err.message}`);
        return { isValid: false, reason: 'Указанный почтовый домен не существует или недоступен.' };
    }

    return { isValid: true };
};

app.post('/register', async (req, res) => {
    const { username, email, password, recaptchaToken } = req.body;

    try {
        // 1. Верификация Invisible Google reCAPTCHA v3
        const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
        if (recaptchaSecret) {
            if (!recaptchaToken) {
                return res.status(400).json({ message: 'Ошибка безопасности. Токен reCAPTCHA отсутствует.' });
            }
            try {
                const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
                const verifyRes = await fetch(verifyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`
                });
                const verifyData = await verifyRes.json();
                if (!verifyData.success || verifyData.score < 0.5) {
                    console.warn(`[Security Alert] Bot detected or low score during registration:`, verifyData);
                    return res.status(400).json({ message: 'Ошибка безопасности. Запрос классифицирован как автоматизированная активность (бот).' });
                }
            } catch (err) {
                console.error('Ошибка верификации reCAPTCHA:', err);
                return res.status(500).json({ message: 'Ошибка сервера при проверке безопасности reCAPTCHA.' });
            }
        }

        // 2. Проверка силы пароля
        if (!isPasswordStrongEnough(password)) {
            return res.status(400).json({ 
                message: 'Пароль слишком слабый. Он должен содержать как минимум 3 из следующих условий: 8 символов, заглавная буква, строчная буква, цифра, специальный символ.' 
            });
        }

        // 3. Проверка синтаксиса и доставляемости email (DNS MX check)
        const emailCheck = await validateEmailDeliverability(email);
        if (!emailCheck.isValid) {
            return res.status(400).json({ message: emailCheck.reason });
        }

        // 4. Проверка существования пользователя
        const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }

        // 5. Хеширование пароля
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 6. Генерация токена верификации почты
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Срок действия 24 часа

        // 7. Сохранение в БД (по умолчанию is_verified = FALSE)
        const newUser = await db.query(
            `INSERT INTO users (username, email, password, role, is_verified, verification_token, verification_token_expires_at) 
             VALUES ($1, $2, $3, 'Standard', FALSE, $4, $5) 
             RETURNING id, username, email, role, is_verified`,
            [username, email, hashedPassword, verificationToken, verificationTokenExpiresAt]
        );

        // 8. Отправка письма с верификацией
        const appUrl = process.env.APP_URL || 'http://localhost:8000';
        const verificationLink = `${appUrl}/api/users/verify-email?token=${verificationToken}`;
        
        // Отправляем в фоновом режиме, чтобы не задерживать HTTP ответ
        emailService.sendVerificationEmail(email, username, verificationLink).catch(err => {
            console.error('Ошибка фоновой отправки письма верификации:', err);
        });

        res.status(201).json({ 
            message: 'Пользователь успешно зарегистрирован. На указанный email отправлено письмо для подтверждения аккаунта.', 
            user: newUser.rows[0] 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при регистрации' });
    }
});

// Роут подтверждения email адреса (по ссылке)
app.get('/verify-email', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('<h1>Ошибка</h1><p>Токен верификации отсутствует.</p>');
    }

    try {
        const userResult = await db.query(
            'SELECT * FROM users WHERE verification_token = $1 AND verification_token_expires_at > NOW()',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).send('<h1>Ошибка верификации</h1><p>Ссылка недействительна, просрочена или уже была использована.</p>');
        }

        const user = userResult.rows[0];

        // Активируем аккаунт, сбрасываем токен и обновляем отметку времени верификации
        await db.query(
            `UPDATE users 
             SET is_verified = TRUE, email_verified_at = CURRENT_TIMESTAMP, verification_token = NULL, verification_token_expires_at = NULL 
             WHERE id = $1`,
            [user.id]
        );

        // Перенаправляем пользователя на форму входа на фронтенде с сообщением о верификации
        const appUrl = process.env.APP_URL || 'http://localhost:8000';
        res.redirect(`${appUrl}/login?verified=true`);
    } catch (error) {
        console.error('Ошибка при верификации email:', error);
        res.status(500).send('<h1>Внутренняя ошибка</h1><p>Произошла ошибка сервера при обработке подтверждения почты.</p>');
    }
});

// Вход в систему (Login)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {

        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        const user = userResult.rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

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

// Смена пароля
app.post('/change-password', async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;

    try {
        if (!isPasswordStrongEnough(newPassword)) {
            return res.status(400).json({ 
                message: 'Пароль слишком слабый. Он должен содержать как минимум 3 из следующих условий: 8 символов, заглавная буква, строчная буква, цифра, специальный символ.' 
            });
        }

        const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Неверный старый пароль' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        res.status(200).json({ message: 'Пароль успешно изменен' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при смене пароля' });
    }
});

// Обновление имени пользователя
app.post('/update-username', async (req, res) => {
    const { userId, newUsername } = req.body;

    if (!newUsername || newUsername.trim() === '') {
        return res.status(400).json({ message: 'Имя пользователя не может быть пустым' });
    }

    try {
        const result = await db.query(
            'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email, role',
            [newUsername, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        res.status(200).json({ 
            message: 'Имя пользователя успешно обновлено', 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при обновлении имени пользователя' });
    }
});

// Мидлвар для проверки прав администратора
const requireAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'Доступ запрещен. Токен не предоставлен.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: 'Доступ запрещен. Требуются права администратора.' });
        }
        req.userId = decoded.userId;
        next();
    } catch (e) {
        return res.status(403).json({ message: 'Недействительный или просроченный токен.' });
    }
};

// Обновление роли пользователя (только для администраторов)
app.post('/update-role', requireAdmin, async (req, res) => {
    const { userId, newRole } = req.body;

    const allowedRoles = ['Standard', 'Lite', 'Pro', 'admin'];
    if (!allowedRoles.includes(newRole)) {
        return res.status(400).json({ message: 'Некорректная роль пользователя. Допустимые роли: Standard, Lite, Pro, admin.' });
    }

    try {
        const result = await db.query(
            'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role',
            [newRole, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        res.status(200).json({ 
            message: 'Роль пользователя успешно обновлена', 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при обновлении роли пользователя' });
    }
});

app.listen(PORT, () => {
    console.log(`👤 User Service запущен на порту ${PORT}`);
});