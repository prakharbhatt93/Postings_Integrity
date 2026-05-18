const express = require('express');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const { getContract } = require('./fabric/gateway');

const {
    createEvent,
    revisionEvent,
    reviewRequestEvent,
    recommendEvent,
    approveEvent,
    sendBackToOfficerEvent
} = require('./nostr/nostrService');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));



app.use((req, res, next) => {
    console.log(`\n[${req.method}] ${req.url}`);
    next();
});

//FILE STORAGE

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});
const upload = multer({ storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//NOSTR STORAGE
const NOSTR_FILE = path.join(__dirname, 'nostr.json');

function saveToNostr(event) {
    let data = [];

    if (fs.existsSync(NOSTR_FILE)) {
        data = JSON.parse(fs.readFileSync(NOSTR_FILE));
    }
    data.push(event);
    fs.writeFileSync(NOSTR_FILE, JSON.stringify(data, null, 2));
}

//VERIFICATION
function computeFileHash(filePath) {
    if (!filePath || !fs.existsSync(path.join(__dirname, filePath))) return null;

    const buffer = fs.readFileSync(path.join(__dirname, filePath));
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getLatestNostrEvent(proposalId) {
    if (!fs.existsSync(NOSTR_FILE)) return null;

    const data = JSON.parse(fs.readFileSync(NOSTR_FILE));

    const events = data.filter(e =>
        e.tags?.some(t => t[0] === "proposalId" && t[1] === String(proposalId))
    );

    return events.length ? events[events.length - 1] : null;
}

function verifyNostrEventIntegrity(event) {
    try {
        if (!event) return { valid: false, issues: ["Missing Nostr event"] };

        const { id, sig, pubkey, ...unsignedEvent } = event;

        const serialized = JSON.stringify(unsignedEvent);

        const recomputedId = crypto.createHash('sha256')
            .update(serialized)
            .digest('hex');

        const issues = [];

        //Event ID check
        if (recomputedId !== id) {
            issues.push("Nostr event ID mismatch (tampered event)");
        }

        //Signature verification
        try {
            const verify = crypto.createVerify('SHA256');
            verify.update(id);
            verify.end();

            const pubkeyBuffer = Buffer.from(pubkey, 'hex');

            const isValidSig = verify.verify(
                {
                    key: pubkeyBuffer,
                    format: 'der',
                    type: 'spki'
                },
                Buffer.from(sig, 'hex')
            );

            if (!isValidSig) {
                issues.push("Invalid Nostr signature");
            }

        } catch (err) {
            issues.push("Signature verification failed");
        }

        return {
            valid: issues.length === 0,
            issues
        };

    } catch (err) {
        return {
            valid: false,
            issues: ["Nostr verification crashed"]
        };
    }
}


async function verifyIntegrity(contract, proposalId) {

    console.log(`Verifying proposal: ${proposalId}`);

    const result = {
        csvHash: null,
        fabricHash: null,
        nostrHash: null,
        status: "OK",
        issues: []
    };

    const latest = JSON.parse(
        (await contract.evaluateTransaction('getLatestState', proposalId)).toString()
    );

    console.log("Fabric State:", latest);

    result.fabricHash = latest.fileHash || latest.hash || "";

    if (latest.filePath) {
        result.csvHash = computeFileHash(latest.filePath);
    }

    const nostrEvent = getLatestNostrEvent(proposalId);

let nostrCheck = { valid: true, issues: [] };

if (nostrEvent) {

    result.nostrHash = nostrEvent.content || "";

    //Verify event integrity
    nostrCheck = verifyNostrEventIntegrity(nostrEvent);

    if (!nostrCheck.valid) {
        result.status = "TAMPERED";
        result.issues.push(...nostrCheck.issues);
    }

    //check ledger binding
    if (latest.nostr_id && latest.nostr_id !== nostrEvent.id) {
        result.status = "TAMPERED";
        result.issues.push("Ledger ↔ Nostr ID mismatch");
    }
}
    

    console.log("CSV Hash:", result.csvHash);
    console.log("Fabric Hash:", result.fabricHash);
    console.log("Nostr Hash:", result.nostrHash);

    if (result.csvHash && result.fabricHash && result.csvHash !== result.fabricHash) {
        result.status = "TAMPERED";
        result.issues.push("CSV ↔ Fabric mismatch");
    }

    if (result.nostrHash && result.fabricHash && result.nostrHash !== result.fabricHash) {
        result.status = "TAMPERED";
        result.issues.push("Nostr ↔ Fabric mismatch");
    }

    if (result.csvHash && result.nostrHash && result.csvHash !== result.nostrHash) {
        result.status = "TAMPERED";
        result.issues.push("CSV ↔ Nostr mismatch");
    }

    console.log("Verification Result:", result);

    return result;
}

// CREATE

app.post('/proposal/create', upload.single('file'), async (req, res) => {
    try {
        const { proposalId, description } = req.body;
        const filePath = req.file ? `uploads/${req.file.filename}` : '';

        const fileBuffer = fs.readFileSync(path.join(__dirname, filePath));
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const version = 1;

        const nostrEvent = await createEvent(proposalId, filePath, hash, version, description);
        saveToNostr(nostrEvent);

        const nonce = crypto.randomBytes(16).toString('hex');

        const { contract, gateway } = await getContract('clerk');

        await contract.submitTransaction(
            'createProposal',
            proposalId,
            hash,
            nonce,
            description,
            filePath,
            nostrEvent.id
        );

        await gateway.disconnect();

        res.send('Proposal created');

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// REVISION

app.post('/proposal/revise', upload.single('file'), async (req, res) => {
    try {
        const { proposalId, description } = req.body;
        const filePath = req.file ? `uploads/${req.file.filename}` : '';

        const fileBuffer = fs.readFileSync(path.join(__dirname, filePath));
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const { contract, gateway } = await getContract('clerk');

        //VERIFY
        const integrity = await verifyIntegrity(contract, proposalId);
        if (integrity.status !== "OK") {
            await gateway.disconnect();
            return res.status(400).json({ error: "Integrity violation", details: integrity });
        }

        const latest = JSON.parse(
            (await contract.evaluateTransaction('getLatestState', proposalId)).toString()
        );

        const version = latest.version + 1;

        const nostrEvent = await revisionEvent(
            proposalId,
            filePath,
            fileHash,
            version,
            '',
            description
        );

        saveToNostr(nostrEvent);

        const nonce = crypto.randomBytes(16).toString('hex');

        await contract.submitTransaction(
            'submitRevision',
            proposalId,
            fileHash,
            nonce,
            description,
            filePath,
            nostrEvent.id,
            String(version)
        );

        await gateway.disconnect();

        res.send('Revision submitted');

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// REVIEW
app.post('/proposal/review', async (req, res) => {
    try {
        const { proposalId, comment } = req.body;

        const { contract, gateway } = await getContract('officer');

        const integrity = await verifyIntegrity(contract, proposalId);
        if (integrity.status !== "OK") {
            await gateway.disconnect();
            return res.status(400).json({ error: "Integrity violation", details: integrity });
        }

        const latest = JSON.parse(
            (await contract.evaluateTransaction('getLatestState', proposalId)).toString()
        );

        const fileHash = latest.fileHash || latest.hash || "";

        //FIXED (await added)
        const nostrEvent = await reviewRequestEvent(
            proposalId,
            comment,
            latest.version,
            fileHash
        );

        console.log("Review event:", nostrEvent?.id);

        if (!nostrEvent || !nostrEvent.id) {
            throw new Error("reviewEvent undefined");
        }

        saveToNostr(nostrEvent);

        await contract.submitTransaction(
            'sendForReview',
            proposalId,
            comment,
            nostrEvent.id
        );

        await gateway.disconnect();

        res.send('Sent for review');

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// RECOMMEND

app.post('/proposal/recommend', async (req, res) => {
    try {
        const { proposalId, comment } = req.body;

        console.log("Recommend request:", { proposalId, comment });

        const { contract, gateway } = await getContract('officer');

        //VERIFY
        const integrity = await verifyIntegrity(contract, proposalId);

        if (integrity.status !== "OK") {
            console.log("Integrity FAILED:", integrity);
            await gateway.disconnect();
            return res.status(400).json({
                error: "Integrity violation",
                details: integrity
            });
        }

        console.log("Integrity OK");

        const latest = JSON.parse(
            (await contract.evaluateTransaction('getLatestState', proposalId)).toString()
        );

        console.log("Latest state:", latest);

        const fileHash = latest.fileHash || latest.hash || "";

        console.log("Using fileHash:", fileHash);

        const nostrEvent = await recommendEvent(
    proposalId,
    comment,
    latest.version,
    fileHash
);

        console.log("Nostr event created:", nostrEvent.id);

        saveToNostr(nostrEvent);

        console.log("⛓ Submitting Fabric transaction...");

        await contract.submitTransaction(
            'recommendProposal',
            proposalId,
            comment,
            nostrEvent.id
        );

        console.log("Fabric transaction SUCCESS");

        await gateway.disconnect();

        res.send('Recommended');

    } catch (err) {
        console.error("RECOMMEND ERROR:", err);
        res.status(500).send(err.message);
    }
});

//APPROVE

app.post('/proposal/approve', async (req, res) => {
    try {
        const { proposalId, comment } = req.body;

        const { contract, gateway } = await getContract('hod');

        const integrity = await verifyIntegrity(contract, proposalId);
        if (integrity.status !== "OK") {
            await gateway.disconnect();
            return res.status(400).json({ error: "Integrity violation", details: integrity });
        }

        const latest = JSON.parse(
            (await contract.evaluateTransaction('getLatestState', proposalId)).toString()
        );

        const fileHash = latest.fileHash || latest.hash || "";

        const nostrEvent = await approveEvent(
            proposalId,
            comment,
            latest.version,
            fileHash
        );

        console.log("Approve event:", nostrEvent?.id);

        if (!nostrEvent || !nostrEvent.id) {
            throw new Error("approveEvent undefined");
        }

        saveToNostr(nostrEvent);

        await contract.submitTransaction(
            'approveProposal',
            proposalId,
            comment,
            nostrEvent.id
        );

        await gateway.disconnect();

        res.send('Approved');

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// SEND BACK

app.post('/proposal/sendBackOfficer', async (req, res) => {
    try {
        const { proposalId, comment } = req.body;

        const { contract, gateway } = await getContract('hod');

        const integrity = await verifyIntegrity(contract, proposalId);
        if (integrity.status !== "OK") {
            await gateway.disconnect();
            return res.status(400).json({ error: "Integrity violation", details: integrity });
        }

        const latest = JSON.parse(
            (await contract.evaluateTransaction('getLatestState', proposalId)).toString()
        );

        const fileHash = latest.fileHash || latest.hash || "";
        const nostrEvent = await sendBackToOfficerEvent(
            proposalId,
            comment,
            latest.version,
            fileHash
        );

        console.log("SendBack event:", nostrEvent?.id);

        if (!nostrEvent || !nostrEvent.id) {
            throw new Error("sendBackEvent undefined");
        }

        saveToNostr(nostrEvent);

        await contract.submitTransaction(
            'sendBackToOfficer',
            proposalId,
            comment,
            nostrEvent.id
        );

        await gateway.disconnect();

        res.send('Sent back to officer');

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

//GET ALL TRANSACTIONS

app.get('/proposals', async (req, res) => {
    try {
        const { contract, gateway } = await getContract('clerk');

        const result = await contract.evaluateTransaction('queryAllProposals');
        const proposals = JSON.parse(result.toString());

        let allTx = [];

        for (const p of proposals) {
            const histResult = await contract.evaluateTransaction(
                'getProposalHistory',
                p.proposalId
            );

            const history = JSON.parse(histResult.toString());
            allTx = allTx.concat(history);
        }

        await gateway.disconnect();

        allTx.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        res.json(allTx);

    } catch (err) {
        console.error("Error in /proposals:", err);
        res.status(500).send(err.message);
    }
});

// GET CSV FILE
app.get('/proposal/file/:filename', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'uploads', req.params.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const csvData = fs.readFileSync(filePath, 'utf8');
        res.json({ csvData });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to read file' });
    }
});

// ADMIN FABRIC
app.get('/admin/fabric', async (req, res) => {
    try {
        const { contract, gateway } = await getContract('clerk');

        const result = await contract.evaluateTransaction('queryAllProposals');
        const states = JSON.parse(result.toString());

        if (!Array.isArray(states) || states.length === 0) {
            await gateway.disconnect();
            return res.json([]);
        }

        let allTx = [];

        for (const s of states) {
            if (!s.proposalId) continue;

            try {
                const hist = await contract.evaluateTransaction(
                    'getProposalHistory',
                    s.proposalId
                );

                const parsed = JSON.parse(hist.toString());

                if (Array.isArray(parsed)) {
                    allTx = allTx.concat(parsed);
                }

            } catch (innerErr) {
                console.error("History fetch error:", innerErr);
            }
        }

        await gateway.disconnect();

        allTx.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(allTx);

    } catch (err) {
        console.error("Admin Fabric error:", err);
        res.status(500).send(err.message);
    }
});

//ADMIN NOSTR
app.get('/admin/nostr', (req, res) => {
    try {
        if (!fs.existsSync(NOSTR_FILE)) {
            return res.json([]);
        }

        const raw = fs.readFileSync(NOSTR_FILE, 'utf8');

        if (!raw || raw.trim() === '') {
            return res.json([]);
        }

        const parsed = JSON.parse(raw);

        res.json(Array.isArray(parsed) ? parsed : []);

    } catch (err) {
        console.error("Nostr read error:", err);
        res.status(500).send(err.message);
    }
});

//HISTORY

app.get('/proposal/history/:id', async (req, res) => {
    try {
        const { contract, gateway } = await getContract('clerk');

        const result = await contract.evaluateTransaction(
            'getProposalHistory',
            req.params.id
        );

        await gateway.disconnect();

        res.json(JSON.parse(result.toString()));

    } catch (err) {
        console.error("History error:", err);
        res.status(500).send(err.message);
    }
});

//VERIFY ENDPOINT

app.get('/proposal/verify/:id', async (req, res) => {
    try {
        const { contract, gateway } = await getContract('clerk');

        const result = await verifyIntegrity(contract, req.params.id);

        await gateway.disconnect();

        res.json(result);

    } catch (err) {
        console.error("Verification error:", err);
        res.status(500).send(err.message);
    }
});


app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
