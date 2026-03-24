const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationScore", function () {
    let didRegistry, accessControl, reputationScore;
    let deployer, admin1, agent1, target;

    beforeEach(async function () {
        [deployer, admin1, agent1, target] = await ethers.getSigners();

        // DIDRegistry
        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        await didRegistry.connect(admin1).registerDID("did:da:admin1", 0, pubKeyHash, "{}");
        await didRegistry.connect(agent1).registerDID("did:da:agent1", 1, pubKeyHash, "{}");
        await didRegistry.connect(target).registerDID("did:da:target", 0, pubKeyHash, "{}");

        // AccessControl
        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();

        // ReputationScore
        const ReputationScore = await ethers.getContractFactory("ReputationScore");
        reputationScore = await ReputationScore.deploy(
            await didRegistry.getAddress(),
            await accessControl.getAddress()
        );
        await reputationScore.waitForDeployment();

        // B4 Fix: autoriser deployer (SUPER_ADMIN) et agent1 comme callers
        await reputationScore.setAuthorizedCaller(deployer.address, true);
        await reputationScore.setAuthorizedCaller(agent1.address, true);
    });

    describe("recordActionSuccess", function () {
        it("devrait incrémenter le score de +1", async function () {
            await reputationScore.recordActionSuccess(target.address);
            
            const rep = await reputationScore.getReputation(target.address);
            expect(rep.score).to.equal(1);
            expect(rep.actionsPerformed).to.equal(1);
        });

        it("devrait émettre ScoreUpdated", async function () {
            await expect(reputationScore.recordActionSuccess(target.address))
                .to.emit(reputationScore, "ScoreUpdated");
        });

        // B4 Fix: test access control
        it("devrait rejeter un caller non autorisé", async function () {
            await expect(
                reputationScore.connect(admin1).recordActionSuccess(target.address)
            ).to.be.revertedWith("ReputationScore: not authorized");
        });
    });

    describe("recordActionRejected", function () {
        it("devrait décrémenter le score de -2", async function () {
            await reputationScore.recordActionRejected(target.address);
            
            expect(await reputationScore.getScore(target.address)).to.equal(-2);
        });
    });

    describe("recordAlertCaused", function () {
        it("devrait décrémenter le score de -5", async function () {
            await reputationScore.recordAlertCaused(target.address);
            
            expect(await reputationScore.getScore(target.address)).to.equal(-5);
        });
    });

    describe("recordMultiSigApproval", function () {
        it("devrait incrémenter le score de +1", async function () {
            await reputationScore.recordMultiSigApproval(target.address);
            
            const rep = await reputationScore.getReputation(target.address);
            expect(rep.score).to.equal(1);
            expect(rep.multiSigApprovals).to.equal(1);
        });
    });

    describe("Auto-flagging", function () {
        it("devrait flagger automatiquement à score <= -10", async function () {
            // -5 * 2 = -10
            await reputationScore.recordAlertCaused(target.address);
            await reputationScore.recordAlertCaused(target.address);

            expect(await reputationScore.isFlagged(target.address)).to.be.true;
            
            const flagged = await reputationScore.getFlaggedAccounts();
            expect(flagged).to.include(target.address);
        });

        it("devrait émettre AccountFlagged", async function () {
            await reputationScore.recordAlertCaused(target.address); // -5
            await expect(reputationScore.recordAlertCaused(target.address)) // -10
                .to.emit(reputationScore, "AccountFlagged");
        });

        it("ne devrait pas re-flagger un compte déjà flaggé", async function () {
            await reputationScore.recordAlertCaused(target.address);
            await reputationScore.recordAlertCaused(target.address); // flagged

            // Un 3ème alert ne devrait pas ajouter un doublon dans _flaggedAccounts
            await reputationScore.recordAlertCaused(target.address);
            
            const flagged = await reputationScore.getFlaggedAccounts();
            // On s'assure qu'il n'y a qu'une seule entrée
            let count = 0;
            for (const addr of flagged) {
                if (addr === target.address) count++;
            }
            expect(count).to.equal(1);
        });
    });

    describe("unflagAccount", function () {
        beforeEach(async function () {
            await reputationScore.recordAlertCaused(target.address);
            await reputationScore.recordAlertCaused(target.address); // flagged
        });

        it("SUPER_ADMIN devrait pouvoir unflag", async function () {
            await reputationScore.unflagAccount(target.address);
            
            expect(await reputationScore.isFlagged(target.address)).to.be.false;
            const flagged = await reputationScore.getFlaggedAccounts();
            expect(flagged).to.not.include(target.address);
        });

        it("non-SUPER_ADMIN ne devrait pas pouvoir unflag", async function () {
            await expect(
                reputationScore.connect(admin1).unflagAccount(target.address)
            ).to.be.revertedWith("ReputationScore: only SUPER_ADMIN");
        });
    });

    describe("resetScore", function () {
        it("devrait remettre à zéro", async function () {
            await reputationScore.recordActionSuccess(target.address);
            await reputationScore.recordActionSuccess(target.address);
            await reputationScore.recordActionRejected(target.address);

            await reputationScore.resetScore(target.address);

            const rep = await reputationScore.getReputation(target.address);
            expect(rep.score).to.equal(0);
            expect(rep.actionsPerformed).to.equal(0);
            expect(rep.actionsRejected).to.equal(0);
        });
    });

    describe("setAuthorizedCaller (B4)", function () {
        it("devrait autoriser un nouveau caller", async function () {
            await reputationScore.setAuthorizedCaller(admin1.address, true);
            
            // admin1 peut maintenant appeler
            await reputationScore.connect(admin1).recordActionSuccess(target.address);
            expect(await reputationScore.getScore(target.address)).to.equal(1);
        });

        it("devrait révoquer un caller", async function () {
            await reputationScore.setAuthorizedCaller(agent1.address, false);
            
            await expect(
                reputationScore.connect(agent1).recordActionSuccess(target.address)
            ).to.be.revertedWith("ReputationScore: not authorized");
        });

        it("non-SUPER_ADMIN ne devrait pas pouvoir setAuthorizedCaller", async function () {
            await expect(
                reputationScore.connect(admin1).setAuthorizedCaller(admin1.address, true)
            ).to.be.revertedWith("ReputationScore: only SUPER_ADMIN");
        });
    });
});
