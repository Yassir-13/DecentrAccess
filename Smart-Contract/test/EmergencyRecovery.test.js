const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EmergencyRecovery", function () {
    let didRegistry, accessControl, emergencyRecovery;
    let deployer, guardian1, guardian2, guardian3, targetAdmin, newAdmin;

    beforeEach(async function () {
        [deployer, guardian1, guardian2, guardian3, targetAdmin, newAdmin] = await ethers.getSigners();

        // DIDRegistry
        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        await didRegistry.connect(guardian1).registerDID("did:da:g1", 0, pubKeyHash, "{}");
        await didRegistry.connect(guardian2).registerDID("did:da:g2", 0, pubKeyHash, "{}");
        await didRegistry.connect(guardian3).registerDID("did:da:g3", 0, pubKeyHash, "{}");
        await didRegistry.connect(targetAdmin).registerDID("did:da:target", 0, pubKeyHash, "{}");
        await didRegistry.connect(newAdmin).registerDID("did:da:new", 0, pubKeyHash, "{}");

        // AccessControl
        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();

        // EmergencyRecovery
        const EmergencyRecovery = await ethers.getContractFactory("EmergencyRecovery");
        emergencyRecovery = await EmergencyRecovery.deploy(
            await didRegistry.getAddress(),
            await accessControl.getAddress()
        );
        await emergencyRecovery.waitForDeployment();

        // Ajouter 3 guardians
        await emergencyRecovery.addGuardian(guardian1.address);
        await emergencyRecovery.addGuardian(guardian2.address);
        await emergencyRecovery.addGuardian(guardian3.address);
    });

    // Helper to extract requestId
    async function getRequestId(tx) {
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
            try { return emergencyRecovery.interface.parseLog(log)?.name === "RecoveryInitiated"; }
            catch { return false; }
        });
        return emergencyRecovery.interface.parseLog(event).args.requestId;
    }

    describe("Guardian Management", function () {
        it("devrait ajouter un guardian", async function () {
            expect(await emergencyRecovery.isGuardian(guardian1.address)).to.be.true;
            expect(await emergencyRecovery.getGuardianCount()).to.equal(3);
        });

        it("devrait retirer un guardian", async function () {
            await emergencyRecovery.removeGuardian(guardian3.address);
            expect(await emergencyRecovery.isGuardian(guardian3.address)).to.be.false;
            expect(await emergencyRecovery.getGuardianCount()).to.equal(2);
        });

        it("non-SUPER_ADMIN ne devrait pas pouvoir ajouter", async function () {
            await expect(
                emergencyRecovery.connect(guardian1).addGuardian(targetAdmin.address)
            ).to.be.revertedWith("EmergencyRecovery: only SUPER_ADMIN");
        });

        it("devrait rejeter un DID inactif", async function () {
            await didRegistry.connect(targetAdmin).deactivateDID(targetAdmin.address);
            await expect(
                emergencyRecovery.addGuardian(targetAdmin.address)
            ).to.be.revertedWith("EmergencyRecovery: DID not active");
        });
    });

    describe("initiateRecovery", function () {
        it("devrait initier une récupération REVOKE_ADMIN", async function () {
            const tx = await emergencyRecovery.connect(guardian1).initiateRecovery(
                1, // REVOKE_ADMIN
                targetAdmin.address,
                ethers.ZeroAddress
            );
            const requestId = await getRequestId(tx);

            const request = await emergencyRecovery.getRecoveryRequest(requestId);
            expect(request.recoveryType).to.equal(1);
            expect(request.targetAccount).to.equal(targetAdmin.address);
            expect(request.initiator).to.equal(guardian1.address);
        });

        it("devrait initier une récupération REPLACE_ADMIN", async function () {
            const tx = await emergencyRecovery.connect(guardian1).initiateRecovery(
                0, // REPLACE_ADMIN
                targetAdmin.address,
                newAdmin.address
            );
            const requestId = await getRequestId(tx);

            const request = await emergencyRecovery.getRecoveryRequest(requestId);
            expect(request.newAccount).to.equal(newAdmin.address);
        });

        it("REPLACE_ADMIN devrait exiger newAccount", async function () {
            await expect(
                emergencyRecovery.connect(guardian1).initiateRecovery(
                    0, targetAdmin.address, ethers.ZeroAddress
                )
            ).to.be.revertedWith("EmergencyRecovery: newAccount required");
        });

        it("non-guardian ne devrait pas pouvoir initier", async function () {
            await expect(
                emergencyRecovery.connect(targetAdmin).initiateRecovery(
                    1, targetAdmin.address, ethers.ZeroAddress
                )
            ).to.be.revertedWith("EmergencyRecovery: not guardian");
        });
    });

    describe("Flux complet: initiate → approve → execute", function () {
        let requestId;

        beforeEach(async function () {
            const tx = await emergencyRecovery.connect(guardian1).initiateRecovery(
                1, targetAdmin.address, ethers.ZeroAddress
            );
            requestId = await getRequestId(tx);
        });

        it("devrait approuver", async function () {
            await expect(emergencyRecovery.connect(guardian2).approveRecovery(requestId))
                .to.emit(emergencyRecovery, "RecoveryApproved");

            const approvers = await emergencyRecovery.getApprovers(requestId);
            expect(approvers.length).to.equal(2);
        });

        it("devrait rejeter double approbation", async function () {
            await expect(
                emergencyRecovery.connect(guardian1).approveRecovery(requestId)
            ).to.be.revertedWith("EmergencyRecovery: already approved");
        });

        it("devrait exécuter après 3 sigs + 48h", async function () {
            await emergencyRecovery.connect(guardian2).approveRecovery(requestId);
            await emergencyRecovery.connect(guardian3).approveRecovery(requestId);

            // Pas encore (délai)
            await expect(
                emergencyRecovery.connect(guardian1).executeRecovery(requestId)
            ).to.be.revertedWith("EmergencyRecovery: delay not elapsed");

            // Attendre 48h
            await time.increase(48 * 3600 + 1);

            await expect(emergencyRecovery.connect(guardian1).executeRecovery(requestId))
                .to.emit(emergencyRecovery, "RecoveryExecuted");

            const request = await emergencyRecovery.getRecoveryRequest(requestId);
            expect(request.executed).to.be.true;
        });

        it("devrait rejeter exécution sans assez de sigs", async function () {
            await emergencyRecovery.connect(guardian2).approveRecovery(requestId);
            // Seulement 2/3
            await time.increase(48 * 3600 + 1);

            await expect(
                emergencyRecovery.connect(guardian1).executeRecovery(requestId)
            ).to.be.revertedWith("EmergencyRecovery: not enough approvals");
        });

        it("seul un approver peut exécuter", async function () {
            await emergencyRecovery.connect(guardian2).approveRecovery(requestId);
            await emergencyRecovery.connect(guardian3).approveRecovery(requestId);
            await time.increase(48 * 3600 + 1);

            await expect(
                emergencyRecovery.connect(targetAdmin).executeRecovery(requestId)
            ).to.be.revertedWith("EmergencyRecovery: only approvers can execute");
        });

        // B9 Fix: expiry
        it("devrait rejeter si la request a expiré (B9)", async function () {
            await emergencyRecovery.connect(guardian2).approveRecovery(requestId);
            await emergencyRecovery.connect(guardian3).approveRecovery(requestId);

            // Attendre 7 jours + 1 seconde
            await time.increase(7 * 24 * 3600 + 1);

            await expect(
                emergencyRecovery.connect(guardian1).executeRecovery(requestId)
            ).to.be.revertedWith("EmergencyRecovery: expired");
        });

        it("devrait rejeter approbation après expiry (B9)", async function () {
            await time.increase(7 * 24 * 3600 + 1);

            await expect(
                emergencyRecovery.connect(guardian2).approveRecovery(requestId)
            ).to.be.revertedWith("EmergencyRecovery: expired");
        });
    });

    describe("cancelRecovery", function () {
        it("l'initiateur devrait pouvoir annuler", async function () {
            const tx = await emergencyRecovery.connect(guardian1).initiateRecovery(
                1, targetAdmin.address, ethers.ZeroAddress
            );
            const requestId = await getRequestId(tx);

            await expect(emergencyRecovery.connect(guardian1).cancelRecovery(requestId))
                .to.emit(emergencyRecovery, "RecoveryCancelled");
        });

        it("SUPER_ADMIN devrait pouvoir annuler", async function () {
            const tx = await emergencyRecovery.connect(guardian1).initiateRecovery(
                1, targetAdmin.address, ethers.ZeroAddress
            );
            const requestId = await getRequestId(tx);

            await emergencyRecovery.cancelRecovery(requestId);
            const request = await emergencyRecovery.getRecoveryRequest(requestId);
            expect(request.cancelled).to.be.true;
        });
    });

    describe("isRecoveryReady", function () {
        it("devrait retourner true quand prêt", async function () {
            const tx = await emergencyRecovery.connect(guardian1).initiateRecovery(
                1, targetAdmin.address, ethers.ZeroAddress
            );
            const requestId = await getRequestId(tx);

            await emergencyRecovery.connect(guardian2).approveRecovery(requestId);
            await emergencyRecovery.connect(guardian3).approveRecovery(requestId);

            expect(await emergencyRecovery.isRecoveryReady(requestId)).to.be.false; // délai
            await time.increase(48 * 3600 + 1);
            expect(await emergencyRecovery.isRecoveryReady(requestId)).to.be.true;
        });

        it("devrait retourner false après expiry", async function () {
            const tx = await emergencyRecovery.connect(guardian1).initiateRecovery(
                1, targetAdmin.address, ethers.ZeroAddress
            );
            const requestId = await getRequestId(tx);

            await emergencyRecovery.connect(guardian2).approveRecovery(requestId);
            await emergencyRecovery.connect(guardian3).approveRecovery(requestId);

            await time.increase(7 * 24 * 3600 + 1); // expired
            expect(await emergencyRecovery.isRecoveryReady(requestId)).to.be.false;
        });
    });
});
