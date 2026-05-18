'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        const ccpPath = "/home/bravo/Downloads/fabric-samples_18_04/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/connection-org2.json";
        const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

        const caInfo = ccp.certificateAuthorities['ca.org2.example.com'];
        const ca = new FabricCAServices(caInfo.url);

        const walletPath = path.join(__dirname, '../fabric/wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const adminExists = await wallet.get('adminOrg2');
        if (!adminExists) {
            throw new Error("Admin identity for Org2 is missing. Run enrollAdminOrg2 first.");
        }

        const userExists = await wallet.get('officerUser');
        if (userExists) {
            console.log("officerUser already exists");
            return;
        }

        const provider = wallet.getProviderRegistry().getProvider(adminExists.type);
        const adminUser = await provider.getUserContext(adminExists, 'adminOrg2');

        const secret = await ca.register({
            affiliation: 'org2.department1',
            enrollmentID: 'officerUser',
            role: 'client',
            attrs: [
                { name: 'role', value: 'Officer', ecert: true }
            ]
        }, adminUser);

        const enrollment = await ca.enroll({
            enrollmentID: 'officerUser',
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org2MSP',
            type: 'X.509',
        };

        await wallet.put('officerUser', x509Identity);
        console.log("Successfully registered and enrolled officerUser");

    } catch (error) {
        console.error(`Failed: ${error}`);
        process.exit(1);
    }
}

main();
