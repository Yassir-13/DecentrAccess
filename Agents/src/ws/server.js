// Agents/src/ws/server.js
import { WebSocketServer } from 'ws'
import { handleAction } from '../handlers/actionHandler.js'

const WS_PORT = 9001
let wss = null
const clients = new Set()

export function startWsServer() {
  wss = new WebSocketServer({ port: WS_PORT })

  wss.on('listening', () => {
    console.log(`[WS] ✅ Serveur WebSocket démarré — port ${WS_PORT}`)
  })

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`[WS] Dashboard connecté — ${clients.size} client(s)`)

    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        console.log(`[WS] Message reçu : ${data.actionType}`)
        await handleAction(data)
      } catch (err) {
        console.error('[WS] Erreur parsing message :', err.message)
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[WS] Dashboard déconnecté — ${clients.size} client(s)`)
    })

    ws.on('error', (err) => {
      console.error('[WS] Erreur client :', err.message)
      clients.delete(ws)
    })

    // Envoie un accusé de réception au Dashboard
    ws.send(JSON.stringify({ type: 'connected', message: 'Agent connecté' }))
  })

  wss.on('error', (err) => {
    console.error('[WS] Erreur serveur :', err.message)
  })
}

// Broadcast un résultat à tous les Dashboards connectés
export function broadcastResult(data) {
  const msg = JSON.stringify({ type: 'result', ...data })
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg)
    }
  }
}

export function stopWsServer() {
  if (wss) {
    wss.close()
    console.log('[WS] Serveur arrêté')
  }
}