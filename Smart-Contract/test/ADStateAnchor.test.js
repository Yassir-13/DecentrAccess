const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ADStateAnchor", function () {
    let didRegistry, accessControl, adStateAnchor;
    let deployer, agent1, agent2;

    beforeEach(async function () {
        [deployer, agent1, agent2] = await ethers.getSigners();

        // DIDRegistry
        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        await didRegistry.connect(agent1).registerDID("did:da:agent1", 1, pubKeyHash, "{}");
        await didRegistry.connect(agent2).registerDID("did:da:agent2", 1, pubKeyHash, "{}");

        // AccessControl
        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();

        // ADStateAnchor
        const ADStateAnchor = await ethers.getContractFactory("ADStateAnchor");
        adStateAnchor = await ADStateAnchor.deploy(
            await didRegistry.getAddress(),
            await accessControl.getAddress()
        );
        await adStateAnchor.waitForDeployment();
    });

    describe("anchorState", function () {
        it("devrait ancrer un snapshot", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            await adStateAnchor.connect(agent1).anchorState(hash, "QmCID1", 100, 10, 5);

            expect(await adStateAnchor.getSnapshotCount()).to.equal(1);
            expect(await adStateAnchor.lastKnownStateHash()).to.equal(hash);
        });

        it("devrait émettre StateAnchored", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            await expect(adStateAnchor.connect(agent1).anchorState(hash, "QmCID1", 100, 10, 5))
                .to.emit(adStateAnchor, "StateAnchored");
        });

        it("devrait rejeter un DID inactif", async function () {
            await didRegistry.connect(agent1).deactivateDID(agent1.address);
            const hash = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            await expect(
                adStateAnchor.connect(agent1).anchorState(hash, "QmCID1", 100, 10, 5)
            ).to.be.revertedWith("ADStateAnchor: DID not active");
        });
    });

    describe("Drift Detection", function () {
        it("devrait détecter un drift quand le hash change", async function () {
            const hash1 = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("state2_modified"));

            await adStateAnchor.connect(agent1).anchorState(hash1, "QmCID1", 100, 10, 5);
            expect(await adStateAnchor.driftDetected()).to.be.false;

            await expect(adStateAnchor.connect(agent1).anchorState(hash2, "QmCID2", 101, 10, 5))
                .to.emit(adStateAnchor, "DriftDetected");

            expect(await adStateAnchor.driftDetected()).to.be.true;
        });

        it("ne devrait PAS détecter de drift si le hash est le même", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            await adStateAnchor.connect(agent1).anchorState(hash, "QmCID1", 100, 10, 5);
            await adStateAnchor.connect(agent1).anchorState(hash, "QmCID2", 100, 10, 5);

            expect(await adStateAnchor.driftDetected()).to.be.false;
        });

        it("SUPER_ADMIN devrait pouvoir résoudre le drift", async function () {
            const hash1 = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("state2"));

            await adStateAnchor.connect(agent1).anchorState(hash1, "Qm1", 100, 10, 5);
            await adStateAnchor.connect(agent1).anchorState(hash2, "Qm2", 101, 10, 5);

            await expect(adStateAnchor.resolveDrift())
                .to.emit(adStateAnchor, "DriftResolved");

            expect(await adStateAnchor.driftDetected()).to.be.false;
        });

        it("non-SUPER_ADMIN ne devrait pas pouvoir résoudre le drift", async function () {
            const hash1 = ethers.keccak256(ethers.toUtf8Bytes("s1"));
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("s2"));

            await adStateAnchor.connect(agent1).anchorState(hash1, "Qm1", 100, 10, 5);
            await adStateAnchor.connect(agent1).anchorState(hash2, "Qm2", 101, 10, 5);

            await expect(
                adStateAnchor.connect(agent1).resolveDrift()
            ).to.be.revertedWith("ADStateAnchor: only SUPER_ADMIN");
        });
    });

    describe("verifyState", function () {
        it("devrait vérifier un hash correct", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            await adStateAnchor.connect(agent1).anchorState(hash, "Qm1", 100, 10, 5);

            expect(await adStateAnchor.verifyState(hash)).to.be.true;
        });

        it("devrait rejeter un hash incorrect", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("WRONG"));
            await adStateAnchor.connect(agent1).anchorState(hash, "Qm1", 100, 10, 5);

            expect(await adStateAnchor.verifyState(wrongHash)).to.be.false;
        });
    });

    describe("compareSnapshots", function () {
        it("devrait comparer deux snapshots", async function () {
            const hash1 = ethers.keccak256(ethers.toUtf8Bytes("s1"));
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("s2"));

            await adStateAnchor.connect(agent1).anchorState(hash1, "Qm1", 100, 10, 5);
            await adStateAnchor.connect(agent1).anchorState(hash2, "Qm2", 105, 12, 6);

            const [userDiff, groupDiff, computerDiff, hashChanged] =
                await adStateAnchor.compareSnapshots(0, 1);

            expect(userDiff).to.equal(5);
            expect(groupDiff).to.equal(2);
            expect(computerDiff).to.equal(1);
            expect(hashChanged).to.be.true;
        });
    });

    describe("Vues", function () {
        it("devrait retourner le dernier snapshot", async function () {
            const hash = ethers.keccak256(ethers.toUtf8Bytes("state1"));
            await adStateAnchor.connect(agent1).anchorState(hash, "QmLast", 100, 10, 5);

            const snapshot = await adStateAnchor.getLatestSnapshot();
            expect(snapshot.ipfsCID).to.equal("QmLast");
            expect(snapshot.userCount).to.equal(100);
        });

        it("devrait retourner les N derniers snapshots", async function () {
            for (let i = 0; i < 5; i++) {
                const hash = ethers.keccak256(ethers.toUtf8Bytes(`state${i}`));
                await adStateAnchor.connect(agent1).anchorState(hash, `Qm${i}`, 100 + i, 10, 5);
            }

            const latest = await adStateAnchor.getLatestSnapshots(3);
            expect(latest.length).to.equal(3);
        });
    });
});
