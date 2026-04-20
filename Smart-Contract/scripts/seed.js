// Smart-Contract/scripts/seed.js
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    const [deployer] = await ethers.getSigners();
    const provider = deployer.provider;
    console.log("Seed avec le compte :", deployer.address);

    const addresses = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));

    const didRegistry = await ethers.getContractAt("DIDRegistry", addresses.DIDRegistry);
    const accessControl = await ethers.getContractAt("AccessControl", addresses.AccessControl);
    const alertManager = await ethers.getContractAt("AlertManager", addresses.AlertManager);

    const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("mock-key"));

    // ═══ Utilisateurs ═══
    console.log("\n═══ SEED : Utilisateurs ═══\n");

    const users = [
        { name: "Mahmoud Elaassri", department: "Sales", role: "OPERATOR" },
        { name: "Achraf Oubaba", department: "Sales", role: "ADMIN" },
        { name: "Nassim Aguengar", department: "IT", role: "ADMIN" },
        { name: "Yassine Lahdili", department: "Finance", role: "OPERATOR" },
        { name: "Aymane Souliem", department: "Audit", role: "AUDITOR" },
    ];

    for (const user of users) {
        // Créer un wallet fictif et le connecter au provider
        const wallet = ethers.Wallet.createRandom().connect(provider);

        // Financer le wallet depuis le déployeur pour payer le gas
        const fundTx = await deployer.sendTransaction({
            to: wallet.address,
            value: ethers.parseEther("1.0")
        });
        await fundTx.wait();

        // Le wallet s'enregistre lui-même
        const did = `did:da:${wallet.address}`;
        const metadata = JSON.stringify({ name: user.name, department: user.department });

        const didTx = await didRegistry.connect(wallet).registerDID(
            did, 0, pubKeyHash, metadata
        );
        await didTx.wait();

        // Le déployeur (SUPER_ADMIN) lui attribue un rôle
        const roleBytes = await accessControl[user.role]();
        const roleTx = await accessControl.grantRole(wallet.address, roleBytes);
        await roleTx.wait();

        console.log(` ${user.name} (${user.role}) — ${wallet.address}`);
    }

    // ═══ Agents ═══
    console.log("\n═══ SEED : Agents ═══\n");

    const agents = [
        { hostname: "SRV-AD-02", hasLDAP: true },
        { hostname: "PC-IT-13", hasLDAP: false },
        { hostname: "PC-SL-01", hasLDAP: false },
    ];

    for (const agent of agents) {
        const wallet = ethers.Wallet.createRandom().connect(provider);

        const fundTx = await deployer.sendTransaction({
            to: wallet.address,
            value: ethers.parseEther("1.0")
        });
        await fundTx.wait();

        const did = `did:da:${wallet.address}`;
        const metadata = JSON.stringify({ hostname: agent.hostname, hasLDAP: agent.hasLDAP });

        const didTx = await didRegistry.connect(wallet).registerDID(
            did, 1, pubKeyHash, metadata
        );
        await didTx.wait();

        console.log(` Agent ${agent.hostname} (LDAP: ${agent.hasLDAP}) — ${wallet.address}`);
    }

    // ═══ Alertes ═══
    console.log("\n═══ SEED : Alertes ═══\n");

    const rules = [
        { name: "BRUTE_FORCE SSH", condition: "failed_Attempts > 5", severity: 3 },
        { name: "MALWARE DETECTED", condition: "hash_found_in_db > 4", severity: 2 },
    ];

    for (const rule of rules) {
        const tx = await alertManager.createRule(rule.name, rule.condition, rule.severity);
        await tx.wait();
        console.log(`✅ Règle : ${rule.name}`);
    }

    console.log("\n═══════════════════════════════════════");
    console.log("SEED TERMINÉ ");
    console.log("═══════════════════════════════════════\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Erreur :", error);
        process.exit(1);
    });