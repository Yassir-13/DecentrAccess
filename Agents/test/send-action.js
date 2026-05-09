// Agents/test/send-action.js
// Script de test manuel — envoie une action signée via WebSocket
//
// Usage :
//   node test/send-action.js                         → CREATE_USER par défaut
//   node test/send-action.js ACTIVATE_USER            → action spécifique
//   node test/send-action.js CREATE_USER '{"username":"bob","firstName":"Bob","lastName":"Smith","department":"IT"}'
//
import { ethers } from 'ethers'
import WebSocket from 'ws'

// Clé privée du SUPER_ADMIN (deployer 0xDeAC...) — nécessaire pour isValidSigner()
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0x03b1026efc84097732416c2895773711d68d5ef78dd4ca10e57fd5082a5fa32c'
const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:9001'

// ── Payloads par défaut pour chaque action ──
const DEFAULT_PAYLOADS = {
  CREATE_USER: { username: 'testuser01', firstName: 'Test', lastName: 'User', department: 'IT' },
  ACTIVATE_USER: { username: 'testuser01', password: 'Temp@123456!' },
  DISABLE_USER: { username: 'testuser01' },
  ENABLE_USER: { username: 'testuser01', password: 'ReEnable@2026!' },
  DELETE_USER: { username: 'testuser01' },
  MODIFY_USER: { username: 'testuser01', firstName: 'TestModifié', lastName: 'UserModifié', department: 'RH' },
  RESET_PASSWORD: { username: 'testuser01', newPassword: 'NewPass@2026!' },
  CREATE_GROUP: { groupName: 'GRP-IT-Test', description: 'Groupe de test IT' },
  ADD_TO_GROUP: { groupName: 'GRP-IT-Test', username: 'testuser01' },
  REMOVE_FROM_GROUP: { groupName: 'GRP-IT-Test', username: 'testuser01' },
}

// ── Parse arguments ──
const actionType = process.argv[2] || 'CREATE_USER'
let payload
try {
  payload = process.argv[3] ? JSON.parse(process.argv[3]) : DEFAULT_PAYLOADS[actionType]
} catch {
  console.error('❌ Payload JSON invalide')
  process.exit(1)
}

if (!payload) {
  console.error(`❌ Action inconnue : ${actionType}`)
  console.error('Actions disponibles :', Object.keys(DEFAULT_PAYLOADS).join(', '))
  process.exit(1)
}

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY)
  const message = JSON.stringify({ actionType, payload })
  const signature = await wallet.signMessage(message)
  const actionHash = ethers.keccak256(ethers.toUtf8Bytes(message))

  const data = { actionType, payload, signer: wallet.address, signature, actionHash }

  console.log(`\n📤 Action : ${actionType}`)
  console.log(`📤 Signer : ${wallet.address}`)
  console.log(`📤 Payload :`, JSON.stringify(payload))
  console.log(`📤 Hash : ${actionHash}\n`)

  const ws = new WebSocket(WS_URL)

  ws.on('open', () => {
    ws.send(JSON.stringify(data))
    console.log('✅ Message envoyé — en attente de réponse...\n')
  })

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.type === 'connected') {
      console.log('🔗 Connecté à l\'agent')
      return
    }
    console.log('📥 Réponse :', JSON.stringify(msg, null, 2))

    // Si c'est un résultat, on ferme
    if (msg.type === 'result') {
      console.log(`\n${msg.status === 'success' ? '✅' : '❌'} Résultat : ${msg.status}`)
      if (msg.ipfsCID) console.log(`📦 IPFS CID : ${msg.ipfsCID}`)
      if (msg.txHash) console.log(`⛓️  TX Hash  : ${msg.txHash}`)
      if (msg.error) console.log(`⚠️  Erreur   : ${msg.error}`)
      setTimeout(() => { ws.close(); process.exit(0) }, 1000)
    }
  })

  ws.on('error', (err) => {
    console.error('❌ Erreur WebSocket :', err.message)
    process.exit(1)
  })

  // Timeout de sécurité
  setTimeout(() => {
    console.warn('\n⏱️ Timeout (30s) — fermeture')
    ws.close()
    process.exit(0)
  }, 300_000)
}

main()
