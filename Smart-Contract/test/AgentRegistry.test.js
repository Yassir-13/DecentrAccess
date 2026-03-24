const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AgentRegistry", function () {
    let didRegistry, accessControl, agentRegistry;
    let deployer, agent1, agent2, agent3;

    beforeEach(async function () {
        [deployer, agent1, agent2, agent3] = await ethers.getSigners();

        // DIDRegistry
        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        // Deployer = SUPER_ADMIN
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        // Agents = Machine type
        await didRegistry.connect(agent1).registerDID("did:da:agent1", 1, pubKeyHash, "{}");
        await didRegistry.connect(agent2).registerDID("did:da:agent2", 1, pubKeyHash, "{}");
        await didRegistry.connect(agent3).registerDID("did:da:agent3", 1, pubKeyHash, "{}");

        // AccessControl (R11: AgentRegistry needs it for forceDeregister)
        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();

        // AgentRegistry (now takes 2 args)
        const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
        agentRegistry = await AgentRegistry.deploy(
            await didRegistry.getAddress(),
            await accessControl.getAddress()
        );
        await agentRegistry.waitForDeployment();
    });

    describe("registerAgent", function () {
        it("devrait enregistrer un agent simple", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "QmAgent1");
            const agent = await agentRegistry.getAgent(agent1.address);
            expect(agent.hostname).to.equal("PC-01");
            expect(agent.canExecuteAD).to.be.false;
            expect(agent.active).to.be.true;
        });

        it("devrait enregistrer un agent exécutant", async function () {
            await agentRegistry.connect(agent2).registerAgent("SRV-AD", true, "QmAgent2");
            const agent = await agentRegistry.getAgent(agent2.address);
            expect(agent.canExecuteAD).to.be.true;
        });

        it("devrait rejeter un DID inactif", async function () {
            await didRegistry.connect(agent1).deactivateDID(agent1.address);
            await expect(
                agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm")
            ).to.be.revertedWith("AgentRegistry: DID not active");
        });

        it("devrait rejeter un agent déjà enregistré", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm");
            await expect(
                agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm")
            ).to.be.revertedWith("AgentRegistry: already registered");
        });
    });

    describe("heartbeat", function () {
        it("devrait mettre à jour le heartbeat", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm");
            await agentRegistry.connect(agent1).heartbeat();
            expect(await agentRegistry.isAgentOnline(agent1.address)).to.be.true;
        });

        it("devrait marquer offline après timeout", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm");
            await time.increase(361); // 6 min > 5 min timeout
            expect(await agentRegistry.isAgentOnline(agent1.address)).to.be.false;
        });
    });

    // R11: forceDeregister
    describe("forceDeregister (R11)", function () {
        beforeEach(async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", true, "QmAgent1");
        });

        it("SUPER_ADMIN devrait pouvoir forceDeregister un agent", async function () {
            const tx = await agentRegistry.forceDeregister(agent1.address);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            await expect(tx)
                .to.emit(agentRegistry, "AgentForceDeregistered")
                .withArgs(agent1.address, deployer.address, block.timestamp);

            const agent = await agentRegistry.getAgent(agent1.address);
            expect(agent.active).to.be.false;
        });

        it("non-SUPER_ADMIN ne devrait pas pouvoir forceDeregister", async function () {
            await expect(
                agentRegistry.connect(agent2).forceDeregister(agent1.address)
            ).to.be.revertedWith("AgentRegistry: only SUPER_ADMIN");
        });

        it("devrait retirer l'agent de la liste des executors", async function () {
            const executorsBefore = await agentRegistry.getExecutors();
            expect(executorsBefore.length).to.equal(1);

            await agentRegistry.forceDeregister(agent1.address);

            const executorsAfter = await agentRegistry.getExecutors();
            expect(executorsAfter.length).to.equal(0);
        });
    });

    // R12: getOnlineAgents
    describe("getOnlineAgents (R12)", function () {
        it("devrait retourner tous les agents en ligne", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "QmAgent1");
            await agentRegistry.connect(agent2).registerAgent("SRV-AD", true, "QmAgent2");
            await agentRegistry.connect(agent3).registerAgent("PC-03", false, "QmAgent3");

            const online = await agentRegistry.getOnlineAgents();
            expect(online.length).to.equal(3); // tous online
        });

        it("devrait exclure les agents offline", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm");
            await agentRegistry.connect(agent2).registerAgent("SRV-AD", true, "Qm");
            await time.increase(361); // tous offline
            await agentRegistry.connect(agent1).heartbeat(); // agent1 revient

            const online = await agentRegistry.getOnlineAgents();
            expect(online.length).to.equal(1);
            expect(online[0]).to.equal(agent1.address);
        });

        it("devrait retourner le count des agents en ligne", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm");
            await agentRegistry.connect(agent2).registerAgent("SRV-AD", true, "Qm");

            expect(await agentRegistry.getOnlineAgentCount()).to.equal(2);
        });
    });

    describe("electExecutor", function () {
        beforeEach(async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "QmAgent1");
            await agentRegistry.connect(agent2).registerAgent("SRV-AD", true, "QmAgent2");
            await agentRegistry.connect(agent3).registerAgent("SRV-AD-2", true, "QmAgent3");
        });

        it("devrait élire un exécutant", async function () {
            const actionId = ethers.keccak256(ethers.toUtf8Bytes("action1"));
            const executor = await agentRegistry.electExecutor(actionId);
            expect([agent2.address, agent3.address]).to.include(executor);
        });

        it("devrait être déterministe", async function () {
            const actionId = ethers.keccak256(ethers.toUtf8Bytes("action1"));
            const executor1 = await agentRegistry.electExecutor(actionId);
            const executor2 = await agentRegistry.electExecutor(actionId);
            expect(executor1).to.equal(executor2);
        });

        it("devrait élire différents agents pour différentes actions", async function () {
            const results = new Set();
            for (let i = 0; i < 10; i++) {
                const actionId = ethers.keccak256(ethers.toUtf8Bytes(`action${i}`));
                const executor = await agentRegistry.electExecutor(actionId);
                results.add(executor);
            }
            expect(results.size).to.be.greaterThanOrEqual(2);
        });

        it("devrait échouer si aucun exécutant en ligne", async function () {
            await time.increase(361);
            const actionId = ethers.keccak256(ethers.toUtf8Bytes("action"));
            await expect(
                agentRegistry.electExecutor(actionId)
            ).to.be.revertedWith("AgentRegistry: no executor available");
        });
    });

    describe("electFailover", function () {
        beforeEach(async function () {
            await agentRegistry.connect(agent2).registerAgent("SRV-AD-1", true, "QmAgent2");
            await agentRegistry.connect(agent3).registerAgent("SRV-AD-2", true, "QmAgent3");
        });

        it("devrait élire un agent de remplacement", async function () {
            const actionId = ethers.keccak256(ethers.toUtf8Bytes("action1"));
            const primary = await agentRegistry.electExecutor(actionId);
            const failover = await agentRegistry.electFailover(actionId, primary);
            expect(failover).to.not.equal(primary);
        });
    });

    describe("deregisterAgent", function () {
        it("devrait se désenregistrer", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm");
            await agentRegistry.connect(agent1).deregisterAgent();
            const agent = await agentRegistry.getAgent(agent1.address);
            expect(agent.active).to.be.false;
        });
    });

    describe("Compteurs", function () {
        it("devrait compter les agents actifs", async function () {
            await agentRegistry.connect(agent1).registerAgent("PC-01", false, "Qm");
            await agentRegistry.connect(agent2).registerAgent("SRV-AD", true, "Qm");
            expect(await agentRegistry.getActiveAgentCount()).to.equal(2);
            expect(await agentRegistry.getExecutorCount()).to.equal(1);
        });
    });
});

async function getBlockTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
}
