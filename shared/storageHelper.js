const { TableClient } = require("@azure/data-tables");
const { DefaultAzureCredential } = require("@azure/identity");

const tableClient = TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage,
    "verifiedUsers"
);

async function storeVerifiedUser(email, name) {
    const user = {
        partitionKey: "users",
        rowKey: email.toLowerCase(),
        name: name,
        verifiedAt: new Date().toISOString(),
    };

    await tableClient.upsertEntity(user);
}

async function isUserVerified(email) {
    try {
        await tableClient.getEntity("users", email.toLowerCase());
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    storeVerifiedUser,
    isUserVerified
}; 