const { app } = require('@azure/functions');
const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');

// Azure Table Storage Configuration
const tableName = "OtpStorage";
const accountName = process.env.AZURE_STORAGE_ACCOUNT;
const accountKey = process.env.AZURE_STORAGE_KEY;
const credential = new AzureNamedKeyCredential(accountName, accountKey);
const tableClient = new TableClient(`https://${accountName}.table.core.windows.net`, tableName, credential);

app.http('VerifyOTP', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { email, otp } = await request.json();

            if (!email || !otp) {
                return { status: 400, body: 'Email and OTP are required.' };
            }

            // Retrieve OTP from Table Storage
            const storedOTP = await tableClient.getEntity("OTP", email).catch(() => null);

            if (!storedOTP) {
                return { status: 400, body: 'OTP not found or expired.' };
            }

            if (new Date() > new Date(storedOTP.expiresAt)) {
                await tableClient.deleteEntity("OTP", email);
                return { status: 400, body: 'OTP expired. Request a new one.' };
            }

            if (storedOTP.otp !== otp) {
                return { status: 400, body: 'Invalid OTP. Try again.' };
            }

            // OTP is valid, delete it from storage
            await tableClient.deleteEntity("OTP", email);

            return { status: 200, body: 'OTP verified successfully. Access granted.' };
        } catch (error) {
            return { status: 500, body: `Error verifying OTP: ${error.message}` };
        }
    }
});
