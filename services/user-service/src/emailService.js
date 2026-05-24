const sendVerificationEmail = async (email, username, verificationLink) => {
    // Beautiful ASCII box formatting for terminal logging in development
    const line = '='.repeat(80);
    const boxContent = `
${line}
📧 [NEW VERIFICATION EMAIL SENT]
${line}
To:       \x1b[36m${email}\x1b[0m
User:     \x1b[32m${username}\x1b[0m
Subject:  \x1b[35mПодтверждение регистрации на платформе AI Transcription\x1b[0m

Пожалуйста, подтвердите вашу почту, перейдя по следующей ссылке:
🔗 \x1b[4m\x1b[34m${verificationLink}\x1b[0m

Срок действия ссылки: 24 часа.
${line}
`;
    console.log(boxContent);

    // Fallback to real SMTP if configured
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass) {
        try {
            // Dynamic require to prevent crash if nodemailer is not installed locally
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: parseInt(smtpPort, 10),
                secure: parseInt(smtpPort, 10) === 465,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            await transporter.sendMail({
                from: `"AI Transcription Platform" <${smtpUser}>`,
                to: email,
                subject: 'Подтверждение регистрации',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #fafafa; color: #1e293b;">
                        <h2 style="color: #6366f1; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Добро пожаловать, ${username}!</h2>
                        <p style="font-size: 16px; line-height: 1.6;">Спасибо за регистрацию на нашей платформе. Пожалуйста, подтвердите ваш email адрес, чтобы разблокировать доступ к функциям анализа.</p>
                        <div style="margin: 30px 0; text-align: center;">
                            <a href="${verificationLink}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.2);">Подтвердить Email</a>
                        </div>
                        <p style="color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; padding-top: 15px;">Ссылка действительна в течение 24 часов.</p>
                    </div>
                `
            });
            console.log(`✅ Реальное письмо успешно отправлено на ${email} через SMTP (${smtpHost})`);
        } catch (err) {
            console.error('❌ Ошибка отправки реального письма через SMTP:', err.message);
        }
    }
};

module.exports = {
    sendVerificationEmail
};
