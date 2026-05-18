//BASE URL
const API = 'http://localhost:3000';

// GLOBAL STATE

let currentCSVData = [];
let currentProposalId = "";
let currentType = "";
let isEditing = false;


// Load proposal data when user opens their portal

async function loadProposals() {
    const list = document.getElementById('proposalList');
    list.innerHTML = 'Loading...';
    try {
        const res = await fetch(`${API}/proposals`);
        if (!res.ok) throw new Error("API failed");

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Invalid data");

        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = "<p>No proposals found</p>";
            return;
        }

        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const map = {};
        data.forEach(p => {
            if (!p.proposalId) return;

            if (!map[p.proposalId] ||
                new Date(p.timestamp) >= new Date(map[p.proposalId].timestamp)) {
                map[p.proposalId] = p;
            }
        });

        const latestProposals = Object.values(map);

        latestProposals.forEach(p => {
            list.innerHTML += `
                <div class="card">
                    <b>${p.proposalId}</b> - ${p.type || 'UNKNOWN'}
                    <button onclick="openProposal('${p.proposalId}')">View</button>
                </div>
            `;
        });

    } catch (err) {
        console.error("Load proposals error:", err);
        list.innerHTML = "<p>Error loading proposals</p>";
    }
}

async function loadClerkProposals() {
    loadProposals();
}

// Open a already created proposal when user clicks to view a proposal
async function openProposal(proposalId) {

    currentProposalId = proposalId;
    document.getElementById('proposalView').style.display = 'block';

    try {
        const res = await fetch(`${API}/proposal/history/${proposalId}`);
        const history = await res.json();

        if (!history || history.length === 0) {
            document.getElementById('csvTable').innerHTML = "No data";
            return;
        }

        history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const latest = history[history.length - 1];
        currentType = latest.type || "";

        setupWorkflow(currentType);

        let filePath = latest.filePath;

        if (!filePath) {
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].filePath) {
                    filePath = history[i].filePath;
                    break;
                }
            }
        }

        if (!filePath) {
            document.getElementById('csvTable').innerHTML = "No CSV available";
            return;
        }

        const filename = filePath.split('/').pop();

        const fileRes = await fetch(`${API}/proposal/file/${filename}`);

        if (!fileRes.ok) {
            throw new Error("File API failed");
        }

        const fileData = await fileRes.json();

        renderCSV(fileData.csvData, false);

    } catch (err) {
        console.error("CSV LOAD ERROR:", err);
        document.getElementById('csvTable').innerHTML = "Error loading CSV";
    }
    loadHistory(proposalId); //loads the history of actions performed so far with timestamp
}

//activate UI elements based on the stage in which the proposal is currently
function setupWorkflow(type) {

    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const revisionSection = document.getElementById('revisionSection');

    const recommendBtn = document.getElementById('recommendBtn');
    const reviewBtn = document.getElementById('reviewBtn');

    const approveBtn = document.getElementById('approveBtn');
    const sendBackBtn = document.getElementById('sendBackBtn');

    [editBtn, saveBtn, revisionSection,
     recommendBtn, reviewBtn,
     approveBtn, sendBackBtn]
    .forEach(el => { if (el) el.style.display = "none"; });

    if (type === "REVIEW_REQUEST") {
        if (editBtn) editBtn.style.display = "inline-block";
        if (revisionSection) revisionSection.style.display = "block";
    }

    if (type === "CREATE" || type === "REVISION") {
        if (recommendBtn) recommendBtn.style.display = "inline-block";
        if (reviewBtn) reviewBtn.style.display = "inline-block";
    }

    if (type === "RECOMMEND") {
        if (approveBtn) approveBtn.style.display = "inline-block";
        if (sendBackBtn) sendBackBtn.style.display = "inline-block";
    }
}

