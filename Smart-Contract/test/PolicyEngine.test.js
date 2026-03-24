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
    });

    // Helper to extract actionId from receipt
    async function getActionId(tx) {
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
            try { return policyEngine.interface.parseLog(log)?.name === "ActionSubmitted"; }
            catch { return false; }
        });
        return policyEngine.interface.parseLog(event).args.actionId;
    }

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

        // R7: expiryPeriod configurable
        it("DELETE_USER devrait avoir un expiryPeriod de 6h (R7)", async function () {
            const policy = await policyEngine.getPolicy("DELETE_USER");
            expect(policy.expiryPeriod).to.equal(6 * 3600);
        });

        it("REVOKE_ADMIN devrait avoir un expiryPeriod de 48h (R7)", async function () {
            const policy = await policyEngine.getPolicy("REVOKE_ADMIN");
            expect(policy.expiryPeriod).to.equal(48 * 3600);
        });
    });

    // R9: getAllPolicyTypes
    describe("getAllPolicyTypes (R9)", function () {
        it("devrait retourner tous les types de policies", async function () {
            const types = await policyEngine.getAllPolicyTypes();
            expect(types).to.include("CREATE_USER");
            expect(types).to.include("DELETE_USER");
            expect(types).to.include("REVOKE_ADMIN");
            expect(types.length).to.equal(7);
        });
    });

    describe("evaluatePolicy", function () {
        it("devrait autoriser un ADMIN à CREATE_USER", async function () {
            const [allowed, needsMultiSig] = await policyEngine.evaluatePolicy(admin1.address, "CREATE_USER");
            expect(allowed).to.be.true;
            expect(needsMultiSig).to.be.false;
        });
    });

    describe("Flux Multi-Sig complet", function () {
        it("devrait soumettre → approuver → exécuter (R6: par approver)", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            // Admin2 approuve
            await policyEngine.connect(admin2).approveAction(actionId);

            // Attendre cooldown
            await time.increase(3601);

            // R6: seul un approver peut exécuter
            await expect(policyEngine.connect(admin1).executeAction(actionId))
                .to.emit(policyEngine, "ActionExecuted");
        });

        // R6: non-approver ne peut pas exécuter
        it("devrait rejeter executeAction par un non-approver (R6)", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);
            await time.increase(3601);

            // deployer n'est pas un approver
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
    });

    // R8: removeApproval
    describe("removeApproval (R8)", function () {
        it("devrait permettre de retirer son approbation", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await policyEngine.connect(admin2).approveAction(actionId);

            // Admin2 retire son approbation
            await expect(policyEngine.connect(admin2).removeApproval(actionId))
                .to.emit(policyEngine, "ApprovalRemoved");

            // Plus assez de signatures
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
    });

    describe("cancelAction", function () {
        it("l'initiateur devrait pouvoir annuler", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [operator1.address]);
            const tx = await policyEngine.connect(admin1).submitAction("DELETE_USER", actionData);
            const actionId = await getActionId(tx);

            await expect(policyEngine.connect(admin1).cancelAction(actionId))
                .to.emit(policyEngine, "ActionCancelled");
        });
    });
});
