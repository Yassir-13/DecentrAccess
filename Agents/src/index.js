// Agents/src/index.js
import blockchain from './blockchain/client.js'
import { initP2P, subscribe, getTopics } from './p2p/node.js'
import { handleAction } from './handlers/actionHandler.js'
import { startHeartbeat, stopHeartbeat } from './handlers/heartbeat.js'
import { initIPFS, stopIPFS } from './ipfs/node.js'
import { startWsServer, stopWsServer } from './ws/server.js'

const TOPICS = getTopics()

async function main() {
  console.log('╔═══════════════════════════════════════╗')
  console.log('║     DecentrAccess Agent v1.0          ║')
  console.log('╚═══════════════════════════════════════╝\n')

  try {
    // ═══ 1. Vérification DID on-chain ═══
    console.log('[Init] Vérification identité on-chain...')
    const hasDID = await blockchain.isDIDActive(blockchain.wallet.address)
    if (!hasDID) {
      console.error('[Init] ❌ Ce wallet n\'a pas de DID actif — arrêt')
      process.exit(1)
    }
    console.log(`[Init] ✅ DID actif — ${blockchain.wallet.address}`)

    // ═══ 2. Enregistrement dans AgentRegistry ═══
    console.log('[Init] Enregistrement dans AgentRegistry...')
    await blockchain.registerAgent()

    // ═══ 3. Init IPFS ═══
    console.log('[Init] Démarrage nœud IPFS...')
    await initIPFS()

    // ═══ 4. Init P2P ═══
    console.log('[Init] Démarrage nœud P2P...')
    const p2pNode = await initP2P()
    const peerId  = p2pNode.peerId.toString()
    console.log(`[Init] PeerID : ${peerId}`)

    // ═══ 5. Démarrage serveur WebSocket (Dashboard) ═══
    startWsServer()

    // ═══ 6. Écoute des actions P2P (autres agents) ═══
    subscribe(TOPICS.ACTIONS, handleAction)
    console.log('[Init] ✅ En écoute sur le topic actions')

    // ═══ 7. Démarrage heartbeat ═══
    await startHeartbeat()

    console.log('\n[Init] ✅ Agent opérationnel — en attente d\'actions...\n')

    // ═══ Arrêt propre ═══
    process.on('SIGINT', async () => {
      console.log('\n[Shutdown] Arrêt en cours...')
      stopHeartbeat()
      stopWsServer()
      await stopIPFS()
      await p2pNode.stop()
      console.log('[Shutdown] Agent arrêté proprement')
      process.exit(0)
    })

  } catch (err) {
    console.error('[Init] Erreur fatale :', err)
    process.exit(1)
  }
}

main()