// Upload a new CSV version by Clerk
async function uploadNewVersion() {

    if (!currentProposalId) {
        alert("No proposal selected");
        return;
    }
    const fileInputEl = document.getElementById('revisionCsv');
    const descEl = document.getElementById('revisionDescription');
    const fileInput = fileInputEl?.files[0];
    const description = descEl?.value || "";
    if (!fileInput) {
        alert("Please select a CSV file");
        return;
    }
    const formData = new FormData();
    formData.append('proposalId', currentProposalId);
    formData.append('description', description || "New version uploaded");
    formData.append('file', fileInput);

    try {
        const res = await fetch(`${API}/proposal/revise`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error("Upload failed");

        alert("New version uploaded");

        loadProposals();
        openProposal(currentProposalId);

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        alert("Upload failed");
    }
}
//Recommend a proposal by Officer

async function recommendProposal() {
    if (!currentProposalId) return alert("Select proposal first");

    const comment = document.getElementById('comment')?.value || "";

    const res = await fetch(`${API}/proposal/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: currentProposalId, comment })
    });

    if (!res.ok) {
        let msg = "Integrity Check Failed, Possible data manipulation detected";

        try {
            const err = await res.json();
            console.error("Recommend error:", err);

            if (err.details?.issues?.length) {
                msg += "\n\n" + err.details.issues.join("\n");
            }
        } catch {}

        alert(msg);
        return;
    }

    alert("Recommended");
    loadProposals();
}

//Send back proposal for review by officer to clerk
async function sendForReview() {
    if (!currentProposalId) return alert("Select proposal first");

    const comment = document.getElementById('comment')?.value || "";

    const res = await fetch(`${API}/proposal/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: currentProposalId, comment })
    });

    if (!res.ok) {
        let msg = "Integrity Check Failed, Possible data manipulation detected";

        try {
            const err = await res.json();
            console.error("Review error:", err);

            if (err.details?.issues?.length) {
                msg += "\n\n" + err.details.issues.join("\n");
            }
        } catch {}

        alert(msg);
        return;
    }

    alert("Sent back to Clerk");
    loadProposals();
}

//Approve a recommended proposal by HOD

async function approveProposal() {
    if (!currentProposalId) return alert("Select proposal first");

    const comment = document.getElementById('comment')?.value || "";

    const res = await fetch(`${API}/proposal/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: currentProposalId, comment })
    });

    if (!res.ok) {
        let msg = "Integrity Check Failed, Possible data manipulation detected";

        try {
            const err = await res.json();
            console.error("Approve error:", err);

            if (err.details?.issues?.length) {
                msg += "\n\n" + err.details.issues.join("\n");
            }
        } catch {}

        alert(msg);
        return;
    }

    alert("Approved");
    loadProposals();
}

//send back proposal to officer
async function sendBackToOfficer() {
    if (!currentProposalId) return alert("Select proposal first");

    const comment = document.getElementById('comment')?.value || "";

    const res = await fetch(`${API}/proposal/sendBackOfficer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: currentProposalId, comment })
    });

    if (!res.ok) {
        let msg = "Integrity Check Failed, Possible data manipulation detected";

        try {
            const err = await res.json();
            console.error("SendBack error:", err);

            if (err.details?.issues?.length) {
                msg += "\n\n" + err.details.issues.join("\n");
            }
        } catch {}

        alert(msg);
        return;
    }

    alert("Sent back to Officer");
    loadProposals();
}

// enable editing of the CSV Data using the UI itself
function enableEdit() {
    isEditing = true;
    renderCSV(Papa.unparse(currentCSVData), true);

    document.getElementById('editBtn').style.display = "none";
    document.getElementById('saveBtn').style.display = "inline-block";
}

