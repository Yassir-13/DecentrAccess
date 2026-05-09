// Agents/src/handlers/actionHandler.js
import { ethers } from 'ethers'
import blockchain from '../blockchain/client.js'
import { publish, getTopics } from '../p2p/node.js'
import { storeReport } from '../ipfs/node.js'
import { broadcastResult } from '../ws/server.js'
import * as ldap from '../ldap/client.js'
import config from '../../config.js'

const TOPICS = getTopics()

export async function handleAction(data) {
  console.log(`\n[Action] Reçu : ${data.actionType} — signer: ${data.signer}`)

  try {
    // ═══ 1. Vérification on-chain ═══
    const isValid = await blockchain.isValidSigner(data.signer, data.actionType)
    if (!isValid) {
      console.warn(`[Action] ❌ Signer invalide`)
      broadcastResult({ status: 'failed', error: 'Signer invalide ou permission refusée', actionType: data.actionType })
      return
    }
    console.log(`[Action] ✅ Signer validé on-chain`)

    // ═══ 2. Vérification signature ═══
    const isSignatureValid = verifySignature(data)
    if (!isSignatureValid) {
      console.warn(`[Action] ❌ Signature invalide`)
      broadcastResult({ status: 'failed', error: 'Signature cryptographique invalide', actionType: data.actionType })
      return
    }
    console.log(`[Action] ✅ Signature vérifiée`)

    // ═══ 3. Élection — robuste (tâche 2-7) ═══
    const actionHash = data.actionHash
    const myAddress  = blockchain.wallet.address.toLowerCase()
    let executor     = null
    let electionFailed = false

    try {
      executor = await blockchain.agentRegistry.electExecutor(actionHash)
    } catch (err) {
      // P7 fix : on ne fait plus de fallback silencieux sur hasLDAP
      // On log l'erreur et on broadcast l'échec d'élection
      electionFailed = true
      console.error(`[Action] ❌ Élection échouée :`, err.message)
      broadcastResult({
        status:     'election_failed',
        error:      `Élection impossible : ${err.message}`,
        actionType: data.actionType,
        actionHash
      })
      return
    }

    if (executor.toLowerCase() !== myAddress) {
      // Vérifier si l'agent élu est en ligne — sinon on prend le relais
      let electedIsOnline = false
      try {
        electedIsOnline = await blockchain.agentRegistry.isAgentOnline(executor)
      } catch (_) {}

      if (electedIsOnline) {
        console.log(`[Action] Non élu — executor: ${executor} (en ligne) — skip`)
        return
      }

      // L'élu est hors ligne — on prend le relais si on a LDAP
      if (!config.hasLDAP) {
        console.warn(`[Action] ⚠️ Élu hors ligne, mais cet agent n'a pas LDAP — abandon`)
        broadcastResult({
          status:     'failed',
          error:      `Agent élu (${executor.slice(0,10)}…) hors ligne, aucun agent LDAP disponible`,
          actionType: data.actionType,
          actionHash
        })
        return
      }

      console.warn(`[Action] ⚠️ Élu ${executor.slice(0,10)}… hors ligne — prise en charge par cet agent`)
    }

    // Élu mais pas d'accès LDAP → on ne peut pas exécuter
    if (!config.hasLDAP) {
      console.warn(`[Action] ⚠️ Élu mais hasLDAP=false — impossible d'exécuter`)
      broadcastResult({
        status:     'failed',
        error:      'Agent élu sans accès LDAP',
        actionType: data.actionType,
        actionHash
      })
      return
    }

    console.log(`[Action] ✅ Élu pour l'exécution`)

    // ═══ 4. Exécution LDAP ═══
    const result = await executeAction(data)

    // ═══ 5. IPFS + AuditLog ═══
    let ipfsCID = null
    let txHash  = null

    if (result.success) {
      try {
        const report = {
          actionHash,
          actionType: data.actionType,
          payload:    data.payload,
          signer:     data.signer,
          executor:   myAddress,
          result,
          timestamp:  Date.now(),
          network:    `geth-poa-${config.chainId}`
        }

        ipfsCID = await storeReport(report)
        console.log(`[Action] ✅ Rapport IPFS — CID: ${ipfsCID}`)

        txHash = await blockchain.logAction(actionHash, data.actionType, ipfsCID, data.signature)
        console.log(`[Action] ✅ AuditLog ancré — tx: ${txHash}`)

      } catch (err) {
        console.error(`[Action] ⚠️ Erreur IPFS/AuditLog :`, err.message)
      }
    }

    // ═══ 6. Broadcast résultat ═══
    const resultData = {
      actionHash,
      actionType: data.actionType,
      status:     result.success ? 'success' : 'failed',
      error:      result.error  || null,
      executor:   myAddress,
      ipfsCID,
      txHash,
      timestamp:  Date.now()
    }

    broadcastResult(resultData)

    try {
      await publish(TOPICS.RESULTS, resultData)
    } catch (err) {
      console.warn(`[Action] P2P broadcast ignoré :`, err.message)
    }

    console.log(`[Action] Résultat broadcasté — status: ${result.success ? 'success' : 'failed'}`)

  } catch (err) {
    console.error(`[Action] Erreur inattendue :`, err.message)
    broadcastResult({ status: 'failed', error: err.message, actionType: data.actionType })
  }
}

