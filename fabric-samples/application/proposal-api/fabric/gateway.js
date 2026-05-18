'use strict';

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const channelName = 'mychannel';
const chaincodeName = 'proposal';


// CONNECTION PROFILE

function getCCP(role) {

    let org;

    if (role === 'clerk') org = 'org1';
    else if (role === 'officer') org = 'org2';
    else if (role === 'hod') org = 'org2'; 
    else throw new Error('Invalid role');

    const ccpPath = path.resolve(
        __dirname,
        '../../../test-network/organizations/peerOrganizations',
        `${org}.example.com`,
        `connection-${org}.json`
    );

    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
    return ccp;
}


// USER MAPPING

function getUser(role) {

    if (role === 'clerk') return 'clerkUser';
    if (role === 'officer') return 'officerUser';
    if (role === 'hod') return 'hodUser';   //

    throw new Error('Invalid role');
}

// CONNECT TO CONTRACT

async function getContract(role) {

    const ccp = getCCP(role);
    const userId = getUser(role);

    // wallet path (same structure)
    const walletPath = path.join(__dirname, 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get(userId);
    if (!identity) {
        throw new Error(`Identity ${userId} not found in wallet`);
    }

    const gateway = new Gateway();

    await gateway.connect(ccp, {
        wallet,
        identity: userId,
        discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    return { contract, gateway };
}

module.exports = { getContract };
