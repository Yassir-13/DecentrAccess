const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuditLog", function () {
    let didRegistry, auditLog;
    let signer1, signer2;

    beforeEach(async function () {
        [signer1, signer2] = await ethers.getSigners();

        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:signer1", 0, pubKeyHash, "{}");
        await didRegistry.connect(signer2).registerDID("did:da:signer2", 1, pubKeyHash, "{}");

        const AuditLog = await ethers.getContractFactory("AuditLog");
        auditLog = await AuditLog.deploy(await didRegistry.getAddress());
        await auditLog.waitForDeployment();
    });

    describe("logAction", function () {
        it("devrait enregistrer un log", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("test-action"));
            const sig = ethers.toUtf8Bytes("sig");
            await auditLog.logAction(hash, "CREATE_USER", "QmTestCID123", sig);

            const log = await auditLog.getLog(0);
            expect(log.actionHash).to.equal(hash);
            expect(log.actionType).to.equal("CREATE_USER");
            expect(log.ipfsCID).to.equal("QmTestCID123");
            expect(log.signer).to.equal(signer1.address);
        });

        it("devrait rejeter si DID inactif", async function () {
            await didRegistry.deactivateDID(signer1.address);
            const hash = ethers.keccak256(ethers.toUtf8Bytes("test"));
            await expect(
                auditLog.logAction(hash, "CREATE_USER", "QmTest", "0x")
            ).to.be.revertedWith("AuditLog: DID not active");
        });

        it("devrait incrémenter le compteur", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("test"));
            await auditLog.logAction(hash, "CREATE_USER", "QmTest", "0x");
            await auditLog.logAction(hash, "DELETE_USER", "QmTest2", "0x");
            expect(await auditLog.getLogCount()).to.equal(2);
        });

        it("devrait émettre ActionLogged", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("test"));
            await expect(auditLog.logAction(hash, "CREATE_USER", "QmTest", "0x"))
                .to.emit(auditLog, "ActionLogged");
        });
    });

    describe("Index par signataire et type", function () {
        beforeEach(async function () {
            const hash1 = ethers.keccak256(ethers.toUtf8Bytes("action1"));
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("action2"));
            const hash3 = ethers.keccak256(ethers.toUtf8Bytes("action3"));

            await auditLog.logAction(hash1, "CREATE_USER", "QmCID1", "0x");
            await auditLog.logAction(hash2, "DELETE_USER", "QmCID2", "0x");
            await auditLog.connect(signer2).logAction(hash3, "CREATE_USER", "QmCID3", "0x");
        });

        it("devrait filtrer par signataire", async function () {
            const logs = await auditLog.getLogsBySigner(signer1.address);
            expect(logs.length).to.equal(2);
        });

        it("devrait filtrer par type", async function () {
            const createLogs = await auditLog.getLogsByType("CREATE_USER");
            expect(createLogs.length).to.equal(2);
            const deleteLogs = await auditLog.getLogsByType("DELETE_USER");
            expect(deleteLogs.length).to.equal(1);
        });
    });

    // R10: Pagination
    describe("Pagination (R10)", function () {
        beforeEach(async function () {
            // Ajouter 10 logs
            for (let i = 0; i < 10; i++) {
                const hash = ethers.keccak256(ethers.toUtf8Bytes(`action${i}`));
                await auditLog.logAction(hash, "CREATE_USER", `QmCID${i}`, "0x");
            }
        });

        it("devrait paginer par signataire", async function () {
            const page1 = await auditLog.getLogsBySignerPaginated(signer1.address, 0, 3);
            expect(page1.length).to.equal(3);

            const page2 = await auditLog.getLogsBySignerPaginated(signer1.address, 3, 3);
            expect(page2.length).to.equal(3);

            const page4 = await auditLog.getLogsBySignerPaginated(signer1.address, 9, 5);
            expect(page4.length).to.equal(1);
        });

        it("devrait retourner un tableau vide si offset trop grand", async function () {
            const result = await auditLog.getLogsBySignerPaginated(signer1.address, 100, 10);
            expect(result.length).to.equal(0);
        });

        it("devrait paginer par type", async function () {
            const page = await auditLog.getLogsByTypePaginated("CREATE_USER", 0, 5);
            expect(page.length).to.equal(5);
        });

        it("devrait retourner le count par signataire", async function () {
            expect(await auditLog.getLogCountBySigner(signer1.address)).to.equal(10);
        });

        it("devrait retourner le count par type", async function () {
            expect(await auditLog.getLogCountByType("CREATE_USER")).to.equal(10);
        });
    });

    describe("Merkle Tree", function () {
        it("devrait mettre à jour la racine après chaque log", async function () {
            const root0 = await auditLog.getMerkleRoot();
            expect(root0).to.equal(ethers.ZeroHash);

            const hash = ethers.keccak256(ethers.toUtf8Bytes("action1"));
            await auditLog.logAction(hash, "CREATE_USER", "QmCID1", "0x");
            const root1 = await auditLog.getMerkleRoot();
            expect(root1).to.not.equal(ethers.ZeroHash);

            await auditLog.logAction(hash, "DELETE_USER", "QmCID2", "0x");
            const root2 = await auditLog.getMerkleRoot();
            expect(root2).to.not.equal(root1);
        });

        it("devrait vérifier une preuve Merkle", async function () {
            for (let i = 0; i < 4; i++) {
                const hash = ethers.keccak256(ethers.toUtf8Bytes(`action${i}`));
                await auditLog.logAction(hash, `TYPE_${i}`, `QmCID${i}`, "0x");
            }

            const log = await auditLog.getLog(0);
            const leaf = await auditLog.computeLeaf(
                log.actionHash, log.signer, log.actionType, log.timestamp
            );
            const proof = await auditLog.getMerkleProof(0);
            const isValid = await auditLog.verifyMerkleProof(leaf, [...proof], 0);
            expect(isValid).to.be.true;
        });

        it("devrait rejeter une fausse preuve", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("action1"));
            await auditLog.logAction(hash, "CREATE_USER", "QmCID1", "0x");
            await auditLog.logAction(hash, "DELETE_USER", "QmCID2", "0x");

            const fakeLeaf = ethers.keccak256(ethers.toUtf8Bytes("FAKE"));
            const proof = await auditLog.getMerkleProof(0);
            const isValid = await auditLog.verifyMerkleProof(fakeLeaf, [...proof], 0);
            expect(isValid).to.be.false;
        });
    });

    describe("getLatestLogs", function () {
        it("devrait retourner les N derniers logs", async function () {
            for (let i = 0; i < 5; i++) {
                const hash = ethers.keccak256(ethers.toUtf8Bytes(`action${i}`));
                await auditLog.logAction(hash, `TYPE_${i}`, `QmCID${i}`, "0x");
            }

            const latest = await auditLog.getLatestLogs(3);
            expect(latest.length).to.equal(3);
            expect(latest[0].actionType).to.equal("TYPE_4");
        });
    });
});
