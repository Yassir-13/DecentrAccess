// Agents/src/ipfs/node.js
import { createHelia } from 'helia'
import { json } from '@helia/json'
import { CID } from 'multiformats/cid'

let heliaNode = null
let jsonStore = null

export async function initIPFS() {
  if (heliaNode) return
  console.log('[IPFS] Démarrage nœud Helia...')
  heliaNode = await createHelia()
  jsonStore = json(heliaNode)
  console.log('[IPFS] ✅ Nœud prêt — PeerId:', heliaNode.libp2p.peerId.toString())
}

export async function storeReport(data) {
  if (!jsonStore) throw new Error('[IPFS] Non initialisé — appeler initIPFS() d\'abord')
  const cid = await jsonStore.add(data)
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