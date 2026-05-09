// Smart-Contract/scripts/forceDeregisterAgent.js
// Usage : npx hardhat run scripts/forceDeregisterAgent.js --network geth
//
// Désenregistre un agent fantôme via forceDeregister (SUPER_ADMIN requis)

const hre = require("hardhat");
const contracts = require("../deployed-addresses.json");

const STALE_AGENT = "0xeB832A2bB90fF3B9938C62192465E003880a0DE0";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeployer (SUPER_ADMIN) : ${deployer.address}`);

  const AgentRegistry = await hre.ethers.getContractAt(
    [
      "function forceDeregister(address _agent) external",
      "function getAgent(address _agent) view returns (tuple(address agentAddress, string hostname, bool canExecuteAD, string peerId, uint256 registeredAt, uint256 lastHeartbeat, bool active))",
      "function getOnlineExecutors() view returns (address[])",
      "function getActiveAgentCount() view returns (uint256)",
    ],
    contracts.AgentRegistry,
    deployer
  );

  // ── Avant ──
  console.log("\n── État avant ──");
  const agentBefore = await AgentRegistry.getAgent(STALE_AGENT);
  console.log(`Agent ${STALE_AGENT.slice(0, 10)}...`);
  console.log(`  Hostname     : ${agentBefore.hostname}`);
  console.log(`  canExecuteAD : ${agentBefore.canExecuteAD}`);
  console.log(`  active       : ${agentBefore.active}`);
  console.log(`  lastHeartbeat: ${new Date(Number(agentBefore.lastHeartbeat) * 1000).toISOString()}`);

  const executorsBefore = await AgentRegistry.getOnlineExecutors();
  console.log(`\nOnline executors : ${executorsBefore.length}`);
  executorsBefore.forEach((e, i) => console.log(`  [${i}] ${e}`));

  if (!agentBefore.active) {
    console.log("\n✅ Agent déjà inactif — rien à faire");
    return;
  }

  // ── Force deregister ──
  console.log(`\n🔧 forceDeregister(${STALE_AGENT.slice(0, 10)}...)...`);
  const tx = await AgentRegistry.forceDeregister(STALE_AGENT);
  await tx.wait();
  console.log(`✅ TX : ${tx.hash}`);

  // ── Après ──
  console.log("\n── État après ──");
  const agentAfter = await AgentRegistry.getAgent(STALE_AGENT);
  console.log(`  active : ${agentAfter.active}`);

  const executorsAfter = await AgentRegistry.getOnlineExecutors();
  console.log(`\nOnline executors : ${executorsAfter.length}`);
  executorsAfter.forEach((e, i) => console.log(`  [${i}] ${e}`));

  const count = await AgentRegistry.getActiveAgentCount();
  console.log(`\nActive agents total : ${count}`);
  console.log("\n✅ Agent fantôme désenregistré — l'élection fonctionnera correctement maintenant");
}

main().catch((err) => {
  console.error("❌ Erreur :", err.message);
  process.exit(1);
});
