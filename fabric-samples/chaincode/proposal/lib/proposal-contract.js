'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

class ProposalContract extends Contract {

    getRole(ctx) {
        return ctx.clientIdentity.getAttributeValue('role');
    }
    //check if role is present
    requireRole(ctx, expectedRole) {
        const role = this.getRole(ctx);
        if (role !== expectedRole) {
            throw new Error(`Access denied. Required role: ${expectedRole}`);
        }
    }
    //fetch the proposal history from ledger
    async getProposalHistory(ctx, proposalId) {
        const iterator = await ctx.stub.getHistoryForKey(`proposal_${proposalId}`);
        const results = [];

        while (true) {
            const res = await iterator.next();

            if (res.value && res.value.value.toString()) {
                results.push(JSON.parse(res.value.value.toString()));
            }

            if (res.done) {
                await iterator.close();
                break;
            }
        }

        return results;
    }
    //get the latest state of the ledger
    async getLatestState(ctx, proposalId) {
        const data = await ctx.stub.getState(`proposal_${proposalId}`);
        if (!data || data.length === 0) return null;
        return JSON.parse(data.toString());
    }
    //get the time stamp of the tx
    getTxTimestamp(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        return new Date(ts.seconds * 1000).toISOString();
    }
    //computes the ledger hash for storing in the transaction
    computeLedgerHash(data) {
        const clone = { ...data };
        delete clone.ledgerHash;

        return crypto
            .createHash('sha256')
            .update(JSON.stringify(clone))
            .digest('hex');
    }
    //used for creating a new proposal by the clerk
    async createProposal(ctx, proposalId, fileHash, nonce, description, filePath, nostrId) {

        this.requireRole(ctx, 'Clerk');

        const role = this.getRole(ctx);
        const existing = await this.getLatestState(ctx, proposalId);
        const version = existing ? existing.version + 1 : 1;

        let event = {
            type: 'CREATE',
            proposalId,
            role,
            version,
            fileHash,
            nonce,
            nostr_id: nostrId,
            description,
            filePath: filePath || "",
            timestamp: this.getTxTimestamp(ctx)
        };

        event.ledgerHash = this.computeLedgerHash(event);

        await ctx.stub.putState(`proposal_${proposalId}`, Buffer.from(JSON.stringify(event)));

        return JSON.stringify(event);
    }
    //used for creating a revised proposal by the clerk
    async submitRevision(ctx, proposalId, fileHash, nonce, description, filePath, nostrId, version) {

        const role = this.getRole(ctx);
        const latest = await this.getLatestState(ctx, proposalId);
        if (!latest) throw new Error('Proposal not found');

        let event = {
            type: 'REVISION',
            proposalId,
            role,
            version: parseInt(version),
            fileHash,
            nonce,
            nostr_id: nostrId,
            description,
            filePath: filePath || latest.filePath,
            timestamp: this.getTxTimestamp(ctx)
        };

        event.ledgerHash = this.computeLedgerHash(event);

        await ctx.stub.putState(`proposal_${proposalId}`, Buffer.from(JSON.stringify(event)));

        return JSON.stringify(event);
    }
    //send the proposal for review from the officer to the clerk
    async sendForReview(ctx, proposalId, comment, nostrId) {

        const role = this.getRole(ctx);
        const latest = await this.getLatestState(ctx, proposalId);
        if (!latest) throw new Error('Proposal not found');

        let event = {
            type: 'REVIEW_REQUEST',
            proposalId,
            role,
            version: latest.version,
            comment,
            fileHash: latest.fileHash,
            nonce: latest.nonce,
            nostr_id: nostrId,
            description: latest.description,
            filePath: latest.filePath,
            timestamp: this.getTxTimestamp(ctx)
        };

        event.ledgerHash = this.computeLedgerHash(event);

        await ctx.stub.putState(`proposal_${proposalId}`, Buffer.from(JSON.stringify(event)));

        return JSON.stringify(event);
    }

    //the proposal is recommended by the officer and sent to HoD
    async recommendProposal(ctx, proposalId, comment, nostrId) {

        this.requireRole(ctx, 'Officer');

        const role = this.getRole(ctx);
        const latest = await this.getLatestState(ctx, proposalId);
        if (!latest) throw new Error('Proposal not found');

        let event = {
            type: 'RECOMMEND',
            proposalId,
            role,
            version: latest.version,
            comment,
            fileHash: latest.fileHash,
            nonce: latest.nonce,
            nostr_id: nostrId, 
            description: latest.description,
            filePath: latest.filePath,
            timestamp: this.getTxTimestamp(ctx)
        };

        event.ledgerHash = this.computeLedgerHash(event);

        await ctx.stub.putState(`proposal_${proposalId}`, Buffer.from(JSON.stringify(event)));

        return JSON.stringify(event);
    }

    //the proposal is approved  by the HoD
    async approveProposal(ctx, proposalId, comment, nostrId) {

        this.requireRole(ctx, 'HOD');

        const role = this.getRole(ctx);
        const latest = await this.getLatestState(ctx, proposalId);
        if (!latest) throw new Error('Proposal not found');

        let event = {
            type: 'APPROVE',
            proposalId,
            role,
            version: latest.version,
            comment,
            fileHash: latest.fileHash,
            nonce: latest.nonce,
            nostr_id: nostrId,
            description: latest.description,
            filePath: latest.filePath,
            timestamp: this.getTxTimestamp(ctx)
        };

        event.ledgerHash = this.computeLedgerHash(event);

        await ctx.stub.putState(`proposal_${proposalId}`, Buffer.from(JSON.stringify(event)));

        return JSON.stringify(event);
    }

    //the proposal is sent back to the officer for review by the HoD
    async sendBackToOfficer(ctx, proposalId, comment, nostrId) {

        const role = this.getRole(ctx);
        const latest = await this.getLatestState(ctx, proposalId);
        if (!latest) throw new Error('Proposal not found');

        let event = {
            type: 'SEND_BACK_TO_OFFICER',
            proposalId,
            role,
            version: latest.version,
            comment,
            fileHash: latest.fileHash,
            nonce: latest.nonce,
            nostr_id: nostrId, 
            description: latest.description,
            filePath: latest.filePath,
            timestamp: this.getTxTimestamp(ctx)
        };

        event.ledgerHash = this.computeLedgerHash(event);

        await ctx.stub.putState(`proposal_${proposalId}`, Buffer.from(JSON.stringify(event)));

        return JSON.stringify(event);
    }
    
    //get all the proposals
    async queryAllProposals(ctx) {

        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];

        while (true) {
            const res = await iterator.next();

            if (res.value && res.value.value.toString()) {
                results.push(JSON.parse(res.value.value.toString()));
            }

            if (res.done) {
                await iterator.close();
                break;
            }
        }

        return JSON.stringify(results);
    }
}

module.exports = ProposalContract;
