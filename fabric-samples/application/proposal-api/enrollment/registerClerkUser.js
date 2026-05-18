'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        const ccpPath = "/home/bravo/Downloads/fabric-samples_18_04/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json";
        const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const ca = new FabricCAServices(caInfo.url);

        const walletPath = path.join(__dirname, '../fabric/wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const adminExists = await wallet.get('adminOrg1');
        if (!adminExists) {
            throw new Error("Admin identity for Org1 is missing. Run enrollAdminOrg1 first.");
        }

        const userExists = await wallet.get('clerkUser');
        if (userExists) {
            console.log("clerkUser already exists");
            return;
        }

        const provider = wallet.getProviderRegistry().getProvider(adminExists.type);
        const adminUser = await provider.getUserContext(adminExists, 'adminOrg1');

        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: 'clerkUser',
            role: 'client',
            attrs: [
        { name: 'role', value: 'Clerk', ecert: true }
    ]
        }, adminUser);

        const enrollment = await ca.enroll({
            enrollmentID: 'clerkUser',
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };

        await wallet.put('clerkUser', x509Identity);
        console.log("Successfully registered and enrolled clerkUser");

    } catch (error) {
        console.error(`Failed: ${error}`);
        process.exit(1);
    }
}

main();
