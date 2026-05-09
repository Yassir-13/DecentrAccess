const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PolicyEngine", function () {
    let didRegistry, accessControl, policyEngine;
    let deployer, admin1, admin2, operator1;

    beforeEach(async function () {
        [deployer, admin1, admin2, operator1] = await ethers.getSigners();

        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        await didRegistry.connect(admin1).registerDID("did:da:admin1", 0, pubKeyHash, "{}");
        await didRegistry.connect(admin2).registerDID("did:da:admin2", 0, pubKeyHash, "{}");
        await didRegistry.connect(operator1).registerDID("did:da:op1", 0, pubKeyHash, "{}");

        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();

        const ADMIN = await accessControl.ADMIN();
        await accessControl.grantRole(admin1.address, ADMIN);
        await accessControl.grantRole(admin2.address, ADMIN);

        const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
        policyEngine = await PolicyEngine.deploy(
            await didRegistry.getAddress(),
            await accessControl.getAddress()
        );
        await policyEngine.waitForDeployment();

        // Lier PolicyEngine → AccessControl
        await accessControl.setPolicyEngine(await policyEngine.getAddress());
    });

    // Helper : extraire actionId depuis le receipt
    async function getActionId(tx) {
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
            try { return policyEngine.interface.parseLog(log)?.name === "ActionSubmitted"; }
            catch { return false; }
        });
        return policyEngine.interface.parseLog(event).args.actionId;
    }

    // Helper : fermer le bootstrap (3 admins créés)
    async function closeBootstrap() {
        const signers = await ethers.getSigners();
        const admin3 = signers[5];
        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.connect(admin3).registerDID("did:da:admin3", 0, pubKeyHash, "{}");
        const ADMIN = await accessControl.ADMIN();
        // admin1 et admin2 déjà créés dans beforeEach → juste admin3
        await accessControl.grantRole(admin3.address, ADMIN);
        // bootstrapMode = false maintenant
    }

    // ═══════════════════════════════════════════════════
    // Politiques par défaut
    // ═══════════════════════════════════════════════════
    describe("Politiques par défaut", function () {
        it("CREATE_USER ne devrait pas nécessiter de multi-sig", async function () {
            const policy = await policyEngine.getPolicy("CREATE_USER");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.false;
        });

        it("DELETE_USER devrait nécessiter 2 signatures", async function () {
            const policy = await policyEngine.getPolicy("DELETE_USER");
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(2);
        });

        it("DELETE_USER devrait avoir un expiryPeriod de 6h (R7)", async function () {
            const policy = await policyEngine.getPolicy("DELETE_USER");
            expect(policy.expiryPeriod).to.equal(6 * 3600);
        });

        it("REVOKE_ADMIN devrait avoir un expiryPeriod de 48h (R7)", async function () {
            const policy = await policyEngine.getPolicy("REVOKE_ADMIN");
            expect(policy.expiryPeriod).to.equal(48 * 3600);
        });
    });

    // ═══════════════════════════════════════════════════
    // B6 — Nouvelles politiques de rôles
    // ═══════════════════════════════════════════════════
    describe("Politiques de rôles (B6)", function () {
        it("GRANT_OPERATOR devrait exister et nécessiter 1 signature", async function () {
            const policy = await policyEngine.getPolicy("GRANT_OPERATOR");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(1);
        });

        it("GRANT_ADMIN devrait exister et nécessiter 2 signatures", async function () {
            const policy = await policyEngine.getPolicy("GRANT_ADMIN");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(2);
        });

        it("GRANT_AUDITOR devrait exister et nécessiter 1 signature", async function () {
            const policy = await policyEngine.getPolicy("GRANT_AUDITOR");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(1);
        });

        it("REVOKE_ROLE devrait exister et nécessiter 2 signatures", async function () {
            const policy = await policyEngine.getPolicy("REVOKE_ROLE");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(2);
        });

        it("ACTIVATE_USER devrait exister et nécessiter 1 signature", async function () {
            const policy = await policyEngine.getPolicy("ACTIVATE_USER");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(1);
        });

        it("DISABLE_USER devrait exister et nécessiter 1 signature", async function () {
            const policy = await policyEngine.getPolicy("DISABLE_USER");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(1);
        });

        it("ENABLE_USER devrait exister et nécessiter 1 signature", async function () {
            const policy = await policyEngine.getPolicy("ENABLE_USER");
            expect(policy.active).to.be.true;
            expect(policy.requiresMultiSig).to.be.true;
            expect(policy.requiredSignatures).to.equal(1);
        });
    });

    // ═══════════════════════════════════════════════════
    // R9 — getAllPolicyTypes (mis à jour : 14 policies)
    // ═══════════════════════════════════════════════════
    describe("getAllPolicyTypes (R9)", function () {
        it("devrait retourner tous les types de policies — 14 au total", async function () {
            const types = await policyEngine.getAllPolicyTypes();
            // Politiques originales
            expect(types).to.include("CREATE_USER");
            expect(types).to.include("DELETE_USER");
            expect(types).to.include("MODIFY_USER");
            expect(types).to.include("RESET_PASSWORD");
            expect(types).to.include("CREATE_GROUP");
            expect(types).to.include("REVOKE_ADMIN");
            expect(types).to.include("DEACTIVATE_DID");
            // Nouvelles politiques B6
            expect(types).to.include("GRANT_OPERATOR");
            expect(types).to.include("GRANT_ADMIN");
            expect(types).to.include("GRANT_AUDITOR");
            expect(types).to.include("REVOKE_ROLE");
            expect(types).to.include("ACTIVATE_USER");
            expect(types).to.include("DISABLE_USER");
            expect(types).to.include("ENABLE_USER");
            expect(types.length).to.equal(14);
        });
    });

    // ═══════════════════════════════════════════════════
    // evaluatePolicy
    // ═══════════════════════════════════════════════════
    describe("evaluatePolicy", function () {
        it("devrait autoriser un ADMIN à CREATE_USER", async function () {
            const [allowed, needsMultiSig] = await policyEngine.evaluatePolicy(admin1.address, "CREATE_USER");
            expect(allowed).to.be.true;
            expect(needsMultiSig).to.be.false;
        });
    });

    // ═══════════════════════════════════════════════════
    // Flux Multi-Sig complet (existant)
    // ═══════════════════════════════════════════════════
    describe("Flux Multi-Sig complet", function () {
        it("devrait soumettre → approuver → exécuter (R6: par approver)", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);
            await time.increase(3601);

            await expect(policyEngine.connect(admin1).executeAction(actionId))
                .to.emit(policyEngine, "ActionExecuted");
        });

        it("devrait rejeter executeAction par un non-approver (R6)", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);
            await time.increase(3601);

            await expect(
                policyEngine.executeAction(actionId)
            ).to.be.revertedWith("PolicyEngine: only approvers can execute");
        });

        it("devrait rejeter sans assez de signatures", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);
            await time.increase(3601);

            await expect(
                policyEngine.connect(admin1).executeAction(actionId)
            ).to.be.revertedWith("PolicyEngine: not enough signatures");
        });

        it("devrait rejeter une double approbation", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await expect(
                policyEngine.connect(admin1).approveAction(actionId)
            ).to.be.revertedWith("PolicyEngine: already approved");
        });

        it("devrait rejeter une action expirée", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);

            // Avancer le temps au-delà de l'expiry (6h)
            await time.increase(6 * 3600 + 1);

            await expect(
                policyEngine.connect(admin1).executeAction(actionId)
            ).to.be.revertedWith("PolicyEngine: expired");
        });

        it("ne devrait pas pouvoir approuver une action expirée", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await time.increase(6 * 3600 + 1);

            await expect(
                policyEngine.connect(admin2).approveAction(actionId)
            ).to.be.revertedWith("PolicyEngine: expired");
        });
    });

    // ═══════════════════════════════════════════════════
    // R8 — removeApproval
    // ═══════════════════════════════════════════════════
    describe("removeApproval (R8)", function () {
        it("devrait permettre de retirer son approbation", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);

            await expect(policyEngine.connect(admin2).removeApproval(actionId))
                .to.emit(policyEngine, "ApprovalRemoved");

            await time.increase(3601);
            await expect(
                policyEngine.connect(admin1).executeAction(actionId)
            ).to.be.revertedWith("PolicyEngine: not enough signatures");
        });

        it("l'initiateur devrait utiliser cancelAction au lieu de removeApproval", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await expect(
                policyEngine.connect(admin1).removeApproval(actionId)
            ).to.be.revertedWith("PolicyEngine: initiator must cancel instead");
        });

        it("retirer puis ré-approuver devrait fonctionner", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);
            await policyEngine.connect(admin2).removeApproval(actionId);

            // Ré-approbation après retrait → doit fonctionner
            await expect(
                policyEngine.connect(admin2).approveAction(actionId)
            ).to.not.be.reverted;
        });
    });

    // ═══════════════════════════════════════════════════
    // cancelAction
    // ═══════════════════════════════════════════════════
    describe("cancelAction", function () {
        it("l'initiateur devrait pouvoir annuler", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await expect(policyEngine.connect(admin1).cancelAction(actionId))
                .to.emit(policyEngine, "ActionCancelled");
        });

        it("ne devrait pas pouvoir exécuter après annulation", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);
            await policyEngine.connect(admin1).cancelAction(actionId);
            await time.increase(3601);

            await expect(
                policyEngine.connect(admin1).executeAction(actionId)
            ).to.be.revertedWith("PolicyEngine: cancelled");
        });
    });

    // ═══════════════════════════════════════════════════
    // B6 — executeRoleAction (tâche 1-3)
    // ═══════════════════════════════════════════════════
    describe("executeRoleAction (B6)", function () {

        // Helper : ferme le bootstrap pour activer PolicyEngine comme granteur
        beforeEach(async function () {
            await closeBootstrap();
        });

        it("flux complet GRANT_OPERATOR : submit → approve → executeRoleAction", async function () {
            const OPERATOR = await accessControl.OPERATOR();
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [operator1.address, OPERATOR]
            );

            // Admin1 soumet
            const tx = await policyEngine.connect(admin1).submitAction("GRANT_OPERATOR", actionData);
            const actionId = await getActionId(tx);

            // Pas besoin de 2ème approbation (requiredSignatures = 1, initiateur compte)
            // Admin1 exécute directement
            await expect(
                policyEngine.connect(admin1).executeRoleAction(actionId)
            ).to.emit(policyEngine, "RoleActionExecuted");

            expect(await accessControl.hasRole(operator1.address, OPERATOR)).to.be.true;
        });

        it("flux complet GRANT_ADMIN : submit → 2 approvals → executeRoleAction", async function () {
            const signers = await ethers.getSigners();
            const admin4 = signers[6];
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.connect(admin4).registerDID("did:da:admin4", 0, pubKeyHash, "{}");

            const ADMIN = await accessControl.ADMIN();
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [admin4.address, ADMIN]
            );

            // Admin1 soumet (= 1ère approbation)
            const tx = await policyEngine.connect(admin1).submitAction("GRANT_ADMIN", actionData);
            const actionId = await getActionId(tx);

            // Admin2 approuve (= 2ème approbation)
            await policyEngine.connect(admin2).approveAction(actionId);

            // Admin1 exécute
            await expect(
                policyEngine.connect(admin1).executeRoleAction(actionId)
            ).to.emit(policyEngine, "RoleActionExecuted");

            expect(await accessControl.hasRole(admin4.address, ADMIN)).to.be.true;
        });

        it("flux complet REVOKE_ROLE : submit → 2 approvals → executeRoleAction", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [admin1.address, ethers.ZeroHash]
            );

            const tx = await policyEngine.connect(admin1).submitAction("REVOKE_ROLE", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);

            await expect(
                policyEngine.connect(admin1).executeRoleAction(actionId)
            ).to.emit(policyEngine, "RoleActionExecuted");

            // admin1 n'a plus de rôle actif
            const ADMIN = await accessControl.ADMIN();
            expect(await accessControl.hasRole(admin1.address, ADMIN)).to.be.false;
        });

        it("executeRoleAction devrait échouer sans assez de signatures", async function () {
            const ADMIN = await accessControl.ADMIN();
            const signers = await ethers.getSigners();
            const admin4 = signers[6];
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.connect(admin4).registerDID("did:da:admin4", 0, pubKeyHash, "{}");

            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [admin4.address, ADMIN]
            );

            // GRANT_ADMIN requiert 2 sigs — admin1 seul soumet (= 1 sig)
            const tx = await policyEngine.connect(admin1).submitAction("GRANT_ADMIN", actionData);
            const actionId = await getActionId(tx);

            // Tente d'exécuter sans 2ème approbation
            await expect(
                policyEngine.connect(admin1).executeRoleAction(actionId)
            ).to.be.revertedWith("PolicyEngine: not enough signatures");
        });

        it("executeRoleAction devrait échouer après expiration", async function () {
            const OPERATOR = await accessControl.OPERATOR();
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [operator1.address, OPERATOR]
            );

            const tx = await policyEngine.connect(admin1).submitAction("GRANT_OPERATOR", actionData);
            const actionId = await getActionId(tx);

            // Avancer au-delà de DEFAULT_EXPIRY (24h)
            await time.increase(24 * 3600 + 1);

            await expect(
                policyEngine.connect(admin1).executeRoleAction(actionId)
            ).to.be.revertedWith("PolicyEngine: expired");
        });

        it("executeRoleAction devrait échouer si déjà exécuté", async function () {
            const OPERATOR = await accessControl.OPERATOR();
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [operator1.address, OPERATOR]
            );

            const tx = await policyEngine.connect(admin1).submitAction("GRANT_OPERATOR", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin1).executeRoleAction(actionId);

            // Deuxième exécution → doit échouer
            await expect(
                policyEngine.connect(admin1).executeRoleAction(actionId)
            ).to.be.revertedWith("PolicyEngine: already executed");
        });

        it("executeRoleAction devrait échouer par un non-approver", async function () {
            const OPERATOR = await accessControl.OPERATOR();
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [operator1.address, OPERATOR]
            );

            const tx = await policyEngine.connect(admin1).submitAction("GRANT_OPERATOR", actionData);
            const actionId = await getActionId(tx);

            // deployer n'est pas un approver
            await expect(
                policyEngine.executeRoleAction(actionId)
            ).to.be.revertedWith("PolicyEngine: only approvers can execute");
        });

        it("executeRoleAction devrait échouer après cancelAction", async function () {
            const OPERATOR = await accessControl.OPERATOR();
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes32"],
                [operator1.address, OPERATOR]
            );

            const tx = await policyEngine.connect(admin1).submitAction("GRANT_OPERATOR", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin1).cancelAction(actionId);

            await expect(
                policyEngine.connect(admin1).executeRoleAction(actionId)
            ).to.be.revertedWith("PolicyEngine: cancelled");
        });
    });
});