// scripts/deploy.js
// Déploie les 9 smart contracts DecentrAccess dans l'ordre des dépendances

const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Déploiement avec le compte :", deployer.address);
    console.log("Balance :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    console.log("═══════════════════════════════════════\n");

    // ═══ 1. DIDRegistry ═══
    console.log("1/9 — Déploiement DIDRegistry...");
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();
    await didRegistry.waitForDeployment();
    const didAddr = await didRegistry.getAddress();
    console.log("    DIDRegistry OK :", didAddr);

    // B5 Fix: Enregistrer le DID du déployeur IMMÉDIATEMENT après DIDRegistry
    console.log("    → Enregistrement DID SUPER_ADMIN...");
    const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("super-admin-key"));
    await didRegistry.registerDID(
        `did:da:${deployer.address}`,
        0,  // EntityType.Admin
        pubKeyHash,
        JSON.stringify({ name: "Super Admin", role: "SUPER_ADMIN" })
    );
    console.log("    → DID SUPER_ADMIN enregistré ✅");

    // ═══ 2. AccessControl ═══
    console.log("2/9 — Déploiement AccessControl...");
    const AccessControl = await ethers.getContractFactory("AccessControl");
    const accessControl = await AccessControl.deploy(didAddr);
    await accessControl.waitForDeployment();
    const acAddr = await accessControl.getAddress();
    console.log("    AccessControl OK :", acAddr);

    // ═══ 3. PolicyEngine ═══
    console.log("3/9 — Déploiement PolicyEngine...");
    const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
    const policyEngine = await PolicyEngine.deploy(didAddr, acAddr);
    await policyEngine.waitForDeployment();
    const peAddr = await policyEngine.getAddress();
    console.log("    PolicyEngine OK :", peAddr);

    // ═══ 4. AuditLog ═══
    console.log("4/9 — Déploiement AuditLog...");
    const AuditLog = await ethers.getContractFactory("AuditLog");
    const auditLog = await AuditLog.deploy(didAddr);
    await auditLog.waitForDeployment();
    const alAddr = await auditLog.getAddress();
    console.log("    AuditLog OK :", alAddr);

    // ═══ 5. AgentRegistry ═══
    console.log("5/9 — Déploiement AgentRegistry...");
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const agentRegistry = await AgentRegistry.deploy(didAddr, acAddr);
    await agentRegistry.waitForDeployment();
    const arAddr = await agentRegistry.getAddress();
    console.log("    AgentRegistry OK :", arAddr);

    // ═══ Lier AccessControl ↔ PolicyEngine (R5) ═══
    console.log("\n— Liaison AccessControl → PolicyEngine (R5)...");
    await accessControl.setPolicyEngine(peAddr);
    console.log("    AccessControl lié à PolicyEngine");

    // ═══════════ EXTENSION CONTRACTS ═══════════
    console.log("\n═══ EXTENSIONS ═══\n");

    // ═══ 6. AlertManager ═══
    console.log("6/9 — Déploiement AlertManager...");
    const AlertManager = await ethers.getContractFactory("AlertManager");
    const alertManager = await AlertManager.deploy(didAddr, acAddr, alAddr);
    await alertManager.waitForDeployment();
    const amAddr = await alertManager.getAddress();
    console.log("    AlertManager OK :", amAddr);

    // ═══ 7. ADStateAnchor ═══
    console.log("7/9 — Déploiement ADStateAnchor...");
    const ADStateAnchor = await ethers.getContractFactory("ADStateAnchor");
    const adStateAnchor = await ADStateAnchor.deploy(didAddr, acAddr);
    await adStateAnchor.waitForDeployment();
    const asAddr = await adStateAnchor.getAddress();
    console.log("    ADStateAnchor OK :", asAddr);

    // ═══ 8. ReputationScore ═══
    console.log("8/9 — Déploiement ReputationScore...");
    const ReputationScore = await ethers.getContractFactory("ReputationScore");
    const reputationScore = await ReputationScore.deploy(didAddr, acAddr);
    await reputationScore.waitForDeployment();
    const rsAddr = await reputationScore.getAddress();
    console.log("    ReputationScore OK :", rsAddr);

    // ═══ 9. EmergencyRecovery ═══
    console.log("9/9 — Déploiement EmergencyRecovery...");
    const EmergencyRecovery = await ethers.getContractFactory("EmergencyRecovery");
    const emergencyRecovery = await EmergencyRecovery.deploy(didAddr, acAddr);
    await emergencyRecovery.waitForDeployment();
    const erAddr = await emergencyRecovery.getAddress();
    console.log("    EmergencyRecovery OK :", erAddr);

    // ═══ Résumé ═══
    console.log("\n═══════════════════════════════════════");
    console.log("DÉPLOIEMENT TERMINÉ — 9 CONTRATS");
    console.log("═══════════════════════════════════════");

    const addresses = {
        // Core
        DIDRegistry: didAddr,
        AccessControl: acAddr,
        PolicyEngine: peAddr,
        AuditLog: alAddr,
        AgentRegistry: arAddr,
        // Extensions
        AlertManager: amAddr,
        ADStateAnchor: asAddr,
        ReputationScore: rsAddr,
        EmergencyRecovery: erAddr
    };

    console.log("\nAdresses :");
    console.table(addresses);

    // Sauvegarder les adresses dans un fichier config
    const fs = require("fs");
    fs.writeFileSync(
        "./deployed-addresses.json",
        JSON.stringify(addresses, null, 2)
    );
    console.log("\n  Adresses sauvegardées dans deployed-addresses.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Erreur :", error);
        process.exit(1);
    });