const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    const [deployer] = await ethers.getSigners();
    const provider = deployer.provider;

    const addresses = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));
    const didRegistry = await ethers.getContractAt("DIDRegistry", addresses.DIDRegistry);

    const pubKeyHash = ethers.keccak256(ethers.toUtf8Bytes("mock-key"));

    // ═══ Agent local (SRV-AD-01 dev) — financer seulement ═══
    const agentKey    = "0x072612d732b97e224ffdba0993da053ae8d29b662cd4417bc49a133357911c0b";
    const agentWallet = new ethers.Wallet(agentKey).connect(provider);

    const fundTx1 = await deployer.sendTransaction({
        to: agentWallet.address, value: ethers.parseEther("1.0")
    });
    await fundTx1.wait();
    console.log(`Agent local financé : ${agentWallet.address}`);
    console.log(`ℹ️  DID déjà enregistré — skip`);

    // ═══ Agent DC (WIN-CIDD8HJ1RVM) — nouveau wallet ═══
const dcKey = "0xe5619319f4abc10a094329db3ee4ec0423bcc529b45518a40edad42396c5b87a"
const dcWallet = new ethers.Wallet(dcKey).connect(provider);

const fundTx2 = await deployer.sendTransaction({
    to: dcWallet.address, value: ethers.parseEther("1.0")
});
await fundTx2.wait();
console.log(`Agent DC financé : ${dcWallet.address}`);

const didTx2 = await didRegistry.connect(dcWallet).registerDID(
    `did:da:${dcWallet.address}`,
    1,
    pubKeyHash,
    JSON.stringify({ hostname: "WIN-CIDD8HJ1RVM", hasLDAP: true })
);
await didTx2.wait();
console.log(`DID DC enregistré ✅`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });