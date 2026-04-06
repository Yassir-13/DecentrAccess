// Agents/src/handlers/heartbeat.js
import blockchain from '../blockchain/client.js'
import { publish, getTopics } from '../p2p/node.js'
import config from '../../config.js'

const TOPICS = getTopics()
const HEARTBEAT_INTERVAL = 30000

let heartbeatTimer = null

export async function startHeartbeat() {
  console.log(`[Heartbeat] Démarrage — interval: ${HEARTBEAT_INTERVAL / 1000}s`)
  await sendHeartbeat()
  heartbeatTimer = setInterval(async () => {
    await sendHeartbeat()
  }, HEARTBEAT_INTERVAL)
}

async function sendHeartbeat() {
  try {
    await blockchain.sendHeartbeat()
    await publish(TOPICS.HEARTBEAT, {
      agentAddress: blockchain.wallet.address,
      hostname:     config.hostname,
      hasLDAP:      config.hasLDAP,
      timestamp:    Date.now()
    })
    console.log(`[Heartbeat] ✅ Envoyé — ${new Date().toISOString()}`)
  } catch (err) {
    console.error(`[Heartbeat] Erreur :`, err.message)
  }
}

export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
    console.log(`[Heartbeat] Arrêté`)
  }
}