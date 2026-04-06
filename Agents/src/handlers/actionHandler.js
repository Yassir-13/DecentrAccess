// Agents/src/handlers/actionHandler.js
import blockchain from '../blockchain/client.js'
import { publish, getTopics } from '../p2p/node.js'
import config from '../../config.js'

const TOPICS = getTopics()

export async function handleAction(data) {
  console.log(`\n[Action] Reçu : ${data.actionType} — signer: ${data.signer}`)

  try {
    // ═══ 1. Vérification on-chain ═══
    const isValid = await blockchain.isValidSigner(data.signer, data.actionType)
    if (!isValid) {
      console.warn(`[Action] ❌ Signer invalide — action ignorée`)
      return
    }
    console.log(`[Action] ✅ Signer validé on-chain`)

    // ═══ 2. Vérification signature ═══
    const isSignatureValid = verifySignature(data)
    if (!isSignatureValid) {
      console.warn(`[Action] ❌ Signature invalide — action ignorée`)
      return
    }
    console.log(`[Action] ✅ Signature vérifiée`)

    // ═══ 3. Élection ═══
    const actionHash = data.actionHash
    let executor = null

    try {
      executor = await blockchain.agentRegistry.electExecutor(actionHash)
    } catch (err) {
      console.warn(`[Action] Élection impossible :`, err.message)
    }

    const myAddress = blockchain.wallet.address.toLowerCase()

    if (executor && executor.toLowerCase() !== myAddress) {
      console.log(`[Action] Non élu — executor: ${executor} — skip`)
      return
    }

    if (!executor && !config.hasLDAP) {
      console.log(`[Action] Pas d'accès LDAP — skip`)
      return
    }

    console.log(`[Action] ✅ Élu pour l'exécution`)

    // ═══ 4. Exécution ═══
    const result = await executeAction(data)

    // ═══ 5. Broadcast résultat ═══
    await publish(TOPICS.RESULTS, {
      actionHash,
      actionType: data.actionType,
      status:     result.success ? 'success' : 'failed',
      error:      result.error || null,
      executor:   myAddress,
      timestamp:  Date.now()
    })

    console.log(`[Action] Résultat broadcasté — status: ${result.success ? 'success' : 'failed'}`)

  } catch (err) {
    console.error(`[Action] Erreur inattendue :`, err.message)
  }
}

async function executeAction(data) {
  console.log(`[Action] Exécution : ${data.actionType}`)

  switch (data.actionType) {
    case 'CREATE_USER':
      console.log(`[LDAP] → createUser(${data.payload?.username})`)
      return { success: true }
    case 'DELETE_USER':
      console.log(`[LDAP] → deleteUser(${data.payload?.username})`)
      return { success: true }
    case 'MODIFY_USER':
      console.log(`[LDAP] → modifyUser(${data.payload?.username})`)
      return { success: true }
    case 'RESET_PASSWORD':
      console.log(`[LDAP] → resetPassword(${data.payload?.username})`)
      return { success: true }
    case 'CREATE_GROUP':
      console.log(`[LDAP] → createGroup(${data.payload?.groupName})`)
      return { success: true }
    default:
      console.warn(`[Action] Type inconnu : ${data.actionType}`)
      return { success: false, error: `Action inconnue : ${data.actionType}` }
  }
}

function verifySignature(data) {
  // TODO : ethers.verifyMessage() — à implémenter
  return true
}