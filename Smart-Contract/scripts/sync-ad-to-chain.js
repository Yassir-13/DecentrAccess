// Smart-Contract/scripts/sync-ad-to-chain.js
// Synchronise les utilisateurs AD existants vers la blockchain (DID + rôle)
// Usage : npx hardhat run scripts/sync-ad-to-chain.js --network geth

const { ethers } = require("hardhat");
const fs         = require("fs");
const ldap       = require("ldapts");

// ─── Config LDAP ─────────────────────────────────────────────────────────────
const LDAP_URL      = "ldap://192.168.19.133"
const LDAP_BASE_DN  = "DC=blockchain,DC=local"
const LDAP_USER     = "CN=Administrator,CN=Users,DC=blockchain,DC=local"
const LDAP_PASSWORD = "Admin@2022"
const LDAP_SEARCH   = "OU=Users,OU=DecentrAccess,DC=blockchain,DC=local"

// ─── Config Blockchain ───────────────────────────────────────────────────────
const ADDRESSES = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"))

async function main() {
  const [deployer] = await ethers.getSigners()
  const provider   = deployer.provider

  console.log("═══════════════════════════════════════════")
  console.log("  Sync AD → Blockchain")
  console.log("  Déployeur :", deployer.address)
  console.log("═══════════════════════════════════════════\n")

  // ─── Contrats ───────────────────────────────────────────────────────────────
  const didRegistry   = await ethers.getContractAt("DIDRegistry",   ADDRESSES.DIDRegistry)
  const accessControl = await ethers.getContractAt("AccessControl", ADDRESSES.AccessControl)
  const OPERATOR      = await accessControl.OPERATOR()

  // ─── Connexion LDAP ─────────────────────────────────────────────────────────
  console.log("[LDAP] Connexion à", LDAP_URL)
  const client = new ldap.Client({ url: LDAP_URL, connectTimeout: 10000 })
  await client.bind(LDAP_USER, LDAP_PASSWORD)
  console.log("[LDAP] ✅ Connecté\n")

  // ─── Récupération des users AD ──────────────────────────────────────────────
  const { searchEntries } = await client.search(LDAP_SEARCH, {
    scope:      "sub",
    filter:     "(objectClass=user)",
    attributes: ["cn", "sAMAccountName", "department", "givenName", "sn", "mail"]
  })

  console.log(`[LDAP] ${searchEntries.length} utilisateur(s) trouvé(s) dans l'AD\n`)

  // ─── Sync pour chaque user ──────────────────────────────────────────────────
  const results = []

  for (const entry of searchEntries) {
    const name       = entry.cn           || "Unknown"
    const username   = entry.sAMAccountName || "unknown"
    const department = entry.department   || "—"
    const firstName  = entry.givenName    || name.split(" ")[0] || ""
    const lastName   = entry.sn           || name.split(" ")[1] || ""

    console.log(`─── Traitement : ${name} (${username}) ───`)

    // 1. Générer un wallet
    const wallet = ethers.Wallet.createRandom().connect(provider)
    console.log(`  Wallet généré : ${wallet.address}`)

    // 2. Financer le wallet (0.1 ETH)
    const fundTx = await deployer.sendTransaction({
      to:    wallet.address,
      value: ethers.parseEther("0.1")
    })
    await fundTx.wait()
    console.log(`  Financé : 0.1 ETH ✅`)

    // 3. Enregistrer le DID on-chain
    const did      = `did:da:${wallet.address}`
    const pubKey   = ethers.keccak256(ethers.toUtf8Bytes(wallet.signingKey.publicKey))
    const metadata = JSON.stringify({
      name:       name,
      firstName:  firstName,
      lastName:   lastName,
      department: department,
      username:   username,
      source:     "AD-sync"
    })

    // Vérifier si le DID existe déjà
    const alreadyActive = await didRegistry.isDIDActive(wallet.address)
    if (alreadyActive) {
      console.log(`  DID déjà actif — skip\n`)
      continue
    }

    const didTx = await didRegistry.connect(wallet).registerDID(did, 0, pubKey, metadata)
    await didTx.wait()
    console.log(`  DID enregistré : ${did} ✅`)

    // 4. Attribuer le rôle OPERATOR
    const roleTx = await accessControl.grantRole(wallet.address, OPERATOR)
    await roleTx.wait()
    console.log(`  Rôle OPERATOR attribué ✅`)

    results.push({
      name,
      username,
      department,
      address:    wallet.address,
      privateKey: wallet.privateKey,
      did
    })

    console.log()
  }

  // ─── Déconnexion LDAP ───────────────────────────────────────────────────────
  await client.unbind()

  // ─── Résumé ─────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════")
  console.log(`  ${results.length} utilisateur(s) synchronisé(s)`)
  console.log("═══════════════════════════════════════════\n")

  results.forEach(u => {
    console.log(`  ${u.name} (${u.username})`)
    console.log(`    Adresse : ${u.address}`)
    console.log(`    Rôle    : OPERATOR`)
    console.log()
  })

  // ─── Sauvegarder les wallets générés ────────────────────────────────────────
  const outputPath = "./ad-users-wallets.json"
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`  Wallets sauvegardés dans ${outputPath}`)
  console.log("  ⚠️  NE JAMAIS COMMITTER ce fichier !")
}

main().catch(err => {
  console.error("Erreur fatale :", err.message)
  process.exit(1)
})