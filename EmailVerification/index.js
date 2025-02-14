const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');

// Store verification codes temporarily (in memory)
const verificationCodes = new Map();

module.exports = async function (context, req) {
    context.log('Function started');
    
    try {
        // Log the entire request
        context.log('Request body:', JSON.stringify(req.body, null, 2));
        context.log('Request headers:', JSON.stringify(req.headers, null, 2));

        // Check if req.body exists
        if (!req.body) {
            throw new Error('Request body is empty');
        }

        const { email, name, type } = req.body;
        context.log(`Received request with email: ${email}, name: ${name}, type: ${type}`);

        // Validate required fields
        if (!email) {
            context.log.error('Email is missing');
            return {
                status: 400,
                body: { error: "Email is required" }
            };
        }

        if (!type) {
            context.log.error('Type is missing');
            return {
                status: 400,
                body: { error: "Type is required" }
            };
        }

        // Process based on type
        switch (type) {
            case 'login':
                context.log('Processing login request');
                return {
                    status: 200,
                    body: { message: "Login verification initiated" }
                };
            
            case 'register':
                context.log('Processing registration request');
                return {
                    status: 200,
                    body: { message: "Registration verification initiated" }
                };
            
            case 'verify':
                context.log('Processing verification request');
                return {
                    status: 200,
                    body: { message: "Verification successful" }
                };
            
            default:
                context.log.error(`Invalid type: ${type}`);
                return {
                    status: 400,
                    body: { error: `Invalid type: ${type}` }
                };
        }

    } catch (error) {
        context.log.error('Function error:', error.message);
        context.log.error('Stack trace:', error.stack);
        return {
            status: 500,
            body: { 
                error: "Internal server error", 
                details: error.message 
            }
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
    const credential = new ClientSecretCredential(
        process.env.AZURE_TENANT_ID,
        process.env.AZURE_CLIENT_ID,
        process.env.AZURE_CLIENT_SECRET
    );

    const client = Client.init({
        authProvider: async (done) => {
            try {
                const token = await credential.getToken('https://graph.microsoft.com/.default');
                done(null, token.token);
            } catch (error) {
                done(error, null);
            }
        }
    });

    const message = {
        message: {
            subject: 'Verify your email for Calculator Access',
            body: {
                contentType: 'HTML',
                content: `
                    <h1>Hello ${name || 'there'}!</h1>
                    <p>Your verification code is: <strong>${code}</strong></p>
                    <p>This code will expire in 10 minutes.</p>
                `
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: email
                    }
                }
            ]
        },
        saveToSentItems: true
    };

    try {
        await client.api('/users/' + process.env.EMAIL_USER + '/sendMail')
            .post(message);
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
} 