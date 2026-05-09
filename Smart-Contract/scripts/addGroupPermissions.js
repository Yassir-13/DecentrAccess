// Smart-Contract/scripts/addGroupPermissions.js
// Ajoute ADD_TO_GROUP et REMOVE_FROM_GROUP aux permissions SUPER_ADMIN et ADMIN
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Exécution avec :", deployer.address);

  const contracts = require("../deployed-addresses.json");
  const accessControl = await ethers.getContractAt("AccessControl", contracts.AccessControl);

  const SUPER_ADMIN = ethers.keccak256(ethers.toUtf8Bytes("SUPER_ADMIN"));
  const ADMIN       = ethers.keccak256(ethers.toUtf8Bytes("ADMIN"));

  const newActions = ["ADD_TO_GROUP", "REMOVE_FROM_GROUP"];

  for (const action of newActions) {
    let tx = await accessControl.setPermission(SUPER_ADMIN, action, true);
    await tx.wait();
    console.log(`✅ SUPER_ADMIN → ${action}`);

    tx = await accessControl.setPermission(ADMIN, action, true);
    await tx.wait();
    console.log(`✅ ADMIN → ${action}`);
  }

  // Vérification
  const canSA = await accessControl.canPerform(deployer.address, "ADD_TO_GROUP");
  console.log(`\nVérification — SUPER_ADMIN canPerform(ADD_TO_GROUP): ${canSA}`);

  console.log("\n🎉 Permissions groupe ajoutées avec succès !");
}

main().catch((err) => { console.error(err); process.exit(1); });
