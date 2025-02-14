const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');

// Store verification codes temporarily (in memory)
const verificationCodes = new Map();

module.exports = async function (context, req) {
    try {
        context.log("Function starting");
        context.log("Checking environment variables...");

        // Check critical environment variables
        const requiredVars = [
            'EMAIL_USER',
            'JWT_SECRET',
            'AZURE_CLIENT_ID',
            'AZURE_CLIENT_SECRET'
        ];

        const missingVars = requiredVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            context.log.error(`Missing environment variables: ${missingVars.join(', ')}`);
            return {
                status: 500,
                body: {
                    error: "Configuration error",
                    details: `Missing required environment variables: ${missingVars.join(', ')}`
                }
            };
        }

        // Log request details
        context.log("Environment variables verified");
        context.log("Request body:", req.body);
        
        const { email, type, code, name } = req.body || {};
        
        if (!email) {
            return {
                status: 400,
                body: { error: "Email is required" }
            };
        }

        if (!type) {
            return {
                status: 400,
                body: { error: "Type is required" }
            };
        }

        // Return success for testing
        return {
            status: 200,
            body: {
                message: "Configuration verified",
                type: type,
                email: email,
                envVarsPresent: requiredVars
            }
        };

    } catch (error) {
        context.log.error("Function error:", error);
        return {
            status: 500,
            body: {
                error: "Internal server error",
                message: error.message,
                type: error.type
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