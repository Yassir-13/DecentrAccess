// FrontEnd/src/services/p2pService.js
const AGENT_WS_URL = 'ws://127.0.0.1:9001'

let ws             = null
let reconnectTimer = null
let isInitializing = false

const reportCache    = {}
const pendingReports = {}

// ═══ Système de handlers par type de message ═══
// Un seul handler par type — le dashboard utilise un switch
// donc un seul composant (Users OU Groups) est monté à la fois.
// Ex: onMessage('AD_GROUPS', handler), onMessage('result', handler)
const messageHandlers = {}

function dispatch(data) {
  // Handler spécifique au type
  if (data.type && messageHandlers[data.type]) {
    messageHandlers[data.type](data)
  }
  // Handler wildcard 'AD_*' pour tous les messages AD
  if (data.type?.startsWith('AD_') && messageHandlers['AD_*']) {
    messageHandlers['AD_*'](data)
  }
}

export async function initP2P() {
  if (ws?.readyState === WebSocket.OPEN) return
  if (isInitializing) return

  isInitializing = true

  return new Promise((resolve, reject) => {
    ws = new WebSocket(AGENT_WS_URL)

    ws.onopen = () => {
      isInitializing = false
      console.log('[WS] ✅ Connecté à l\'agent')
      clearTimeout(reconnectTimer)
      resolve()
    }

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)

        if (data.type === 'connected') {
          console.log('[WS] Agent:', data.message)

        } else if (data.type === 'result') {
          dispatch(data)

        } else if (data.type === 'report' && data.cid) {
          if (data.report) reportCache[data.cid] = data.report
          if (pendingReports[data.cid]) {
            pendingReports[data.cid](data.report || null)
            delete pendingReports[data.cid]
          }

        } else if (data.type?.startsWith('AD_')) {
          dispatch(data)
        }

      } catch (err) {
        console.error('[WS] Erreur parsing :', err.message)
      }
    }

    ws.onerror = () => {
      isInitializing = false
      console.error('[WS] ❌ Erreur connexion agent')
      reject(new Error('Connexion WebSocket échouée — agent démarré ?'))
    }

    ws.onclose = () => {
      isInitializing = false
      console.warn('[WS] Connexion fermée — reconnexion dans 3s...')
      Object.keys(pendingReports).forEach(cid => {
        pendingReports[cid](null)
        delete pendingReports[cid]
      })
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

// ═══ Requête de données (getGroups, getUsers) ═══
export function sendRequest(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[WS] sendRequest ignoré — non connecté')
    return false
  }
  console.log('[WS] sendRequest :', payload.type)
  ws.send(JSON.stringify(payload))
  return true
}

// ═══ S'abonner à un type de message spécifique ═══
// Un seul handler par type (le dernier enregistré gagne)
export function onMessage(type, handler) {
  messageHandlers[type] = handler
}

// ═══ Se désabonner ═══
export function offMessage(type) {
  delete messageHandlers[type]
}

export function fetchReport(cid) {
  return new Promise((resolve) => {
    if (reportCache[cid]) { resolve(reportCache[cid]); return }
    if (!ws || ws.readyState !== WebSocket.OPEN) { resolve(null); return }

    const timeout = setTimeout(() => {
      delete pendingReports[cid]
      resolve(null)
    }, 5000)

    pendingReports[cid] = (report) => {
      clearTimeout(timeout)
      resolve(report)
    }

    ws.send(JSON.stringify({ type: 'getReport', cid }))
  })
}

// onResult — un seul handler actif (le composant monté)
export function onResult(handler) {
  messageHandlers['result'] = handler
}

export function offResult() {
  delete messageHandlers['result']
}

export function isWsConnected()  { return ws?.readyState === WebSocket.OPEN }
export function setAgentPeerId() {}

export function stopP2P() {
  clearTimeout(reconnectTimer)
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
}