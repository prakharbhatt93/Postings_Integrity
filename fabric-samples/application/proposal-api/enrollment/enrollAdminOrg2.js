'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        const ccpPath = "/home/bravo/Downloads/fabric-samples_18_04/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/connection-org2.json";
        const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

        const caURL = ccp.certificateAuthorities['ca.org2.example.com'].url;
        const ca = new FabricCAServices(caURL);

        const walletPath = path.join(__dirname, '../fabric/wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const identity = await wallet.get('adminOrg2');
        if (identity) {
            console.log('Admin for Org2 already exists');
            return;
        }

        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org2MSP',
            type: 'X.509',
        };

        await wallet.put('adminOrg2', x509Identity);
        console.log('Successfully enrolled admin user adminOrg2 for Org2');

    } catch (error) {
        console.error(`Failed: ${error}`);
        process.exit(1);
    }
}

main();
