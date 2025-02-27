const { app } = require('@azure/functions');
const sgMail = require('@sendgrid/mail');
const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');

// Set up SendGrid API
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Azure Table Storage Configuration
const tableName = "OtpStorage";
const accountName = process.env.AZURE_STORAGE_ACCOUNT;
const accountKey = process.env.AZURE_STORAGE_KEY;
const credential = new AzureNamedKeyCredential(accountName, accountKey);
const tableClient = new TableClient(`https://${accountName}.table.core.windows.net`, tableName, credential);

// Function to generate a 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

app.http('SendOTP', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { email } = await request.json();

            if (!email) {
                return { status: 400, body: 'Email is required.' };
            }

            const otp = generateOTP();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // Expires in 5 minutes

            // Store OTP in Azure Table Storage
            await tableClient.upsertEntity({
                partitionKey: "OTP",
                rowKey: email,
                otp,
                expiresAt
            });

            // Send OTP via email otp
            const msg = {
                to: email,
                from: process.env.SENDER_EMAIL,
                subject: 'Your OTP Code',
                html: `<p>Your OTP code is: <strong>${otp}</strong></p>`,
            };

            await sgMail.send(msg);

            context.log(`✅ OTP sent to ${email}: ${otp}`);

            return { status: 200, body: `OTP sent successfully to ${email}` };
        } catch (error) {
            context.log(`❌ Error sending OTP: ${error.message}`);
            return { status: 500, body: `Error sending OTP: ${error.message}` };
        }
    }
});
