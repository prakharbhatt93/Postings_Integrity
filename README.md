# Improving-Integrity-of-Postings-Proposal
The project aims to develop a Proof of Concept for a document approval system of postings of individuals using Hyperledger Fabric Private Blockchain

# Abstract
This project implements a secure proposal approval workflow system using:

* Hyperledger Fabric (private permissioned blockchain)
* Nostr-inspired cryptographically signed audit events
* Node.js backend server
* CSV-based proposal workflow
* Multi-role approval architecture
* Tamper detection and integrity verification

---

# Prerequisites

The following software must be installed on the Ubuntu VM before running the project. You can use VMWare to setup a an Ubuntu VM for running the project.

---

# 1. Update Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
```

---

# 2. Install Git

```bash
sudo apt install git -y
```

Verify installation:

```bash
git --version
```

---

# 3. Install Curl

```bash
sudo apt install curl -y
```

---

# 4. Install Docker

Remove old versions:

```bash
sudo apt remove docker docker-engine docker.io containerd runc
```

Install dependencies:

```bash
sudo apt install apt-transport-https ca-certificates curl software-properties-common -y
```

Add Docker GPG key:

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
```

Add Docker repository:

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker:

```bash
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io -y
```

Verify Docker:

```bash
docker --version
```

---

# 5. Install Docker Compose Plugin

```bash
sudo apt install docker-compose-plugin -y
```

Verify installation:

```bash
docker compose --version
```

---

# 6. Add User to Docker Group

```bash
sudo usermod -aG docker $USER
```

Then logout and login again.

Verify:

```bash
docker ps
```

---

# 7. Install Node.js

Install Node Version Manager:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
```

Reload shell:

```bash
source ~/.bashrc
```

Install Node.js:

```bash
nvm install 18
```

Verify:

```bash
node -v
npm -v
```

---

# 8. Install Hyperledger Fabric Prerequisites

Install required tools:

```bash
sudo apt install jq unzip -y
```
---

# Clone This Repository

Move into fabric-samples application directory:

```bash
cd Downloads
```

Clone the repository: 

```bash
git clone https://github.com/prakharbhatt93/Postings_Integrity.git
```

Move into project:

```bash
cd Proposal_Integrity
```

---

# Make files executable

```bash
find . -type f \( -name "*.sh" -o -path "*/bin/*" \) -exec chmod +x {} \;
```

# Initialize Fabric:

```bash
./init-fabric.sh
```
The command creates a test network with two organizations having two peers and uploads the chaincode(smart contract) on both peers. It also creates docker containers for peers and CA for each Organization


```bash
cd ~/fabric-samples/application/proposal-api/enrollment
```
Make sure the /fabric-samples/application/proposal-api/fabric/wallet folder is empty. If not, delete the identity certificates and then create new identities using below steps:-
Run enrollment scripst to enroll users for initiating transactions:

```bash
node enrollAdminOrg1.js
node registerClerkUser.js
node enrollAdminOrg2.js
node registerOfficerUser.js
node registerHODUser.js
cd ..
```

---

# Start the server



```bash
node server.js
```

Open the Browser and goto http://localhost:3000
The web portal opens showing 4 links. The portal for Clerk is used for creating a new proposal while the portals of Clerk and HoD are used for Recommending or Approving the proposals.
The Admin portal is used for seeing the transaction data store on off-chain storage and on-chain storage as well.


Available pages:

* Clerk Portal
* Officer Portal
* HoD Portal
* Admin Dashboard

---

# Workflow Usage

## Clerk

* Upload proposal CSV
* Create proposal
* Revise proposal
* Edit proposal data

## Officer

* Review proposal
* Recommend proposal
* Send proposal back for review

## HoD

* Approve proposal
* Send proposal back to Officer

## Admin Dashboard

* View blockchain history
* View Nostr audit events

---


# File Structure

```text
proposal-api/
├── fabric/
│   ├── gateway.js
│   └── wallet/
├── nostr/
│   └── nostrService.js
├── uploads/
├── ui/
├── server.js
├── nostr.json
├── package.json
└── README.md
```

---

# Common Commands

## Stop Fabric Network

```bash
cd ~/fabric-projects/fabric-samples/test-network
./network.sh down
```

## Restart Server

```bash
node server.js
```

## Remove Old Containers

```bash
docker rm -f $(docker ps -aq)
```

## Remove Old Images

```bash
docker system prune -a
```

---

# Troubleshooting

## Docker Permission Denied

Run:

```bash
sudo usermod -aG docker $USER
```

Then logout/login.

---

## Port Already in Use

Kill existing Node server:

```bash
pkill node
```

---

## Fabric Containers Not Starting

Check:

```bash
docker ps -a
```

Restart Docker:

```bash
sudo systemctl restart docker
```

---


# License

MIT License

---

# Author

Prakhar Bhatt


