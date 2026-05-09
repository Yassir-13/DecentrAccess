// scripts/deploy.js
// Déploie les 10 smart contracts DecentrAccess dans l'ordre des dépendances

const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Déploiement avec le compte :", deployer.address);
    console.log("Balance :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    console.log("═══════════════════════════════════════\n");

    // ═══ 1. DIDRegistry ═══
    console.log("1/10 — Déploiement DIDRegistry...");
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();
    await didRegistry.waitForDeployment();
    const didAddr = await didRegistry.getAddress();
    console.log("    DIDRegistry OK :", didAddr);

    console.log("    → Enregistrement DID SUPER_ADMIN...");
    const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("super-admin-key"));
    await didRegistry.registerDID(
        `did:da:${deployer.address}`,
        0,
        pubKeyHash,
        JSON.stringify({ name: "Super Admin", role: "SUPER_ADMIN" })
    );
    console.log("    → DID SUPER_ADMIN enregistré ✅");

    // ═══ 2. AccessControl ═══
    console.log("2/10 — Déploiement AccessControl...");
    const AccessControl = await ethers.getContractFactory("AccessControl");
    const accessControl = await AccessControl.deploy(didAddr);
    await accessControl.waitForDeployment();
    const acAddr = await accessControl.getAddress();
    console.log("    AccessControl OK :", acAddr);
    console.log("    → Bootstrap Mode actif ✅");

    // ═══ 3. PolicyEngine ═══
    console.log("3/10 — Déploiement PolicyEngine...");
    const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
    const policyEngine = await PolicyEngine.deploy(didAddr, acAddr);
    await policyEngine.waitForDeployment();
    const peAddr = await policyEngine.getAddress();
    console.log("    PolicyEngine OK :", peAddr);

    // ═══ 4. AuditLog ═══
    console.log("4/10 — Déploiement AuditLog...");
    const AuditLog = await ethers.getContractFactory("AuditLog");
    const auditLog = await AuditLog.deploy(didAddr);
    await auditLog.waitForDeployment();
    const alAddr = await auditLog.getAddress();
    console.log("    AuditLog OK :", alAddr);

    // ═══ 5. AgentRegistry ═══
    console.log("5/10 — Déploiement AgentRegistry...");
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const agentRegistry = await AgentRegistry.deploy(didAddr, acAddr);
    await agentRegistry.waitForDeployment();
    const arAddr = await agentRegistry.getAddress();
    console.log("    AgentRegistry OK :", arAddr);

    // ═══ Lier AccessControl ↔ PolicyEngine ═══
    console.log("\n— Liaison AccessControl → PolicyEngine...");
    await accessControl.setPolicyEngine(peAddr);
    console.log("    AccessControl lié à PolicyEngine ✅");

    // ═══════════ EXTENSIONS ═══════════
    console.log("\n═══ EXTENSIONS ═══\n");

    // ═══ 6. AlertManager ═══
    console.log("6/10 — Déploiement AlertManager...");
    const AlertManager = await ethers.getContractFactory("AlertManager");
    const alertManager = await AlertManager.deploy(didAddr, acAddr, alAddr);
    await alertManager.waitForDeployment();
    const amAddr = await alertManager.getAddress();
    console.log("    AlertManager OK :", amAddr);

    // ═══ 7. ADStateAnchor ═══
    console.log("7/10 — Déploiement ADStateAnchor...");
    const ADStateAnchor = await ethers.getContractFactory("ADStateAnchor");
    const adStateAnchor = await ADStateAnchor.deploy(didAddr, acAddr);
    await adStateAnchor.waitForDeployment();
    const asAddr = await adStateAnchor.getAddress();
    console.log("    ADStateAnchor OK :", asAddr);

    // ═══ 8. ReputationScore ═══
    console.log("8/10 — Déploiement ReputationScore...");
    const ReputationScore = await ethers.getContractFactory("ReputationScore");
    const reputationScore = await ReputationScore.deploy(didAddr, acAddr);
    await reputationScore.waitForDeployment();
    const rsAddr = await reputationScore.getAddress();
    console.log("    ReputationScore OK :", rsAddr);

    // ═══ 9. EmergencyRecovery ═══
    console.log("9/10 — Déploiement EmergencyRecovery...");
    const EmergencyRecovery = await ethers.getContractFactory("EmergencyRecovery");
    const emergencyRecovery = await EmergencyRecovery.deploy(didAddr, acAddr);
    await emergencyRecovery.waitForDeployment();
    const erAddr = await emergencyRecovery.getAddress();
    console.log("    EmergencyRecovery OK :", erAddr);

    // ═══ 10. FaucetManager ═══
    console.log("10/10 — Déploiement FaucetManager...");
    const FAUCET_INITIAL_FUND = ethers.parseEther("5"); // 5 ETH de réserve initiale
    const FaucetManager = await ethers.getContractFactory("FaucetManager");
    const faucetManager = await FaucetManager.deploy(didAddr, acAddr, {
        value: FAUCET_INITIAL_FUND
    });
    await faucetManager.waitForDeployment();
    const fmAddr = await faucetManager.getAddress();
    console.log("    FaucetManager OK :", fmAddr);
    console.log(`    → Alimenté avec ${ethers.formatEther(FAUCET_INITIAL_FUND)} ETH ✅`);

    // ═══ Résumé ═══
    console.log("\n═══════════════════════════════════════");
    console.log("DÉPLOIEMENT TERMINÉ — 10 CONTRATS");
    console.log("═══════════════════════════════════════");

    const addresses = {
        DIDRegistry:       didAddr,
        AccessControl:     acAddr,
        PolicyEngine:      peAddr,
        AuditLog:          alAddr,
        AgentRegistry:     arAddr,
        AlertManager:      amAddr,
        ADStateAnchor:     asAddr,
        ReputationScore:   rsAddr,
        EmergencyRecovery: erAddr,
        FaucetManager:     fmAddr
    };

    console.log("\nAdresses :");
    console.table(addresses);

    // ═══════════════════════════════════════════════════
    // Tâche 1-4 : Auto-financement des wallets enregistrés
    // ═══════════════════════════════════════════════════
    const FUND_AMOUNT = ethers.parseEther("0.5");
    const MIN_BALANCE = ethers.parseEther("0.1");

    console.log("\n═══ FINANCEMENT WALLETS ═══\n");

    const adminAddresses   = await didRegistry.getDIDsByType(0);
    const machineAddresses = await didRegistry.getDIDsByType(1);
    const allWallets       = [...adminAddresses, ...machineAddresses];

    console.log(`    Wallets trouvés : ${allWallets.length} (${adminAddresses.length} admins + ${machineAddresses.length} machines)`);

    let funded  = 0;
    let skipped = 0;

    for (const wallet of allWallets) {
        if (wallet.toLowerCase() === deployer.address.toLowerCase()) {
            skipped++;
            continue;
        }
        const balance = await ethers.provider.getBalance(wallet);
        if (balance < MIN_BALANCE) {
            const tx = await deployer.sendTransaction({ to: wallet, value: FUND_AMOUNT });
            await tx.wait();
            console.log(`    ✅ ${wallet} financé — ${ethers.formatEther(FUND_AMOUNT)} ETH`);
            funded++;
        } else {
            console.log(`    ⏭  ${wallet} — déjà financé (${ethers.formatEther(balance)} ETH)`);
            skipped++;
        }
    }

    console.log(`\n    Bilan : ${funded} financé(s), ${skipped} ignoré(s)`);
    if (funded === 0 && allWallets.length <= 1) {
        console.log(`    ℹ️  FaucetManager prêt (${fmAddr}) — utilisez le dashboard pour financer les prochains wallets.`);
    }

    // ═══════════════════════════════════════════════════
    // Tâche 1-9 : Synchronisation automatique contracts.json
    // ═══════════════════════════════════════════════════
    const fs   = require("fs");
    const path = require("path");

    fs.writeFileSync("./deployed-addresses.json", JSON.stringify(addresses, null, 2));
    console.log("\n✅ deployed-addresses.json sauvegardé dans Smart-Contract/");

    const frontendConfigPath = path.resolve(__dirname, "../../FrontEnd/src/config/contracts.json");
    if (fs.existsSync(path.dirname(frontendConfigPath))) {
        fs.writeFileSync(frontendConfigPath, JSON.stringify(addresses, null, 2));
        console.log("✅ contracts.json synchronisé dans FrontEnd/src/config/");
    } else {
        console.warn("⚠️  FrontEnd/src/config/ introuvable — copie manuelle requise");
    }

    console.log("\n— Valeurs à mettre dans Agents/.env :");
    console.log(`DID_REGISTRY=${didAddr}`);
    console.log(`ACCESS_CONTROL=${acAddr}`);
    console.log(`POLICY_ENGINE=${peAddr}`);
    console.log(`AUDIT_LOG=${alAddr}`);
    console.log(`AGENT_REGISTRY=${arAddr}`);
    console.log(`ALERT_MANAGER=${amAddr}`);
    console.log(`AD_STATE_ANCHOR=${asAddr}`);
    console.log(`REPUTATION_SCORE=${rsAddr}`);
    console.log(`EMERGENCY_RECOVERY=${erAddr}`);
    console.log(`FAUCET_MANAGER=${fmAddr}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Erreur :", error);
        process.exit(1);
    });