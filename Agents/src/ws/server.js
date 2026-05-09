// Agents/src/ws/server.js
import { WebSocketServer } from 'ws'
import { handleAction } from '../handlers/actionHandler.js'
import { getReport } from '../ipfs/node.js'
import * as ldap from '../ldap/client.js'
import config from '../../config.js'

const WS_PORT = 9001
let wss = null
const clients = new Set()

// ═══ Tâche 2-6 : Push périodique AD ═══
const AD_SYNC_INTERVAL = 30_000  // 30 secondes
let adSyncTimer = null

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

        // ═══ Requête rapport IPFS ═══
        if (data.type === 'getReport') {
          try {
            console.log(`[WS] Récupération rapport IPFS — CID: ${data.cid}`)
            const report = await getReport(data.cid)
            console.log('[WS] Rapport récupéré :', JSON.stringify(report).slice(0, 200))
            ws.send(JSON.stringify({ type: 'report', cid: data.cid, report }))
          } catch (err) {
            console.error('[WS] Erreur getReport :', err.message)
            ws.send(JSON.stringify({ type: 'report', cid: data.cid, report: null, error: err.message }))
          }
          return
        }

        // ═══ Tâche 2-6 : Requête utilisateurs AD ═══
        if (data.type === 'getUsers') {
          await handleGetUsers(ws)
          return
        }

        // ═══ Tâche 2-6 : Requête groupes AD ═══
        if (data.type === 'getGroups') {
          await handleGetGroups(ws)
          return
        }

        // ═══ Action normale ═══
        console.log(`[WS] Message reçu : ${data.actionType}`)
        await handleAction(data)

      } catch (err) {
        console.error('[WS] Erreur parsing message :', err.message)
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[WS] Dashboard déconnecté — ${clients.size} client(s)`)

      // Arrêter le push périodique s'il n'y a plus de clients
      if (clients.size === 0 && adSyncTimer) {
        clearInterval(adSyncTimer)
        adSyncTimer = null
        console.log('[WS] Push AD arrêté — aucun client connecté')
      }
    })

    ws.on('error', (err) => {
      console.error('[WS] Erreur client :', err.message)
      clients.delete(ws)
    })

    ws.send(JSON.stringify({ type: 'connected', message: 'Agent connecté' }))

    // Démarrer le push périodique si LDAP disponible et pas encore actif
    if (config.hasLDAP && !adSyncTimer) {
      startADSync()
    }
  })

  wss.on('error', (err) => {
    console.error('[WS] Erreur serveur :', err.message)
  })
}

// ═══════════════════════════════════════════════════
// Tâche 2-6 : Handlers AD
// ═══════════════════════════════════════════════════

async function handleGetUsers(ws) {
  if (!config.hasLDAP) {
    ws.send(JSON.stringify({ type: 'AD_USERS', users: [], error: 'Agent sans accès LDAP' }))
    return
  }

  try {
    console.log('[WS] Requête getUsers — interrogation AD...')
    const users = await ldap.searchUsers()
    console.log(`[WS]  ${users.length} utilisateur(s) récupéré(s)`)
    ws.send(JSON.stringify({ type: 'AD_USERS', users, timestamp: Date.now() }))
  } catch (err) {
    console.error('[WS] Erreur getUsers :', err.message)
    ws.send(JSON.stringify({ type: 'AD_USERS', users: [], error: err.message }))
  }
}

async function handleGetGroups(ws) {
  if (!config.hasLDAP) {
    ws.send(JSON.stringify({ type: 'AD_GROUPS', groups: [], error: 'Agent sans accès LDAP' }))
    return
  }

  try {
    console.log('[WS] Requête getGroups — interrogation AD...')
    const groups = await ldap.searchGroups()
    console.log(`[WS]  ${groups.length} groupe(s) récupéré(s)`)
    ws.send(JSON.stringify({ type: 'AD_GROUPS', groups, timestamp: Date.now() }))
  } catch (err) {
    console.error('[WS] Erreur getGroups :', err.message)
    ws.send(JSON.stringify({ type: 'AD_GROUPS', groups: [], error: err.message }))
  }
}

// ═══════════════════════════════════════════════════
// Tâche 2-6 : Push périodique — broadcast à tous les clients
// ═══════════════════════════════════════════════════

function startADSync() {
  console.log(`[WS]  Push AD périodique activé — toutes les ${AD_SYNC_INTERVAL / 1000}s`)

  adSyncTimer = setInterval(async () => {
    if (clients.size === 0) return

    try {
      const users = await ldap.searchUsers()
      const groups = await ldap.searchGroups()
      const ts = Date.now()

      broadcastAD({ type: 'AD_USERS_UPDATE', users, timestamp: ts })
      broadcastAD({ type: 'AD_GROUPS_UPDATE', groups, timestamp: ts })

      console.log(`[WS]  Push AD — ${users.length} users, ${groups.length} groups → ${clients.size} client(s)`)
    } catch (err) {
      console.error('[WS] Erreur push AD périodique :', err.message)
    }
  }, AD_SYNC_INTERVAL)
}

function broadcastAD(data) {
  const msg = JSON.stringify(data)
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(msg)
    }
  }
}

// ═══════════════════════════════════════════════════

export function broadcastResult(data) {
  const msg = JSON.stringify({ type: 'result', ...data })
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(msg)
    }
  }
}

export function stopWsServer() {
  if (adSyncTimer) {
    clearInterval(adSyncTimer)
    adSyncTimer = null
  }
  if (wss) {
    wss.close()
    console.log('[WS] Serveur arrêté')
  }
}