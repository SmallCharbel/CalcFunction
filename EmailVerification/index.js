const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Store verification codes temporarily (in memory)
const verificationCodes = new Map();

module.exports = async function (context, req) {
    context.log('Email verification function processing request.');

    const { email, name, action, code } = req.body;

    if (!email) {
        return {
            status: 400,
            body: { error: "Email is required" }
        };
    }

    switch (action) {
        case 'send':
            return await handleSendVerification(context, email, name);
        case 'verify':
            return await handleVerifyCode(context, email, code);
        default:
            return {
                status: 400,
                body: { error: "Invalid action" }
            };
    }
};

async function handleSendVerification(context, email, name) {
    const verificationCode = generateVerificationCode();
    verificationCodes.set(email, {
        code: verificationCode,
        timestamp: Date.now()
    });

    try {
        await sendVerificationEmail(email, name, verificationCode);
        return {
            status: 200,
            body: { message: "Verification code sent successfully" }
        };
    } catch (error) {
        context.log.error('Error sending email:', error);
        return {
            status: 500,
            body: { error: "Failed to send verification email" }
        };
    }
}

async function handleVerifyCode(context, email, code) {
    const storedData = verificationCodes.get(email);
    
    if (!storedData) {
        return {
            status: 400,
            body: { error: "No verification code found for this email" }
        };
    }

    if (Date.now() - storedData.timestamp > 600000) { // 10 minutes expiration
        verificationCodes.delete(email);
        return {
            status: 400,
            body: { error: "Verification code expired" }
        };
    }

    if (storedData.code === code) {
        verificationCodes.delete(email);
        return {
            status: 200,
            body: { 
                message: "Email verified successfully",
                token: generateAccessToken(email)
            }
        };
    }

    return {
        status: 400,
        body: { error: "Invalid verification code" }
    };
}

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateAccessToken(email) {
    return jwt.sign(
        { email: email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

async function sendVerificationEmail(email, name, code) {
    const transporter = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        },
        tls: {
            ciphers: 'SSLv3'
        }
    });

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify your email for Calculator Access',
        html: `
            <h1>Hello ${name || 'there'}!</h1>
            <p>Your verification code is: <strong>${code}</strong></p>
            <p>This code will expire in 10 minutes.</p>
        `
    });
} 