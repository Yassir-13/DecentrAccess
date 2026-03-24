const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DIDRegistry", function () {
    let didRegistry;
    let owner, addr1, addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();
    });

    describe("registerDID", function () {
        it("devrait enregistrer un DID Admin", async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key1"));
            await didRegistry.registerDID("did:da:test", 0, pubKeyHash, '{"name":"Ali"}');

            const doc = await didRegistry.resolveDID(owner.address);
            expect(doc.did).to.equal("did:da:test");
            expect(doc.entityType).to.equal(0);
            expect(doc.active).to.be.true;
        });

        it("devrait enregistrer un DID Machine", async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("machine-key"));
            await didRegistry.connect(addr1).registerDID("did:da:pc01", 1, pubKeyHash, '{"hostname":"PC-01"}');

            const doc = await didRegistry.resolveDID(addr1.address);
            expect(doc.entityType).to.equal(1);
        });

        it("devrait rejeter un DID déjà existant", async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.registerDID("did:da:test", 0, pubKeyHash, "{}");
            await expect(
                didRegistry.registerDID("did:da:test2", 0, pubKeyHash, "{}")
            ).to.be.revertedWith("DIDRegistry: DID already exists");
        });

        // R1: Event enrichi avec publicKeyHash et metadata
        it("devrait émettre DIDRegistered avec tous les champs (R1)", async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            const metadata = '{"name":"Ali"}';
            const tx = await didRegistry.registerDID("did:da:test", 0, pubKeyHash, metadata);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            await expect(tx)
                .to.emit(didRegistry, "DIDRegistered")
                .withArgs(owner.address, "did:da:test", 0, pubKeyHash, metadata, block.timestamp);
        });

        it("devrait incrémenter totalDIDs", async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.registerDID("did:da:test", 0, pubKeyHash, "{}");
            expect(await didRegistry.totalDIDs()).to.equal(1);
        });
    });

    describe("isDIDActive", function () {
        it("devrait retourner true pour un DID actif", async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.registerDID("did:da:test", 0, pubKeyHash, "{}");
            expect(await didRegistry.isDIDActive(owner.address)).to.be.true;
        });

        it("devrait retourner false pour un DID inexistant", async function () {
            expect(await didRegistry.isDIDActive(addr1.address)).to.be.false;
        });
    });

    describe("deactivateDID / reactivateDID", function () {
        beforeEach(async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.registerDID("did:da:test", 0, pubKeyHash, "{}");
        });

        it("devrait désactiver un DID", async function () {
            await didRegistry.deactivateDID(owner.address);
            expect(await didRegistry.isDIDActive(owner.address)).to.be.false;
        });

        it("devrait réactiver un DID", async function () {
            await didRegistry.deactivateDID(owner.address);
            await didRegistry.reactivateDID(owner.address);
            expect(await didRegistry.isDIDActive(owner.address)).to.be.true;
        });

        it("devrait rejeter la désactivation par un non-propriétaire", async function () {
            await expect(
                didRegistry.connect(addr1).deactivateDID(owner.address)
            ).to.be.revertedWith("DIDRegistry: not owner");
        });

        it("devrait émettre les events", async function () {
            await expect(didRegistry.deactivateDID(owner.address))
                .to.emit(didRegistry, "DIDDeactivated");
            await expect(didRegistry.reactivateDID(owner.address))
                .to.emit(didRegistry, "DIDReactivated");
        });
    });

    describe("updatePublicKey / updateMetadata", function () {
        beforeEach(async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.registerDID("did:da:test", 0, pubKeyHash, "{}");
        });

        it("devrait mettre à jour la clé publique", async function () {
            const newKeyHash = ethers.keccak256(ethers.toUtf8Bytes("new-key"));
            await didRegistry.updatePublicKey(newKeyHash);
            const doc = await didRegistry.resolveDID(owner.address);
            expect(doc.publicKeyHash).to.equal(newKeyHash);
        });

        it("devrait mettre à jour les métadonnées", async function () {
            await didRegistry.updateMetadata('{"name":"Ali Updated"}');
            const doc = await didRegistry.resolveDID(owner.address);
            expect(doc.metadata).to.equal('{"name":"Ali Updated"}');
        });
    });

    describe("getDIDsByType", function () {
        it("devrait retourner les DIDs par type", async function () {
            const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
            await didRegistry.registerDID("did:da:admin", 0, pubKeyHash, "{}");
            await didRegistry.connect(addr1).registerDID("did:da:machine", 1, pubKeyHash, "{}");

            const admins = await didRegistry.getDIDsByType(0);
            const machines = await didRegistry.getDIDsByType(1);
            expect(admins.length).to.equal(1);
            expect(machines.length).to.equal(1);
        });
    });
});

// Helper pour obtenir le timestamp du dernier bloc
async function getBlockTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
}
