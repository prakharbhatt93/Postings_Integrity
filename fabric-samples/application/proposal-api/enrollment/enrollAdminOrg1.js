'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        const ccpPath = "/home/bravo/Downloads/fabric-samples_18_04/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json";
        const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

        const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
        const ca = new FabricCAServices(caURL);

        const walletPath = path.join(__dirname, '../fabric/wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const identity = await wallet.get('adminOrg1');
        if (identity) {
            console.log('Admin for Org1 already exists');
            return;
        }

        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' }); //for POC hardcoded Credentials being used. Admin API can also be used for generating these certificates using credentials added by the system admin for each organization

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };

        await wallet.put('adminOrg1', x509Identity);
        console.log('Successfully enrolled admin user adminOrg1 for Org1');

    } catch (error) {
        console.error(`Failed: ${error}`);
        process.exit(1);
    }
}

main();
