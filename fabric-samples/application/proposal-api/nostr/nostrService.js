'use strict';

const crypto = require('crypto');
const { Wallets } = require('fabric-network');
const path = require('path');


const ROLE_IDENTITY_MAP = {
    clerk: "clerkUser",
    officer: "officerUser",
    hod: "hodUser"
};


// LOAD FABRIC IDENTITY

async function getIdentity(role) {

    const walletPath = path.join(__dirname, '..', 'fabric', 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identityName = ROLE_IDENTITY_MAP[role];

    if (!identityName) {
        throw new Error(`Unknown role: ${role}`);
    }

    const identity = await wallet.get(identityName);

    if (!identity) {
        throw new Error(`Identity not found in wallet: ${identityName}`);
    }

    console.log(`Loaded identity: ${identityName}`);

    return identity;
}


// SIGN EVENT USING FABRIC KEY
async function signEvent(event, role) {

    console.log("signEvent START:", role);

    const identity = await getIdentity(role);

    const privateKey = identity.credentials?.privateKey
        ?.replace(/\r\n/g, '\n')
        ?.trim();

    const certificate = identity.credentials?.certificate
        ?.replace(/\r\n/g, '\n')
        ?.trim();

    console.log("ROLE:", role);
    console.log("PrivateKey exists:", !!privateKey);
    console.log("Certificate exists:", !!certificate);

    if (!privateKey) {
        throw new Error("Private key missing from identity");
    }

    const serialized = JSON.stringify(event);

    const id = crypto.createHash('sha256')
        .update(serialized)
        .digest('hex');

    let sig;

    try {
        const sign = crypto.createSign('SHA256');
        sign.update(id);
        sign.end();

        sig = sign.sign(privateKey, 'hex');

    } catch (err) {
        console.error("SIGNING FAILED:", err);
        throw new Error("Signature generation failed");
    }

    if (!sig) {
        throw new Error("Signature is undefined");
    }

    console.log("Signed event:", {
        id,
        sig: sig.slice(0, 20) + "..."
    });

    let pubkey;
    try {
        pubkey = crypto.createPublicKey({
            key: certificate,
            format: 'pem'
        }).export({
            type: 'spki',
            format: 'der'
        }).toString('hex');

    } catch (err) {
        console.error("PUBKEY EXTRACTION FAILED:", err);
        throw new Error("Public key extraction failed");
    }

    const finalEvent = {
        ...event,
        id,
        sig,
        pubkey
    };

    console.log("signEvent SUCCESS:", finalEvent.id);

    return finalEvent;
}

// BASE EVENT BUILDER

async function buildEvent({
    proposalId,
    filePath = '',
    description = '',
    role,
    type,
    comment = '',
    version = 1,
    fileHash = ''
}) {

    console.log(`buildEvent START: ${type} | role=${role}`);

    const tags = [
        ["proposalId", String(proposalId).trim()],
        ["version", String(version)],
        ["role", role],
        ["type", type],
        ["filePath", filePath || ""],
        ["description", description || ""]
    ];

    if (comment && comment.trim() !== '') {
        tags.push(["comment", comment]);
    }

    const event = {
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags,
        content: fileHash || ""
    };

    try {
        const signed = await signEvent(event, role);

        if (!signed || !signed.id) {
            throw new Error("Signed event invalid");
        }

        console.log(`buildEvent SUCCESS: ${signed.id}`);
        return signed;

    } catch (err) {
        console.error("buildEvent FAILED:", err);
        throw err;
    }
}

// CLERK EVENTS
async function createEvent(proposalId, filePath, fileHash, version, description) {
    console.log("createEvent START");
    try {
        const result = await buildEvent({
            proposalId,
            filePath,
            fileHash,
            version,
            role: "clerk",
            type: "CREATE",
            description
        });

        console.log("createEvent SUCCESS:", result?.id);
        return result;

    } catch (err) {
        console.error("createEvent FAILED:", err);
        throw err;
    }
}

async function revisionEvent(proposalId, filePath, fileHash, version, comment = '', description = '') {
    console.log("revisionEvent START");
    try {
        const result = await buildEvent({
            proposalId,
            filePath,
            fileHash,
            version,
            role: "clerk",
            type: "REVISION",
            description,
            comment
        });

        console.log("revisionEvent SUCCESS:", result?.id);
        return result;

    } catch (err) {
        console.error("revisionEvent FAILED:", err);
        throw err;
    }
}

// OFFICER EVENTS

async function reviewRequestEvent(proposalId, comment, version, fileHash) {
    console.log("reviewRequestEvent START");
    try {
        const result = await buildEvent({
            proposalId,
            version,
            role: "officer",
            type: "REVIEW_REQUEST",
            description: "Sent Back for Review",
            comment,
            fileHash
        });

        console.log("reviewRequestEvent SUCCESS:", result?.id);
        return result;

    } catch (err) {
        console.error("reviewRequestEvent FAILED:", err);
        throw err;
    }
}

async function recommendEvent(proposalId, comment, version, fileHash) {
    console.log("recommendEvent START");

    try {
        const result = await buildEvent({
            proposalId,
            version,
            role: "officer",
            type: "RECOMMEND",
            description: "Recommended",
            comment,
            fileHash
        });

        console.log("recommendEvent SUCCESS:", result?.id);

        if (!result || !result.id) {
            throw new Error("recommendEvent returned invalid result");
        }

        return result;

    } catch (err) {
        console.error("recommendEvent FAILED:", err);
        throw err;
    }
}

// HOD EVENTS

async function approveEvent(proposalId, comment, version, fileHash) {
    console.log("approveEvent START");
    try {
        const result = await buildEvent({
            proposalId,
            version,
            role: "hod",
            type: "APPROVE",
            description: "Approved",
            comment,
            fileHash
        });

        console.log("approveEvent SUCCESS:", result?.id);
        return result;

    } catch (err) {
        console.error("approveEvent FAILED:", err);
        throw err;
    }
}

async function sendBackToOfficerEvent(proposalId, comment, version, fileHash) {
    console.log("sendBackToOfficerEvent START");
    try {
        const result = await buildEvent({
            proposalId,
            version,
            role: "hod",
            type: "SEND_BACK_TO_OFFICER",
            description: "Sent Back to Officer",
            comment,
            fileHash
        });

        console.log("sendBackToOfficerEvent SUCCESS:", result?.id);
        return result;

    } catch (err) {
        console.error("sendBackToOfficerEvent FAILED:", err);
        throw err;
    }
}

// EXPORTS

module.exports = {
    createEvent,
    revisionEvent,
    reviewRequestEvent,
    recommendEvent,
    approveEvent,
    sendBackToOfficerEvent
};
