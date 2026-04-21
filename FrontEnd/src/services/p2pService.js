// FrontEnd/src/services/p2pService.js
// WebSocket natif — connexion directe à l'agent sur port 9001

const AGENT_WS_URL = 'ws://127.0.0.1:9001'

let ws            = null
let resultHandler = null
let reconnectTimer = null

export async function initP2P() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(AGENT_WS_URL)

    ws.onopen = () => {
      console.log('[WS] ✅ Connecté à l\'agent')
      clearTimeout(reconnectTimer)
      resolve()
    }

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        if (data.type === 'connected') {
          console.log('[WS] Agent:', data.message)
        } else if (data.type === 'result' && resultHandler) {
          resultHandler(data)
        }
      } catch (err) {
        console.error('[WS] Erreur parsing :', err.message)
      }
    }

    ws.onerror = (err) => {
      console.error('[WS] ❌ Erreur connexion agent')
      reject(new Error('Connexion WebSocket échouée — agent démarré ?'))
    }

    ws.onclose = () => {
      console.warn('[WS] Connexion fermée — reconnexion dans 3s...')
      reconnectTimer = setTimeout(() => initP2P(), 3000)
    }
  })
}

export async function publishAction(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('[WS] Non connecté à l\'agent')
  }
  ws.send(JSON.stringify(data))
  console.log('[WS] Action envoyée :', data.actionType)
}

export function onResult(handler) {
  resultHandler = handler
}

export function stopP2P() {
  clearTimeout(reconnectTimer)
  if (ws) {
    ws.onclose = null  // évite la reconnexion auto
    ws.close()
    ws = null
  }
}

export function isConnected() {
  return ws?.readyState === WebSocket.OPEN
}

// Gardé pour compatibilité avec Web3Context
export function setAgentPeerId() {}