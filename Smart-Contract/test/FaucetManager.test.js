const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("FaucetManager", function () {
    let didRegistry, accessControl, faucetManager;
    let deployer, admin1, admin2, noRole;

    const INITIAL_FUND  = ethers.parseEther("5");
    const DEFAULT_AMOUNT = ethers.parseEther("0.5");
    const ONE_ETH       = ethers.parseEther("1");

    beforeEach(async function () {
        [deployer, admin1, admin2, noRole] = await ethers.getSigners();

        // DIDRegistry
        const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
        didRegistry = await DIDRegistry.deploy();
        await didRegistry.waitForDeployment();

        const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("key"));
        await didRegistry.registerDID("did:da:deployer", 0, pubKeyHash, "{}");
        await didRegistry.connect(admin1).registerDID("did:da:admin1", 0, pubKeyHash, "{}");
        await didRegistry.connect(admin2).registerDID("did:da:admin2", 0, pubKeyHash, "{}");
        // noRole n'a pas de DID enregistré

        // AccessControl
        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy(await didRegistry.getAddress());
        await accessControl.waitForDeployment();

        // FaucetManager — alimenté avec 5 ETH au déploiement
        const FaucetManager = await ethers.getContractFactory("FaucetManager");
        faucetManager = await FaucetManager.deploy(
            await didRegistry.getAddress(),
            await accessControl.getAddress(),
            { value: INITIAL_FUND }
        );
        await faucetManager.waitForDeployment();
    });

    // ═══════════════════════════════════════════════════
    // Déploiement
    // ═══════════════════════════════════════════════════
    describe("Déploiement", function () {
        it("devrait recevoir les ETH initiaux au déploiement", async function () {
            expect(await faucetManager.balance()).to.equal(INITIAL_FUND);
        });

        it("devrait avoir le bon defaultAmount (0.5 ETH)", async function () {
            expect(await faucetManager.defaultAmount()).to.equal(DEFAULT_AMOUNT);
        });

        it("devrait avoir un cooldown de 24h par défaut", async function () {
            expect(await faucetManager.cooldown()).to.equal(24 * 3600);
        });

        it("devrait accepter des dépôts via receive()", async function () {
            const deposit = ethers.parseEther("1");
            await deployer.sendTransaction({ to: await faucetManager.getAddress(), value: deposit });
            expect(await faucetManager.balance()).to.equal(INITIAL_FUND + deposit);
        });
    });

    // ═══════════════════════════════════════════════════
    // fund() — montant par défaut
    // ═══════════════════════════════════════════════════
    describe("fund()", function () {
        it("SUPER_ADMIN devrait pouvoir financer un wallet avec DID actif", async function () {
            const balanceBefore = await ethers.provider.getBalance(admin1.address);
            await faucetManager.fund(admin1.address);
            const balanceAfter = await ethers.provider.getBalance(admin1.address);
            expect(balanceAfter - balanceBefore).to.equal(DEFAULT_AMOUNT);
        });

        it("devrait émettre l'event Funded", async function () {
            const tx = await faucetManager.fund(admin1.address);
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => { try { return faucetManager.interface.parseLog(log); } catch { return null; } })
                .find(e => e && e.name === "Funded");
            expect(event).to.not.be.undefined;
            expect(event.args.recipient).to.equal(admin1.address);
            expect(event.args.amount).to.equal(DEFAULT_AMOUNT);
            expect(event.args.by).to.equal(deployer.address);
            expect(event.args.timestamp).to.be.gt(0n);
        });

        it("devrait réduire la balance du faucet", async function () {
            await faucetManager.fund(admin1.address);
            expect(await faucetManager.balance()).to.equal(INITIAL_FUND - DEFAULT_AMOUNT);
        });

        it("devrait rejeter si non SUPER_ADMIN", async function () {
            await expect(
                faucetManager.connect(admin1).fund(admin2.address)
            ).to.be.revertedWith("FaucetManager: only SUPER_ADMIN");
        });

        it("devrait rejeter si le DID n'est pas actif", async function () {
            // noRole n'a pas de DID
            await expect(
                faucetManager.fund(noRole.address)
            ).to.be.revertedWith("FaucetManager: recipient DID not active");
        });

        it("devrait rejeter si le DID est désactivé", async function () {
            await didRegistry.connect(admin1).deactivateDID(admin1.address);
            await expect(
                faucetManager.fund(admin1.address)
            ).to.be.revertedWith("FaucetManager: recipient DID not active");
        });

        it("devrait respecter le cooldown", async function () {
            await faucetManager.fund(admin1.address);
            // Deuxième appel immédiat → cooldown pas écoulé
            await expect(
                faucetManager.fund(admin1.address)
            ).to.be.revertedWith("FaucetManager: cooldown not elapsed");
        });

        it("devrait permettre un 2ème financement après le cooldown", async function () {
            await faucetManager.fund(admin1.address);
            await time.increase(24 * 3600 + 1);
            await expect(faucetManager.fund(admin1.address)).to.not.be.reverted;
        });

        it("devrait rejeter si le faucet est vide", async function () {
            // Vider le faucet en finançant plusieurs wallets
            // defaultAmount = 0.5 ETH, faucet = 5 ETH → 10 financements max
            // On va changer le defaultAmount pour vider plus vite
            await faucetManager.setDefaultAmount(INITIAL_FUND);
            await faucetManager.fund(admin1.address); // vide tout

            await expect(
                faucetManager.fund(admin2.address)
            ).to.be.revertedWith("FaucetManager: insufficient balance");
        });
    });

    // ═══════════════════════════════════════════════════
    // fundAmount() — montant personnalisé
    // ═══════════════════════════════════════════════════
    describe("fundAmount()", function () {
        it("devrait financer avec un montant personnalisé", async function () {
            const customAmount  = ethers.parseEther("0.1");
            const balanceBefore = await ethers.provider.getBalance(admin1.address);
            await faucetManager.fundAmount(admin1.address, customAmount);
            const balanceAfter  = await ethers.provider.getBalance(admin1.address);
            expect(balanceAfter - balanceBefore).to.equal(customAmount);
        });

        it("devrait rejeter un montant nul", async function () {
            await expect(
                faucetManager.fundAmount(admin1.address, 0)
            ).to.be.revertedWith("FaucetManager: amount must be > 0");
        });

        it("devrait rejeter si non SUPER_ADMIN", async function () {
            await expect(
                faucetManager.connect(admin1).fundAmount(admin2.address, ONE_ETH)
            ).to.be.revertedWith("FaucetManager: only SUPER_ADMIN");
        });

        it("devrait rejeter si DID inactif", async function () {
            await expect(
                faucetManager.fundAmount(noRole.address, ONE_ETH)
            ).to.be.revertedWith("FaucetManager: recipient DID not active");
        });

        it("devrait respecter le cooldown même avec montant personnalisé", async function () {
            await faucetManager.fundAmount(admin1.address, ethers.parseEther("0.1"));
            await expect(
                faucetManager.fundAmount(admin1.address, ethers.parseEther("0.1"))
            ).to.be.revertedWith("FaucetManager: cooldown not elapsed");
        });
    });

    // ═══════════════════════════════════════════════════
    // fundBatch() — financement en lot
    // ═══════════════════════════════════════════════════
    describe("fundBatch()", function () {
        it("devrait financer plusieurs wallets d'un coup", async function () {
            const b1Before = await ethers.provider.getBalance(admin1.address);
            const b2Before = await ethers.provider.getBalance(admin2.address);

            await faucetManager.fundBatch([admin1.address, admin2.address]);

            const b1After = await ethers.provider.getBalance(admin1.address);
            const b2After = await ethers.provider.getBalance(admin2.address);

            expect(b1After - b1Before).to.equal(DEFAULT_AMOUNT);
            expect(b2After - b2Before).to.equal(DEFAULT_AMOUNT);
        });

        it("devrait skip les DIDs inactifs sans planter", async function () {
            await didRegistry.connect(admin1).deactivateDID(admin1.address);
            // admin1 DID inactif → skippé, admin2 financé normalement
            await expect(
                faucetManager.fundBatch([admin1.address, admin2.address])
            ).to.not.be.reverted;

            const b2After = await ethers.provider.getBalance(admin2.address);
            expect(b2After).to.be.gt(0n);
        });

        it("devrait rejeter si la liste est vide", async function () {
            await expect(
                faucetManager.fundBatch([])
            ).to.be.revertedWith("FaucetManager: empty list");
        });

        it("devrait rejeter si non SUPER_ADMIN", async function () {
            await expect(
                faucetManager.connect(admin1).fundBatch([admin2.address])
            ).to.be.revertedWith("FaucetManager: only SUPER_ADMIN");
        });

        it("devrait rejeter si balance insuffisante pour le batch", async function () {
            // Mettre un defaultAmount très élevé pour forcer l'échec
            await faucetManager.setDefaultAmount(ethers.parseEther("3"));
            // 2 wallets × 3 ETH = 6 ETH > 5 ETH de balance
            await expect(
                faucetManager.fundBatch([admin1.address, admin2.address])
            ).to.be.revertedWith("FaucetManager: insufficient balance for batch");
        });
    });

    // ═══════════════════════════════════════════════════
    // setDefaultAmount()
    // ═══════════════════════════════════════════════════
    describe("setDefaultAmount()", function () {
        it("SUPER_ADMIN devrait pouvoir modifier le montant par défaut", async function () {
            const newAmount = ethers.parseEther("0.25");
            await expect(faucetManager.setDefaultAmount(newAmount))
                .to.emit(faucetManager, "DefaultAmountUpdated")
                .withArgs(DEFAULT_AMOUNT, newAmount);
            expect(await faucetManager.defaultAmount()).to.equal(newAmount);
        });

        it("devrait rejeter un montant nul", async function () {
            await expect(
                faucetManager.setDefaultAmount(0)
            ).to.be.revertedWith("FaucetManager: amount must be > 0");
        });

        it("devrait rejeter si non SUPER_ADMIN", async function () {
            await expect(
                faucetManager.connect(admin1).setDefaultAmount(ONE_ETH)
            ).to.be.revertedWith("FaucetManager: only SUPER_ADMIN");
        });
    });

    // ═══════════════════════════════════════════════════
    // setCooldown()
    // ═══════════════════════════════════════════════════
    describe("setCooldown()", function () {
        it("devrait modifier le cooldown", async function () {
            const newCooldown = 12 * 3600; // 12h
            await expect(faucetManager.setCooldown(newCooldown))
                .to.emit(faucetManager, "CooldownUpdated")
                .withArgs(24 * 3600, newCooldown);
            expect(await faucetManager.cooldown()).to.equal(newCooldown);
        });

        it("cooldown = 0 devrait permettre des financements illimités", async function () {
            await faucetManager.setCooldown(0);
            await faucetManager.fund(admin1.address);
            // Sans cooldown → deuxième financement immédiat possible
            await expect(faucetManager.fund(admin1.address)).to.not.be.reverted;
        });

        it("devrait rejeter si non SUPER_ADMIN", async function () {
            await expect(
                faucetManager.connect(admin1).setCooldown(0)
            ).to.be.revertedWith("FaucetManager: only SUPER_ADMIN");
        });
    });

    // ═══════════════════════════════════════════════════
    // canFund() — vue dashboard
    // ═══════════════════════════════════════════════════
    describe("canFund()", function () {
        it("devrait retourner true pour un wallet éligible", async function () {
            const [ok, reason] = await faucetManager.canFund(admin1.address);
            expect(ok).to.be.true;
            expect(reason).to.equal("OK");
        });

        it("devrait retourner false si DID inactif", async function () {
            const [ok, reason] = await faucetManager.canFund(noRole.address);
            expect(ok).to.be.false;
            expect(reason).to.equal("DID not active");
        });

        it("devrait retourner false si faucet vide", async function () {
            await faucetManager.setDefaultAmount(INITIAL_FUND);
            await faucetManager.fund(admin1.address);
            // Faucet vide maintenant
            const [ok, reason] = await faucetManager.canFund(admin2.address);
            expect(ok).to.be.false;
            expect(reason).to.equal("Insufficient faucet balance");
        });

        it("devrait retourner false si cooldown pas écoulé", async function () {
            await faucetManager.fund(admin1.address);
            const [ok, reason] = await faucetManager.canFund(admin1.address);
            expect(ok).to.be.false;
            expect(reason).to.equal("Cooldown not elapsed");
        });
    });
});