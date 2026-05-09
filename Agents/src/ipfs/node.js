// Agents/src/ipfs/node.js
import { createHelia } from 'helia'
import { json } from '@helia/json'
import { CID } from 'multiformats/cid'
import { FsBlockstore } from 'blockstore-fs'
import { FsDatastore } from 'datastore-fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'

const __dirname   = dirname(fileURLToPath(import.meta.url))
const STORAGE_DIR = join(__dirname, '../../ipfs-store-' + (process.env.AGENT_HOSTNAME || 'default'))

let heliaNode = null
let jsonStore = null

export async function initIPFS() {
  if (heliaNode) return

  console.log('[IPFS] Démarrage nœud Helia (stockage persistant)...')
  console.log('[IPFS] Répertoire :', STORAGE_DIR)

  const blockstore = new FsBlockstore(join(STORAGE_DIR, 'blocks'))
  const datastore  = new FsDatastore(join(STORAGE_DIR, 'data'))

  heliaNode = await createHelia({
    blockstore,
    datastore,
    libp2p: {
      transports:           [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers:         [yamux()]
    }
  })

  jsonStore = json(heliaNode)

  console.log('[IPFS] ✅ Nœud prêt — PeerId:', heliaNode.libp2p.peerId.toString())
  console.log('[IPFS] ✅ Stockage persistant activé')
}

export async function storeReport(data) {
  if (!jsonStore) throw new Error('[IPFS] Non initialisé — appeler initIPFS() d\'abord')
  const cid    = await jsonStore.add(data)
  const cidStr = cid.toString()
  console.log('[IPFS] ✅ Rapport stocké — CID:', cidStr)
  return cidStr
}

export async function getReport(cidStr) {
  if (!jsonStore) throw new Error('[IPFS] Non initialisé')
  const cid = CID.parse(cidStr)
  return await jsonStore.get(cid)
}

export async function stopIPFS() {
  if (heliaNode) {
    await heliaNode.stop()
    heliaNode = null
    jsonStore = null
    console.log('[IPFS] Nœud arrêté')
  }
}