// ═══ Exécution LDAP ═══
async function executeAction(data) {
  console.log(`[LDAP] Exécution : ${data.actionType}`)

  // Mode mock pour les agents sans accès LDAP (tests locaux)
  if (!config.hasLDAP) {
    console.log(`[LDAP] Mode mock (hasLDAP=false)`)
    return { success: true, details: `Mock : ${data.actionType}` }
  }

  try {
    switch (data.actionType) {

      // ── Users ──────────────────────────────────────
      case 'CREATE_USER': {
        const res = await ldap.createUser(data.payload)
        return { success: true, details: res }
      }
      case 'ACTIVATE_USER': {
        const res = await ldap.activateUser(data.payload)
        return { success: true, details: res }
      }
      case 'DISABLE_USER': {
        const res = await ldap.disableUser(data.payload)
        return { success: true, details: res }
      }
      case 'ENABLE_USER': {
        const res = await ldap.enableUser(data.payload)
        return { success: true, details: res }
      }
      case 'DELETE_USER': {
        const res = await ldap.deleteUser(data.payload)
        return { success: true, details: res }
      }
      case 'MODIFY_USER': {
        const res = await ldap.modifyUser(data.payload)
        return { success: true, details: res }
      }
      case 'RESET_PASSWORD': {
        const res = await ldap.resetPassword(data.payload)
        return { success: true, details: res }
      }

      // ── Groups ─────────────────────────────────────
      case 'CREATE_GROUP': {
        const res = await ldap.createGroup(data.payload)
        return { success: true, details: res }
      }
      case 'ADD_TO_GROUP': {
        const res = await ldap.addMemberToGroup(data.payload)
        return { success: true, details: res }
      }
      case 'REMOVE_FROM_GROUP': {
        const res = await ldap.removeMemberFromGroup(data.payload)
        return { success: true, details: res }
      }

      default:
        console.warn(`[LDAP] Type inconnu : ${data.actionType}`)
        return { success: false, error: `Action inconnue : ${data.actionType}` }
    }
  } catch (err) {
    console.error(`[LDAP] Erreur exécution :`, err.message)
    return { success: false, error: err.message }
  }
}

// ═══ Vérification signature ═══
function verifySignature(data) {
  try {
    const message   = JSON.stringify({ actionType: data.actionType, payload: data.payload })
    const recovered = ethers.verifyMessage(message, data.signature)
    const valid     = recovered.toLowerCase() === data.signer.toLowerCase()
    if (!valid) console.warn(`[Signature] Récupéré: ${recovered} ≠ attendu: ${data.signer}`)
    return valid
  } catch (err) {
    console.warn(`[Signature] Erreur :`, err.message)
    return false
  }
}