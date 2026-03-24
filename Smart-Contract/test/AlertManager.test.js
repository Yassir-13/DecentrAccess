const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AlertManager", function () {
    let didRegistry, accessControl, auditLog, alertManager;
    let deployer, admin1, agent1, noRole;

    beforeEach(async function () {
        [deployer, admin1, agent1, noRole] = await ethers.getSigners();

        // DIDRegistry
        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        await didRegistry.connect(admin1).registerDID("did:da:admin1", 0, pubKeyHash, "{}");
        await didRegistry.connect(agent1).registerDID("did:da:agent1", 1, pubKeyHash, "{}");

        // AccessControl
        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();

        const ADMIN = await accessControl.ADMIN();
        await accessControl.grantRole(admin1.address, ADMIN);

        // AuditLog
        const AuditLog = await ethers.getContractFactory("AuditLog");
        auditLog = await AuditLog.deploy(await didRegistry.getAddress());
        await auditLog.waitForDeployment();

        // AlertManager
        const AlertManager = await ethers.getContractFactory("AlertManager");
        alertManager = await AlertManager.deploy(
            await didRegistry.getAddress(),
            await accessControl.getAddress(),
            await auditLog.getAddress()
        );
        await alertManager.waitForDeployment();
    });

    describe("createRule", function () {
        it("devrait créer une règle d'alerte", async function () {
            const tx = await alertManager.createRule("BRUTE_FORCE", "failed_logins > 5", 3); // CRITICAL
            const receipt = await tx.wait();
            expect(await alertManager.getRuleCount()).to.equal(1);
        });

        it("devrait émettre RuleCreated", async function () {
            await expect(alertManager.createRule("BRUTE_FORCE", "failed > 5", 2))
                .to.emit(alertManager, "RuleCreated");
        });

        it("devrait rejeter sans permission MANAGE_POLICIES", async function () {
            await expect(
                alertManager.connect(agent1).createRule("RULE", "cond", 0)
            ).to.be.revertedWith("AlertManager: no permission");
        });
    });

    describe("triggerAlert", function () {
        let ruleId;

        beforeEach(async function () {
            const tx = await alertManager.createRule("BRUTE_FORCE", "failed > 5", 3);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try { return alertManager.interface.parseLog(log)?.name === "RuleCreated"; }
                catch { return false; }
            });
            ruleId = alertManager.interface.parseLog(event).args.ruleId;
        });

        it("devrait déclencher une alerte", async function () {
            await alertManager.connect(agent1).triggerAlert(ruleId, "5 failed logins on PC-01", "QmCID");
            
            const alert = await alertManager.getAlert(0);
            expect(alert.ruleId).to.equal(ruleId);
            expect(alert.severity).to.equal(3); // CRITICAL
            expect(alert.acknowledged).to.be.false;
            expect(await alertManager.activeAlertCount()).to.equal(1);
        });

        it("devrait émettre AlertTriggered", async function () {
            await expect(alertManager.connect(agent1).triggerAlert(ruleId, "desc", "QmCID"))
                .to.emit(alertManager, "AlertTriggered");
        });

        // B2/B3 Fix: ruleId inexistant
        it("devrait rejeter un ruleId inexistant", async function () {
            const fakeRuleId = ethers.keccak256(ethers.toUtf8Bytes("FAKE"));
            await expect(
                alertManager.connect(agent1).triggerAlert(fakeRuleId, "desc", "Qm")
            ).to.be.revertedWith("AlertManager: rule not found");
        });

        it("devrait rejeter si DID inactif", async function () {
            await didRegistry.connect(agent1).deactivateDID(agent1.address);
            await expect(
                alertManager.connect(agent1).triggerAlert(ruleId, "desc", "Qm")
            ).to.be.revertedWith("AlertManager: DID not active");
        });
    });

    describe("acknowledgeAlert", function () {
        let ruleId;

        beforeEach(async function () {
            const tx = await alertManager.createRule("BRUTE_FORCE", "failed > 5", 3);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try { return alertManager.interface.parseLog(log)?.name === "RuleCreated"; }
                catch { return false; }
            });
            ruleId = alertManager.interface.parseLog(event).args.ruleId;
            await alertManager.connect(agent1).triggerAlert(ruleId, "desc", "QmCID");
        });

        it("devrait acquitter une alerte", async function () {
            await alertManager.acknowledgeAlert(0);

            const alert = await alertManager.getAlert(0);
            expect(alert.acknowledged).to.be.true;
            expect(alert.acknowledgedBy).to.equal(deployer.address);
            expect(await alertManager.activeAlertCount()).to.equal(0);
        });

        it("devrait rejeter double acquittement", async function () {
            await alertManager.acknowledgeAlert(0);
            await expect(
                alertManager.acknowledgeAlert(0)
            ).to.be.revertedWith("AlertManager: already acknowledged");
        });
    });

    describe("deactivateRule", function () {
        it("devrait rejeter un ruleId inexistant (B2 Fix)", async function () {
            const fakeRuleId = ethers.keccak256(ethers.toUtf8Bytes("FAKE"));
            await expect(
                alertManager.deactivateRule(fakeRuleId)
            ).to.be.revertedWith("AlertManager: rule not found");
        });
    });

    describe("Vues", function () {
        it("devrait retourner les alertes actives", async function () {
            const tx = await alertManager.createRule("RULE1", "cond", 1);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try { return alertManager.interface.parseLog(log)?.name === "RuleCreated"; }
                catch { return false; }
            });
            const ruleId = alertManager.interface.parseLog(event).args.ruleId;

            await alertManager.connect(agent1).triggerAlert(ruleId, "d1", "Qm1");
            await alertManager.connect(agent1).triggerAlert(ruleId, "d2", "Qm2");

            const active = await alertManager.getActiveAlerts();
            expect(active.length).to.equal(2);

            await alertManager.acknowledgeAlert(0);
            const activeAfter = await alertManager.getActiveAlerts();
            expect(activeAfter.length).to.equal(1);
        });

        it("devrait retourner les alertes par sévérité", async function () {
            const tx = await alertManager.createRule("RULE_HIGH", "cond", 2); // HIGH
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try { return alertManager.interface.parseLog(log)?.name === "RuleCreated"; }
                catch { return false; }
            });
            const ruleId = alertManager.interface.parseLog(event).args.ruleId;

            await alertManager.connect(agent1).triggerAlert(ruleId, "desc", "Qm");
            const highAlerts = await alertManager.getAlertsBySeverity(2);
            expect(highAlerts.length).to.equal(1);
        });
    });
});
