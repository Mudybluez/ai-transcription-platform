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

        // 1.5 Проверка валидности имени пользователя (латиница, цифры, без пробелов, только символы -, _, @)
        const usernameRegex = /^[a-zA-Z0-9\-_@]+$/;
        if (!username || !usernameRegex.test(username)) {
            return res.status(400).json({ 
                message: 'Имя пользователя должно быть одним словом на латинице и может содержать только буквы, цифры и символы: -, _, @' 
            });
        }
        if (username.length >= 13) {
            return res.status(400).json({ 
                message: 'Длина имени пользователя должна быть меньше 13 символов' 
            });
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
        const verificationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // Срок действия 15 минут

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

        // Проверяем блокировку (бан) перед входом
        if (user.is_permanently_banned) {
            const lang = req.headers['accept-language'] || 'ru';
            let msg = 'Ваш аккаунт заблокирован навсегда.';
            if (lang.startsWith('en')) msg = 'Your account has been permanently blocked.';
            if (lang.startsWith('kk')) msg = 'Сіздің аккаунтыңыз біржола блокталған.';
            return res.status(403).json({ message: msg, banned: true });
        }

        if (user.banned_until && new Date(user.banned_until) > new Date()) {
            const lang = req.headers['accept-language'] || 'ru';
            const banDateStr = new Date(user.banned_until).toLocaleString(
                lang.startsWith('ru') ? 'ru-RU' : lang.startsWith('kk') ? 'kk-KZ' : 'en-US'
            );
            let msg = `Ваш аккаунт заблокирован. Временная блокировка истекает: ${banDateStr}`;
            if (lang.startsWith('en')) msg = `Your account is blocked. Temporary ban expires on: ${banDateStr}`;
            if (lang.startsWith('kk')) msg = `Сіздің аккаунтыңыз блокталған. Уақытша блоктау ${banDateStr} дейін жарамды.`;
            return res.status(403).json({ message: msg, banned: true, bannedUntil: user.banned_until });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        // Проверяем верификацию почты перед входом
        if (user.is_verified === false) {
            return res.status(403).json({ 
                message: 'Ваш email-адрес не подтвержден. Пожалуйста, подтвердите email перед входом в систему.',
                emailUnverified: true,
                email: user.email
            });
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

// Повторная отправка ссылки для подтверждения email
app.post('/resend-verification', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email не указан.' });
    }

    try {
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь с таким email не найден.' });
        }

        const user = userResult.rows[0];
        if (user.is_verified) {
            return res.status(400).json({ message: 'Ваш email уже подтвержден.' });
        }

        // Генерация нового токена верификации на 15 минут
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

        await db.query(
            `UPDATE users 
             SET verification_token = $1, verification_token_expires_at = $2 
             WHERE id = $3`,
            [verificationToken, verificationTokenExpiresAt, user.id]
        );

        const appUrl = process.env.APP_URL || 'http://localhost:8000';
        const verificationLink = `${appUrl}/api/users/verify-email?token=${verificationToken}`;

        emailService.sendVerificationEmail(user.email, user.username, verificationLink).catch(err => {
            console.error('Ошибка фоновой отправки письма верификации:', err);
        });

        res.status(200).json({ message: 'Ссылка для подтверждения почты успешно отправлена повторно.' });
    } catch (error) {
        console.error('Ошибка при повторной отправке верификации:', error);
        res.status(500).json({ message: 'Ошибка сервера при повторной отправке письма.' });
    }
});

// Получение публичного ключа reCAPTCHA для фронтенда
app.get('/recaptcha-site-key', (req, res) => {
    const siteKey = process.env.VITE_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || null;
    res.json({ siteKey });
});

