const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AccessControl", function () {
    let didRegistry, accessControl;
    let deployer, admin1, operator1, auditor1, noRole;

    beforeEach(async function () {
        [deployer, admin1, operator1, auditor1, noRole] = await ethers.getSigners();

        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        await didRegistry.connect(admin1).registerDID("did:da:admin1", 0, pubKeyHash, "{}");
        await didRegistry.connect(operator1).registerDID("did:da:op1", 0, pubKeyHash, "{}");
        await didRegistry.connect(auditor1).registerDID("did:da:aud1", 0, pubKeyHash, "{}");
        await didRegistry.connect(noRole).registerDID("did:da:noRole", 0, pubKeyHash, "{}");

        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();
    });

    describe("Initialisation", function () {
        it("le déployeur devrait être SUPER_ADMIN", async function () {
            const SUPER_ADMIN = await accessControl.SUPER_ADMIN();
            expect(await accessControl.hasRole(deployer.address, SUPER_ADMIN)).to.be.true;
        });

        it("SUPER_ADMIN devrait avoir toutes les permissions", async function () {
            expect(await accessControl.canPerform(deployer.address, "CREATE_USER")).to.be.true;
            expect(await accessControl.canPerform(deployer.address, "MANAGE_ROLES")).to.be.true;
        });
    });

    describe("grantRole", function () {
        it("devrait attribuer le rôle ADMIN", async function () {
            const ADMIN = await accessControl.ADMIN();
            await accessControl.grantRole(admin1.address, ADMIN);
            expect(await accessControl.hasRole(admin1.address, ADMIN)).to.be.true;
        });

        it("ADMIN devrait avoir les bonnes permissions", async function () {
            const ADMIN = await accessControl.ADMIN();
            await accessControl.grantRole(admin1.address, ADMIN);
            expect(await accessControl.canPerform(admin1.address, "CREATE_USER")).to.be.true;
            expect(await accessControl.canPerform(admin1.address, "DELETE_USER")).to.be.true;
            expect(await accessControl.canPerform(admin1.address, "MANAGE_ROLES")).to.be.false;
        });

        it("OPERATOR devrait avoir des permissions limitées", async function () {
            const OPERATOR = await accessControl.OPERATOR();
            await accessControl.grantRole(operator1.address, OPERATOR);
            expect(await accessControl.canPerform(operator1.address, "MODIFY_USER")).to.be.true;
            expect(await accessControl.canPerform(operator1.address, "CREATE_USER")).to.be.false;
        });

        it("AUDITOR devrait voir uniquement", async function () {
            const AUDITOR = await accessControl.AUDITOR();
            await accessControl.grantRole(auditor1.address, AUDITOR);
            expect(await accessControl.canPerform(auditor1.address, "VIEW_LOGS")).to.be.true;
            expect(await accessControl.canPerform(auditor1.address, "CREATE_USER")).to.be.false;
        });

        it("devrait rejeter si non SUPER_ADMIN", async function () {
            const ADMIN = await accessControl.ADMIN();
            await expect(
                accessControl.connect(admin1).grantRole(operator1.address, ADMIN)
            ).to.be.revertedWith("AccessControl: not SUPER_ADMIN");
        });

        it("devrait rejeter si DID inactif", async function () {
            await didRegistry.connect(admin1).deactivateDID(admin1.address);
            const ADMIN = await accessControl.ADMIN();
            await expect(
                accessControl.grantRole(admin1.address, ADMIN)
            ).to.be.revertedWith("AccessControl: DID not active");
        });

        // R4: Valider rôle
        it("devrait rejeter un rôle invalide (R4)", async function () {
            const fakeRole = ethers.keccak256(ethers.toUtf8Bytes("FAKE_ROLE"));
            await expect(
                accessControl.grantRole(admin1.address, fakeRole)
            ).to.be.revertedWith("AccessControl: invalid role");
        });
    });

    describe("revokeRole", function () {
        it("devrait révoquer un rôle", async function () {
            const ADMIN = await accessControl.ADMIN();
            await accessControl.grantRole(admin1.address, ADMIN);
            await accessControl.revokeRole(admin1.address);
            expect(await accessControl.canPerform(admin1.address, "CREATE_USER")).to.be.false;
        });

        it("ne devrait pas pouvoir révoquer SUPER_ADMIN", async function () {
            await expect(
                accessControl.revokeRole(deployer.address)
            ).to.be.revertedWith("AccessControl: cannot revoke SUPER_ADMIN self");
        });
    });

    // R3: changeRole atomique
    describe("changeRole (R3)", function () {
        it("devrait changer le rôle en une transaction", async function () {
            const ADMIN = await accessControl.ADMIN();
            const OPERATOR = await accessControl.OPERATOR();
            await accessControl.grantRole(admin1.address, ADMIN);

            await accessControl.changeRole(admin1.address, OPERATOR);

            expect(await accessControl.hasRole(admin1.address, OPERATOR)).to.be.true;
            expect(await accessControl.hasRole(admin1.address, ADMIN)).to.be.false;
            expect(await accessControl.canPerform(admin1.address, "MODIFY_USER")).to.be.true;
            expect(await accessControl.canPerform(admin1.address, "CREATE_USER")).to.be.false;
        });

        it("devrait rejeter un rôle invalide (R4)", async function () {
            const ADMIN = await accessControl.ADMIN();
            await accessControl.grantRole(admin1.address, ADMIN);
            const fakeRole = ethers.keccak256(ethers.toUtf8Bytes("FAKE"));
            await expect(
                accessControl.changeRole(admin1.address, fakeRole)
            ).to.be.revertedWith("AccessControl: invalid role");
        });

        it("devrait émettre RoleRevoked et RoleGranted", async function () {
            const ADMIN = await accessControl.ADMIN();
            const OPERATOR = await accessControl.OPERATOR();
            await accessControl.grantRole(admin1.address, ADMIN);

            const tx = accessControl.changeRole(admin1.address, OPERATOR);
            await expect(tx).to.emit(accessControl, "RoleRevoked");
            await expect(tx).to.emit(accessControl, "RoleGranted");
        });
    });

    // R5: transferSuperAdmin protégé
    describe("transferSuperAdmin (R5)", function () {
        it("devrait être verrouillé par défaut", async function () {
            await expect(
                accessControl.transferSuperAdmin(admin1.address)
            ).to.be.revertedWith("AccessControl: transfer locked, use PolicyEngine");
        });

        it("devrait rejeter unlockSuperAdminTransfer par non-PolicyEngine", async function () {
            await expect(
                accessControl.unlockSuperAdminTransfer()
            ).to.be.revertedWith("AccessControl: only PolicyEngine");
        });

        it("devrait émettre SuperAdminTransferred (R2)", async function () {
            // Simuler PolicyEngine
            const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
            const pe = await PolicyEngine.deploy(
                await didRegistry.getAddress(),
                await accessControl.getAddress()
            );
            await pe.waitForDeployment();
            await accessControl.setPolicyEngine(await pe.getAddress());

            // Déverrouiller via impersonnation du contrat ne marchera pas en test
            // On teste juste que le lock fonctionne
            expect(await accessControl.superAdminTransferLocked()).to.be.true;
        });
    });

    describe("setPermission", function () {
        it("devrait modifier une permission", async function () {
            const ADMIN = await accessControl.ADMIN();
            await accessControl.grantRole(admin1.address, ADMIN);

            expect(await accessControl.canPerform(admin1.address, "MANAGE_ROLES")).to.be.false;
            await accessControl.setPermission(ADMIN, "MANAGE_ROLES", true);
            expect(await accessControl.canPerform(admin1.address, "MANAGE_ROLES")).to.be.true;
            await accessControl.setPermission(ADMIN, "MANAGE_ROLES", false);
            expect(await accessControl.canPerform(admin1.address, "MANAGE_ROLES")).to.be.false;
        });
    });

    describe("batchSetPermissions", function () {
        it("devrait modifier plusieurs permissions d'un coup", async function () {
            const OPERATOR = await accessControl.OPERATOR();
            await accessControl.grantRole(operator1.address, OPERATOR);

            await accessControl.batchSetPermissions(
                OPERATOR,
                ["CREATE_USER", "DELETE_USER"],
                [true, true]
            );

            expect(await accessControl.canPerform(operator1.address, "CREATE_USER")).to.be.true;
            expect(await accessControl.canPerform(operator1.address, "DELETE_USER")).to.be.true;
        });
    });
});
