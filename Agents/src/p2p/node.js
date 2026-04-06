import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mdns } from '@libp2p/mdns'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'          // ← ajoute

const TOPICS = {
  ACTIONS:   'decentraccess/actions',
  RESULTS:   'decentraccess/results',
  EVENTS:    'decentraccess/events',
  HEARTBEAT: 'decentraccess/heartbeat'
}

let node = null

export async function initP2P() {
  node = await createLibp2p({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    transports: [tcp()],
    peerDiscovery: [mdns()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),                           // ← ajoute
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true
      })
    }
  })

  await node.start()

  const peerId = node.peerId.toString()
  console.log(`[P2P] Nœud démarré — PeerID: ${peerId}`)
  console.log(`[P2P] Adresses : ${node.getMultiaddrs().map(a => a.toString()).join(', ')}`)

  node.services.pubsub.subscribe(TOPICS.ACTIONS)
  node.services.pubsub.subscribe(TOPICS.HEARTBEAT)
  console.log(`[P2P] Abonné aux topics : actions, heartbeat`)

  node.addEventListener('peer:discovery', (evt) => {
    console.log(`[P2P] Pair découvert : ${evt.detail.id.toString()}`)
  })

  node.addEventListener('peer:connect', (evt) => {
    console.log(`[P2P] Pair connecté : ${evt.detail.toString()}`)
  })

  return node
}

export async function publish(topic, data) {
  if (!node) throw new Error('P2P non initialisé')
  const msg = Buffer.from(JSON.stringify(data))
  await node.services.pubsub.publish(topic, msg)
}

export function subscribe(topic, handler) {
  if (!node) throw new Error('P2P non initialisé')
  node.services.pubsub.addEventListener('message', (evt) => {
    if (evt.detail.topic === topic) {
      try {
        const data = JSON.parse(Buffer.from(evt.detail.data).toString())
        handler(data)
      } catch (err) {
        console.error(`[P2P] Erreur parsing message :`, err.message)
      }
    }
  })
}

export function getNode() { return node }
export function getPeerId() { return node?.peerId.toString() }
export function getTopics() { return TOPICS }