app.get('/profile/:id', async (req, res) => {
    try {
        // Автоматическое разжалование просроченных подписок (Lazy subscription demotion)
        await db.query(`
            UPDATE users 
            SET role = 'Standard', subscription_status = 'expired' 
            WHERE role IN ('Lite', 'Pro') 
              AND subscription_status = 'active' 
              AND subscription_expires_at < NOW()
        `);

        const queryText = `
            SELECT 
                u.id, 
                u.username, 
                u.email, 
                u.role, 
                u.created_at,
                u.custom_requests,
                u.subscription_status,
                u.subscription_expires_at,
                (
                    SELECT COUNT(*)::integer 
                    FROM jobs j 
                    WHERE j.user_id = u.id AND j.created_at >= NOW() - INTERVAL '12 hours'
                ) as requests_last_12h,
                (
                    SELECT COUNT(*)::integer 
                    FROM jobs j 
                    WHERE j.user_id = u.id 
                      AND j.created_at >= COALESCE(u.subscription_expires_at, NOW()) - INTERVAL '1 month'
                ) as requests_this_month
            FROM users u
            WHERE u.id = $1
        `;
        const userResult = await db.query(queryText, [req.params.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        
        const user = userResult.rows[0];
        
        let remaining = 0;
        if (user.role === 'admin') {
            remaining = 'Unlimited';
        } else if (user.role === 'Pro') {
            const baseLimit = 100;
            const used = user.requests_this_month || 0;
            remaining = Math.max(0, baseLimit - used) + (user.custom_requests || 0);
        } else if (user.role === 'Lite') {
            const baseLimit = 20;
            const used = user.requests_this_month || 0;
            remaining = Math.max(0, baseLimit - used) + (user.custom_requests || 0);
        } else {
            const baseLimit = 2;
            const used = user.requests_last_12h || 0;
            remaining = Math.max(0, baseLimit - used) + (user.custom_requests || 0);
        }
        
        res.json({
            ...user,
            remaining_requests: remaining
        });
    } catch (error) {
        console.error('Ошибка в GET /profile/:id:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Симуляция успешного списания Direct Card / Google Pay / PayPal и подписки
app.post('/billing/subscribe', async (req, res) => {
    const { userId, plan } = req.body;
    if (!userId || !['Lite', 'Pro'].includes(plan)) {
        return res.status(400).json({ message: 'Неверные параметры запроса' });
    }
    try {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1); // подписка на месяц
        
        await db.query(
            `UPDATE users 
             SET role = $1, subscription_status = 'active', subscription_expires_at = $2 
             WHERE id = $3`,
            [plan, expiresAt, userId]
        );
        
        console.log(`💳 [Billing Service] Пользователь ${userId} подписался на тариф ${plan}`);
        
        // Уведомление
        const notifData = {
            message_ru: `Ваша подписка на тариф ${plan} успешно активирована!`,
            message_en: `Your ${plan} subscription has been successfully activated!`,
            message_kk: `Сіздің ${plan} тарифіне жазылымыңыз сәтті белсендірілді!`,
            plan: plan
        };
        await db.query(
            "INSERT INTO notifications (user_id, type, data) VALUES ($1, $2, $3)",
            [userId, 'SUBSCRIPTION_ACTIVATED', JSON.stringify(notifData)]
        );
        
        res.json({ 
            success: true, 
            message: `Подписка на тариф ${plan} успешно оформлена!`,
            role: plan,
            subscription_status: 'active',
            subscription_expires_at: expiresAt
        });
    } catch (err) {
        console.error('Ошибка в POST /billing/subscribe:', err);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// Симуляция покупки индивидуальных токенов Pay-per-Request ($0.25)
app.post('/billing/buy-tokens', async (req, res) => {
    const { userId, tokenCount } = req.body;
    if (!userId || !tokenCount || typeof tokenCount !== 'number' || tokenCount <= 0) {
        return res.status(400).json({ message: 'Неверные параметры запроса' });
    }
    try {
        await db.query(
            `UPDATE users 
             SET custom_requests = COALESCE(custom_requests, 0) + $1 
             WHERE id = $2`,
            [tokenCount, userId]
        );
        
        console.log(`💳 [Billing Service] Пользователь ${userId} купил ${tokenCount} токенов`);
        
        // Уведомление
        const notifData = {
            message_ru: `Баланс успешно пополнен на ${tokenCount} токенов!`,
            message_en: `Your balance was successfully refilled with ${tokenCount} tokens!`,
            message_kk: `Балансыңыз ${tokenCount} токенге сәтті толтырылды!`,
            tokenCount: tokenCount
        };
        await db.query(
            "INSERT INTO notifications (user_id, type, data) VALUES ($1, $2, $3)",
            [userId, 'TOKENS_PURCHASED', JSON.stringify(notifData)]
        );
        
        res.json({ 
            success: true, 
            message: `Успешно куплено токенов: ${tokenCount}!`,
            tokens: tokenCount
        });
    } catch (err) {
        console.error('Ошибка в POST /billing/buy-tokens:', err);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// --- ИНТЕГРАЦИЯ ОФИЦИАЛЬНЫХ СЕРВИСОВ ОПЛАТЫ (STRIPE & PAYPAL) ---

// 1. Stripe: Создание Payment Intent (Production-ready)
app.post('/billing/stripe-create-intent', async (req, res) => {
    const { userId, plan, tokenCount } = req.body;
    if (!userId) {
        return res.status(400).json({ message: 'Не указан ID пользователя' });
    }

    // Расчет стоимости в центах
    let amountInCents = 0;
    let description = '';
    if (plan === 'Lite') {
        amountInCents = 250; // $2.50
        description = 'SaaS Subscription - Lite Tier';
    } else if (plan === 'Pro') {
        amountInCents = 750; // $7.50
        description = 'SaaS Subscription - Pro Tier';
    } else if (plan === 'Tokens') {
        if (!tokenCount || tokenCount <= 0) {
            return res.status(400).json({ message: 'Неверное количество токенов' });
        }
        amountInCents = Math.round(tokenCount * 25); // $0.25 за токен
        description = `One-off Tokens Purchase (${tokenCount} tokens)`;
    } else {
        return res.status(400).json({ message: 'Неверный тарифный план' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
        console.warn('⚠️ [Stripe] STRIPE_SECRET_KEY не настроен. Запущена песочница в режиме симуляции.');
        return res.json({
            success: true,
            clientSecret: `pi_simulated_secret_${crypto.randomBytes(16).toString('hex')}`,
            simulated: true,
            amount: (amountInCents / 100).toFixed(2),
            description
        });
    }

    try {
        const params = new URLSearchParams({
            amount: amountInCents.toString(),
            currency: 'usd',
            description: description,
            'metadata[userId]': userId.toString(),
            'metadata[plan]': plan || '',
            'metadata[tokenCount]': tokenCount ? tokenCount.toString() : '0'
        });

        const response = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(stripeSecretKey + ':').toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        const data = await response.json();
        if (data.error) {
            console.error('❌ [Stripe API Error]:', data.error.message);
            return res.status(400).json({ message: data.error.message });
        }

        res.json({
            success: true,
            clientSecret: data.client_secret,
            paymentIntentId: data.id
        });
    } catch (err) {
        console.error('❌ Ошибка при создании Payment Intent в Stripe:', err);
        res.status(500).json({ message: 'Внутренняя ошибка при интеграции с платежным сервисом Stripe' });
    }
});

// 2. Stripe: Подтверждение транзакции и отправка чека
app.post('/billing/stripe-verify', async (req, res) => {
    const { userId, plan, tokenCount, paymentIntentId, method } = req.body;
    if (!userId || !paymentIntentId) {
        return res.status(400).json({ message: 'Неполные параметры платежа для верификации' });
    }

    try {
        let isSuccess = false;
        
        if (paymentIntentId.startsWith('pi_simulated_secret_')) {
            isSuccess = true;
            console.log('💳 [Stripe Sandbox] Симуляционный платеж подтвержден успешно.');
        } else {
            const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
            if (!stripeSecretKey) {
                return res.status(500).json({ message: 'Секретный ключ Stripe не настроен на сервере' });
            }

            const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${Buffer.from(stripeSecretKey + ':').toString('base64')}`
                }
            });

            const data = await response.json();
            if (data.status === 'succeeded') {
                isSuccess = true;
            } else {
                console.warn(`⚠️ [Stripe] Платеж Intent ${paymentIntentId} имеет статус: ${data.status}`);
            }
        }

        if (!isSuccess) {
            return res.status(400).json({ message: 'Платеж еще не подтвержден или отклонен' });
        }

        // --- Сохранение изменений в БД ---
        let updatedRole = 'Standard';
        let customRequestsAdded = 0;
        let price = '0.00';
        let productName = '';

        if (plan === 'Tokens') {
            customRequestsAdded = Number(tokenCount);
            price = (customRequestsAdded * 0.25).toFixed(2);
            productName = `Пакет токенов (${customRequestsAdded} шт)`;
            
            await db.query(
                `UPDATE users 
                 SET custom_requests = COALESCE(custom_requests, 0) + $1 
                 WHERE id = $2`,
                [customRequestsAdded, userId]
            );
        } else {
            updatedRole = plan;
            price = plan === 'Lite' ? '2.50' : '7.50';
            productName = `Подписка на тариф ${plan}`;
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);

            await db.query(
                `UPDATE users 
                 SET role = $1, subscription_status = 'active', subscription_expires_at = $2 
                 WHERE id = $3`,
                [plan, expiresAt, userId]
            );
        }

        const userRes = await db.query('SELECT username, email FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length > 0) {
            const { username, email } = userRes.rows[0];
            
            await emailService.sendReceiptEmail(email, username, productName, price, method || 'Direct Card');
            
            const notifData = {
                message_ru: `Оплата прошла успешно! ${productName} активирован. Чек отправлен на вашу почту ${email}.`,
                message_en: `Payment successful! ${productName} activated. Receipt sent to your email ${email}.`,
                message_kk: `Төлем сәтті өтті! ${productName} белсендірілді. Чек сіздің ${email} поштаңызға жіберілді.`,
                productName,
                price
            };
            await db.query(
                "INSERT INTO notifications (user_id, type, data) VALUES ($1, $2, $3)",
                [userId, 'PAYMENT_RECEIPT', JSON.stringify(notifData)]
            );
        }

        res.json({
            success: true,
            message: 'Платеж успешно верифицирован, чек отправлен на почту!'
        });

    } catch (err) {
        console.error('❌ Ошибка при верификации транзакции Stripe:', err);
        res.status(500).json({ message: 'Ошибка верификации платежа на сервере' });
    }
});

// 3. PayPal: Создание заказа в песочнице PayPal Sandbox (Production-ready)
app.post('/billing/paypal-create-order', async (req, res) => {
    const { userId, plan, tokenCount } = req.body;
    if (!userId) {
        return res.status(400).json({ message: 'Не указан ID пользователя' });
    }

    let price = 0;
    if (plan === 'Lite') {
        price = 2.50;
    } else if (plan === 'Pro') {
        price = 7.50;
    } else if (plan === 'Tokens') {
        if (!tokenCount || tokenCount <= 0) {
            return res.status(400).json({ message: 'Неверное количество токенов' });
        }
        price = tokenCount * 0.25;
    } else {
        return res.status(400).json({ message: 'Неверный тарифный план' });
    }

    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!paypalClientId || !paypalClientSecret) {
        console.warn('⚠️ [PayPal] Credentials не настроены. Используем симуляцию Sandbox.');
        return res.json({
            success: true,
            orderId: `PAY-SIMULATED-ORDER-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
            simulated: true,
            price: price.toFixed(2)
        });
    }

    try {
        const authResponse = await fetch('https://api.sandbox.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(paypalClientId + ':' + paypalClientSecret).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        const authData = await authResponse.json();
        const accessToken = authData.access_token;

        if (!accessToken) {
            return res.status(500).json({ message: 'Не удалось получить токен авторизации PayPal' });
        }

        const orderResponse = await fetch('https://api.sandbox.paypal.com/v2/checkout/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: 'USD',
                        value: price.toFixed(2)
                    },
                    description: plan === 'Tokens' ? `Buy ${tokenCount} tokens` : `Subscription to ${plan}`
                }]
            })
        });

        const orderData = await orderResponse.json();
        res.json({
            success: true,
            orderId: orderData.id
        });

    } catch (err) {
        console.error('❌ Ошибка при создании заказа в PayPal:', err);
        res.status(500).json({ message: 'Ошибка при взаимодействии с API PayPal' });
    }
});

// 4. PayPal: Захват средств (Capture) и отправка чека
app.post('/billing/paypal-capture-order', async (req, res) => {
    const { userId, plan, tokenCount, orderId, method } = req.body;
    if (!userId || !orderId) {
        return res.status(400).json({ message: 'Неполные параметры транзакции для подтверждения' });
    }

    try {
        let isCaptured = false;

        if (orderId.startsWith('PAY-SIMULATED-ORDER-')) {
            isCaptured = true;
            console.log('💳 [PayPal Sandbox] Симуляционный заказ захвачен успешно.');
        } else {
            const paypalClientId = process.env.PAYPAL_CLIENT_ID;
            const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;

            if (!paypalClientId || !paypalClientSecret) {
                return res.status(500).json({ message: 'PayPal реквизиты не настроены на сервере' });
            }

            const authResponse = await fetch('https://api.sandbox.paypal.com/v1/oauth2/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(paypalClientId + ':' + paypalClientSecret).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            const authData = await authResponse.json();
            const accessToken = authData.access_token;

            const captureResponse = await fetch(`https://api.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const captureData = await captureResponse.json();
            if (captureData.status === 'COMPLETED') {
                isCaptured = true;
            } else {
                console.warn(`⚠️ [PayPal] Заказ ${orderId} имеет статус: ${captureData.status}`);
            }
        }

        if (!isCaptured) {
            return res.status(400).json({ message: 'Платеж PayPal не был завершен успешно' });
        }

        let productName = '';
        let price = '0.00';

        if (plan === 'Tokens') {
            const customRequestsAdded = Number(tokenCount);
            price = (customRequestsAdded * 0.25).toFixed(2);
            productName = `Пакет токенов (${customRequestsAdded} шт)`;
            
            await db.query(
                `UPDATE users 
                 SET custom_requests = COALESCE(custom_requests, 0) + $1 
                 WHERE id = $2`,
                [customRequestsAdded, userId]
            );
        } else {
            price = plan === 'Lite' ? '2.50' : '7.50';
            productName = `Подписка на тариф ${plan}`;
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);

            await db.query(
                `UPDATE users 
                 SET role = $1, subscription_status = 'active', subscription_expires_at = $2 
                 WHERE id = $3`,
                [plan, expiresAt, userId]
            );
        }

        const userRes = await db.query('SELECT username, email FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length > 0) {
            const { username, email } = userRes.rows[0];
            
            await emailService.sendReceiptEmail(email, username, productName, price, method || 'PayPal');
            
            const notifData = {
                message_ru: `Оплата прошла успешно! ${productName} активирован. Чек отправлен на вашу почту ${email}.`,
                message_en: `Payment successful! ${productName} activated. Receipt sent to your email ${email}.`,
                message_kk: `Төлем сәтті өтті! ${productName} белсендірілді. Чек сіздің ${email} поштаңызға жіберілді.`,
                productName,
                price
            };
            await db.query(
                "INSERT INTO notifications (user_id, type, data) VALUES ($1, $2, $3)",
                [userId, 'PAYMENT_RECEIPT', JSON.stringify(notifData)]
            );
        }

        res.json({
            success: true,
            message: 'Платеж PayPal успешно подтвержден, чек отправлен на почту!'
        });

    } catch (err) {
        console.error('❌ Ошибка при захвате платежа PayPal:', err);
        res.status(500).json({ message: 'Ошибка при проведении платежа PayPal' });
    }
});

app.get('/all', requireAdmin, async (req, res) => {
    try {
        // Запрашиваем всех пользователей со статистикой запросов для админки
        const queryText = `
            SELECT 
                u.id, 
                u.username, 
                u.email, 
                u.role, 
                u.created_at, 
                u.custom_requests, 
                u.banned_until, 
                u.is_permanently_banned,
                u.subscription_status,
                u.subscription_expires_at,
                (
                    SELECT COUNT(*)::integer 
                    FROM jobs j 
                    WHERE j.user_id = u.id AND j.created_at >= NOW() - INTERVAL '12 hours'
                ) as requests_last_12h,
                (
                    SELECT COUNT(*)::integer 
                    FROM jobs j 
                    WHERE j.user_id = u.id 
                      AND j.created_at >= COALESCE(u.subscription_expires_at, NOW()) - INTERVAL '1 month'
                ) as requests_this_month
            FROM users u 
            ORDER BY u.created_at DESC
        `;
        const usersResult = await db.query(queryText);

        const usersWithRequests = usersResult.rows.map(user => {
            let remaining = 0;
            if (user.role === 'admin') {
                remaining = 'Unlimited';
            } else if (user.role === 'Pro') {
                const baseLimit = 100;
                const used = user.requests_this_month || 0;
                remaining = Math.max(0, baseLimit - used) + (user.custom_requests || 0);
            } else if (user.role === 'Lite') {
                const baseLimit = 20;
                const used = user.requests_this_month || 0;
                remaining = Math.max(0, baseLimit - used) + (user.custom_requests || 0);
            } else {
                const baseLimit = 2;
                const used = user.requests_last_12h || 0;
                remaining = Math.max(0, baseLimit - used) + (user.custom_requests || 0);
            }
            return {
                ...user,
                remaining_requests: remaining
            };
        });

        res.status(200).json(usersWithRequests);
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

    const usernameRegex = /^[a-zA-Z0-9\-_@]+$/;
    if (!newUsername || !usernameRegex.test(newUsername)) {
        return res.status(400).json({ 
            message: 'Имя пользователя должно быть одним словом на латинице и может содержать только буквы, цифры и символы: -, _, @' 
        });
    }
    if (newUsername.length >= 13) {
        return res.status(400).json({ 
            message: 'Длина имени пользователя должна быть меньше 13 символов' 
        });
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
function requireAdmin(req, res, next) {
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
}

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

// Мидлвар проверки блокировки для чувствительных эндпоинтов
const checkUserBan = async (req, res, next) => {
    const userId = req.body.userId || req.params.id || req.userId;
    if (!userId) return next();

    try {
        const userRes = await db.query(
            'SELECT banned_until, is_permanently_banned FROM users WHERE id = $1',
            [userId]
        );
        if (userRes.rows.length === 0) return next();

        const { banned_until, is_permanently_banned } = userRes.rows[0];

        if (is_permanently_banned) {
            const lang = req.headers['accept-language'] || 'ru';
            let msg = 'Ваш аккаунт заблокирован навсегда.';
            if (lang.startsWith('en')) msg = 'Your account has been permanently blocked.';
            if (lang.startsWith('kk')) msg = 'Сіздің аккаунтыңыз біржола блокталған.';
            return res.status(403).json({ message: msg, banned: true });
        }

        if (banned_until && new Date(banned_until) > new Date()) {
            const lang = req.headers['accept-language'] || 'ru';
            const banDateStr = new Date(banned_until).toLocaleString(
                lang.startsWith('ru') ? 'ru-RU' : lang.startsWith('kk') ? 'kk-KZ' : 'en-US'
            );
            let msg = `Ваш аккаунт заблокирован. Временная блокировка истекает: ${banDateStr}`;
            if (lang.startsWith('en')) msg = `Your account is blocked. Temporary ban expires on: ${banDateStr}`;
            if (lang.startsWith('kk')) msg = `Сіздің аккаунтыңыз блокталған. Уақытша блоктау ${banDateStr} дейін жарамды.`;
            return res.status(403).json({ message: msg, banned: true, bannedUntil: banned_until });
        }

        next();
    } catch (err) {
        console.error('Ошибка проверки бана в User Service:', err);
        next();
    }
};

// Применяем блокировку к смене пароля, обновлению имени и просмотру профиля
app.post('/change-password', checkUserBan);
app.post('/update-username', checkUserBan);
app.get('/profile/:id', checkUserBan);

// Обновление количества кастомных запросов пользователя (только для администраторов)
app.post('/update-custom-requests', requireAdmin, async (req, res) => {
    const { userId, customRequests } = req.body;
    
    if (customRequests === undefined || isNaN(parseInt(customRequests))) {
        return res.status(400).json({ message: 'Некорректное количество запросов' });
    }

    try {
        const result = await db.query(
            'UPDATE users SET custom_requests = $1 WHERE id = $2 RETURNING id, username, custom_requests',
            [parseInt(customRequests), userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        res.status(200).json({ 
            message: 'Количество кастомных запросов успешно обновлено', 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при обновлении лимитов' });
    }
});

// Модерация пользователя (временный/вечный бан, разблокировка)
app.post('/moderate-user', requireAdmin, async (req, res) => {
    const { userId, action, durationHours } = req.body;

    try {
        let queryText = '';
        let queryParams = [];

        if (action === 'perm_ban') {
            queryText = 'UPDATE users SET is_permanently_banned = TRUE, banned_until = NULL WHERE id = $1 RETURNING id, username, is_permanently_banned';
            queryParams = [userId];
        } else if (action === 'temp_ban') {
            const hours = parseInt(durationHours) || 24;
            const bannedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
            queryText = 'UPDATE users SET is_permanently_banned = FALSE, banned_until = $1 WHERE id = $2 RETURNING id, username, banned_until';
            queryParams = [bannedUntil, userId];
        } else if (action === 'unban') {
            queryText = 'UPDATE users SET is_permanently_banned = FALSE, banned_until = NULL WHERE id = $1 RETURNING id, username';
            queryParams = [userId];
        } else {
            return res.status(400).json({ message: 'Некорректное действие модерации' });
        }

        const result = await db.query(queryText, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        res.status(200).json({ 
            message: `Пользователь успешно смодерирован: ${action}`, 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ошибка сервера при модерации пользователя' });
    }
});

// --- СИСТЕМА ОТЗЫВОВ И УВЕДОМЛЕНИЙ ---

const sendNotificationToGateway = async (userId, notification) => {
    const gatewayUrl = process.env.API_GATEWAY_INTERNAL_URL || 'http://api-gateway:3000';
    try {
        await fetch(`${gatewayUrl}/internal/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, notification })
        });
    } catch (e) {
        console.warn(`[Gateway Sync Alert] Failed to send live notification to gateway. Error: ${e.message}`);
        try {
            await fetch(`http://localhost:3000/internal/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, notification })
            });
        } catch (err) {
            // Игнорируем, Gateway может быть не запущен в тестах
        }
    }
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'Доступ запрещен. Токен не предоставлен.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (e) {
        return res.status(403).json({ message: 'Недействительный или просроченный токен.' });
    }
};

// Отправка отзыва
app.post('/feedbacks', authenticateToken, async (req, res) => {
    const { rating, message } = req.body;
    const userId = req.userId;

    if (!rating || !message) {
        return res.status(400).json({ message: 'Рейтинг и сообщение обязательны для заполнения.' });
    }

    const validRatings = ['Fine', 'Good', 'Okay', 'Bad', 'Very Bad'];
    if (!validRatings.includes(rating)) {
        return res.status(400).json({ message: 'Недопустимый рейтинг.' });
    }

    try {
        const result = await db.query(
            'INSERT INTO feedbacks (user_id, rating, message) VALUES ($1, $2, $3) RETURNING *',
            [userId, rating, message]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка создания отзыва:', err);
        res.status(500).json({ message: 'Ошибка сервера при отправке отзыва.' });
    }
});

// Получение списка отзывов
app.get('/feedbacks', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const userRole = req.userRole;

    try {
        if (userRole === 'admin') {
            const queryText = `
                SELECT 
                    f.id, 
                    f.rating, 
                    f.message, 
                    f.created_at, 
                    u.username as sender_name,
                    fr.reply_text,
                    fr.created_at as reply_created_at
                FROM feedbacks f
                JOIN users u ON f.user_id = u.id
                LEFT JOIN feedback_replies fr ON f.id = fr.feedback_id
                ORDER BY f.created_at DESC
            `;
            const result = await db.query(queryText);
            
            const mapped = result.rows.map(row => ({
                id: row.id,
                rating: row.rating,
                message: row.message,
                created_at: row.created_at,
                sender_name: row.sender_name,
                reply: row.reply_text ? {
                    text: row.reply_text,
                    sender_role: 'Admin',
                    created_at: row.reply_created_at
                } : null
            }));

            res.status(200).json(mapped);
        } else {
            const queryText = `
                SELECT 
                    f.id, 
                    f.rating, 
                    f.message, 
                    f.created_at,
                    fr.reply_text,
                    fr.created_at as reply_created_at
                FROM feedbacks f
                LEFT JOIN feedback_replies fr ON f.id = fr.feedback_id
                WHERE f.user_id = $1
                ORDER BY f.created_at DESC
            `;
            const result = await db.query(queryText, [userId]);
            
            const mapped = result.rows.map(row => ({
                id: row.id,
                rating: row.rating,
                message: row.message,
                created_at: row.created_at,
                reply: row.reply_text ? {
                    text: row.reply_text,
                    sender_role: 'Admin',
                    created_at: row.reply_created_at
                } : null
            }));

            res.status(200).json(mapped);
        }
    } catch (err) {
        console.error('Ошибка получения отзывов:', err);
        res.status(500).json({ message: 'Ошибка сервера при получении отзывов.' });
    }
});

// Ответ на отзыв (только для админов)
app.post('/feedbacks/:id/reply', requireAdmin, async (req, res) => {
    const feedbackId = req.params.id;
    const { replyText } = req.body;
    const adminId = req.userId;

    if (!replyText || replyText.trim() === '') {
        return res.status(400).json({ message: 'Текст ответа обязателен.' });
    }

    try {
        const feedbackRes = await db.query('SELECT user_id, message FROM feedbacks WHERE id = $1', [feedbackId]);
        if (feedbackRes.rows.length === 0) {
            return res.status(404).json({ message: 'Отзыв не найден.' });
        }
        const feedback = feedbackRes.rows[0];

        const replyResult = await db.query(
            'INSERT INTO feedback_replies (feedback_id, admin_id, reply_text) VALUES ($1, $2, $3) RETURNING *',
            [feedbackId, adminId, replyText]
        );

        const snippet = feedback.message.length > 50 ? feedback.message.substring(0, 50) + '...' : feedback.message;
        const notifData = {
            feedback_id: feedbackId,
            feedback_snippet: snippet,
            message_en: 'An administrator replied to your feedback!',
            message_ru: 'Администратор ответил на ваш отзыв!',
            message_kk: 'Әкімші сіздің пікіріңізге жауап берді!'
        };

        const notifResult = await db.query(
            'INSERT INTO notifications (user_id, type, data) VALUES ($1, $2, $3) RETURNING *',
            [feedback.user_id, 'ADMIN_RESPONSE', JSON.stringify(notifData)]
        );

        sendNotificationToGateway(feedback.user_id, notifResult.rows[0]);

        res.status(201).json(replyResult.rows[0]);
    } catch (err) {
        console.error('Ошибка при ответе на отзыв:', err);
        res.status(500).json({ message: 'Ошибка сервера при отправке ответа.' });
    }
});

// Получение уведомлений
app.get('/notifications', authenticateToken, async (req, res) => {
    const userId = req.userId;
    try {
        const result = await db.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Ошибка получения уведомлений:', err);
        res.status(500).json({ message: 'Ошибка сервера при получении уведомлений.' });
    }
});

// Пометить все уведомления как прочитанные (должен быть ДО /:id/read)
app.post('/notifications/read-all', authenticateToken, async (req, res) => {
    const userId = req.userId;
    try {
        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );
        res.status(200).json({ message: 'Все уведомления помечены как прочитанные.' });
    } catch (err) {
        console.error('Ошибка при отметке всех прочитанными:', err);
        res.status(500).json({ message: 'Ошибка сервера.' });
    }
});

// Пометить уведомление как прочитанное
app.post('/notifications/:id/read', authenticateToken, async (req, res) => {
    const notifId = req.params.id;
    const userId = req.userId;

    try {
        const result = await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
            [notifId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Уведомление не найдено.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при отметке прочитанным:', err);
        res.status(500).json({ message: 'Ошибка сервера.' });
    }
});

// Удалить все уведомления пользователя
app.delete('/notifications', authenticateToken, async (req, res) => {
    const userId = req.userId;
    try {
        await db.query(
            'DELETE FROM notifications WHERE user_id = $1',
            [userId]
        );
        res.status(200).json({ message: 'Все уведомления удалены.' });
    } catch (err) {
        console.error('Ошибка при удалении всех уведомлений:', err);
        res.status(500).json({ message: 'Ошибка сервера при удалении уведомлений.' });
    }
});

// Удалить конкретное уведомление пользователя
app.delete('/notifications/:id', authenticateToken, async (req, res) => {
    const notifId = req.params.id;
    const userId = req.userId;
    try {
        const result = await db.query(
            'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
            [notifId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Уведомление не найдено.' });
        }
        res.status(200).json({ message: 'Уведомление удалено.', notification: result.rows[0] });
    } catch (err) {
        console.error('Ошибка при удалении уведомления:', err);
        res.status(500).json({ message: 'Ошибка сервера при удалении уведомления.' });
    }
});


app.listen(PORT, () => {
    console.log(`👤 User Service запущен на порту ${PORT}`);
});