// helper function to save the editd CSV edited using UI as a new transaction
async function saveEditedCSV() {

    const csv = Papa.unparse(currentCSVData);

    const blob = new Blob([csv], { type: 'text/csv' });
    const file = new File([blob], "edited.csv");

    const formData = new FormData();
    formData.append('proposalId', currentProposalId);
    formData.append('description', "Edited by Clerk");
    formData.append('file', file);

    const res = await fetch(`${API}/proposal/revise`, {
    method: 'POST',
    body: formData
});

if (!res.ok) {
    alert("Integrity Check Failed, Possible data manipulation detected");
    return;
}
}
// Helper function to render scv
function renderCSV(csvText, editable = false) {

    if (!csvText || csvText.trim() === '') {
        document.getElementById('csvTable').innerHTML = "No CSV data found";
        return;
    }
    const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true
    });
    const data = parsed.data;
    currentCSVData = data;

    let html = '<div class="csv-container"><table class="csv-table"><thead><tr>';

    Object.keys(data[0]).forEach(key => {
        html += `<th>${key}</th>`;
    });

    html += '</tr></thead><tbody>';

    data.forEach((row, rowIndex) => {
        html += '<tr>';

        Object.keys(row).forEach(col => {
            html += editable
                ? `<td><input value="${row[col] || ''}" onchange="updateCell(${rowIndex}, '${col}', this.value)"></td>`
                : `<td>${row[col]}</td>`;
        });

        html += '</tr>';
    });

    html += '</tbody></table></div>';

    document.getElementById('csvTable').innerHTML = html;
}

// Update Data Cell in CSV when Celrk makes a revised proposal
function updateCell(rowIndex, col, value) {
    currentCSVData[rowIndex][col] = value;
}

//create a proposal by Clerk
async function createProposal() {

    const fileInput = document.getElementById('csvFile').files[0];

    const formData = new FormData();
    formData.append('proposalId', document.getElementById('proposalId').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('file', fileInput);

    await fetch(`${API}/proposal/create`, {
        method: 'POST',
        body: formData
    });

    alert("Proposal Created");
    loadProposals();
}

//load History of the proposal showing what all actions have been performed on the proposal when a user click on it
async function loadHistory(proposalId) {

    const res = await fetch(`${API}/proposal/history/${proposalId}`);
    const data = await res.json();

    const div = document.getElementById('history');
    div.innerHTML = '';

    data.reverse().forEach(h => {

        let viewBtn = '';

        if (h.filePath) {
            const filename = h.filePath.split('/').pop();

            viewBtn = `
                <button onclick="viewVersion('${filename}')">
                    Version ${h.version || '-'}
                </button>
            `;
        }

        div.innerHTML += `
            <div class="card">
                <b>${h.type}</b><br/>
                Version: ${h.version || '-'}<br/>
                ${h.timestamp}
                ${viewBtn}
            </div>
        `;
    });
}

// render the current  version of the proposal which is changed in case of a proposal revision
async function viewVersion(filename) {

    const res = await fetch(`${API}/proposal/file/${filename}`);

    if (!res.ok) {
        alert("Failed to load version");
        return;
    }

    const data = await res.json();
    renderCSV(data.csvData, false);
}

//load the data from nostr.json and ledger for the admin to view 
async function loadAdminData() {

    const anchorsEl = document.getElementById('anchors');
    const eventsEl = document.getElementById('events');

    // Not on admin page
    if (!anchorsEl || !eventsEl) return;

    try {
        anchorsEl.textContent = "Loading Fabric...";
        eventsEl.textContent = "Loading Nostr...";

        const [fabricRes, nostrRes] = await Promise.all([
            fetch(`${API}/admin/fabric`),
            fetch(`${API}/admin/nostr`)
        ]);

        if (!fabricRes.ok) throw new Error("Fabric API failed");
        if (!nostrRes.ok) throw new Error("Nostr API failed");

        const fabric = await fabricRes.json();
        const nostr = await nostrRes.json();

        console.log("ADMIN FABRIC:", fabric);
        console.log("ADMIN NOSTR:", nostr);

        anchorsEl.textContent = JSON.stringify(fabric, null, 2);
        eventsEl.textContent = JSON.stringify(nostr, null, 2);

    } catch (err) {
        console.error("Admin load error:", err);

        anchorsEl.textContent = "Error loading Fabric data";
        eventsEl.textContent = "Error loading Nostr data";
    }
}

window.onload = () => { 
loadProposals(); // clerk page 
loadAdminData(); // admin page 
};
