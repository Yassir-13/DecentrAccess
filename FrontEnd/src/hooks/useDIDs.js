// FrontEnd/src/hooks/useDIDs.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const DID_REGISTRY_ABI = [
  "function getDIDsByType(uint8 _entityType) view returns (address[])",
  "function resolveDID(address _owner) view returns (tuple(address owner, string did, uint8 entityType, bytes32 publicKeyHash, string metadata, uint256 createdAt, uint256 updatedAt, bool active))",
  "function deactivateDID(address _owner) external",
  "function reactivateDID(address _owner) external"
]

const ENTITY_TYPE = { 0: 'Admin', 1: 'Machine', 2: 'Service' }

export function useDIDs() {
  const { provider, isConnected } = useWeb3()
  const [dids, setDids]         = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState(null)

  const fetchDIDs = async () => {
    if (!isConnected || !provider) return
    try {
      setIsLoading(true)
      const didRegistry = new Contract(contracts.DIDRegistry, DID_REGISTRY_ABI, provider)

      // Récupérer les 3 types en parallèle
      const [adminAddrs, machineAddrs, serviceAddrs] = await Promise.all([
        didRegistry.getDIDsByType(0),
        didRegistry.getDIDsByType(1),
        didRegistry.getDIDsByType(2)
      ])

      const allEntries = [
        ...adminAddrs.map(a => ({ address: a, entityType: 0 })),
        ...machineAddrs.map(a => ({ address: a, entityType: 1 })),
        ...serviceAddrs.map(a => ({ address: a, entityType: 2 }))
      ]

      const didsData = await Promise.all(
        allEntries.map(async ({ address, entityType }) => {
          const doc = await didRegistry.resolveDID(address)
          let metadata = {}
          try { metadata = JSON.parse(doc.metadata) } catch {}
          return {
            address,
            did:        doc.did,
            entityType: ENTITY_TYPE[entityType] || 'Unknown',
            name:       metadata.name || address,
            hostname:   metadata.hostname || '—',
            createdAt:  Number(doc.createdAt),
            updatedAt:  Number(doc.updatedAt),
            active:     doc.active
          }
        })
      )

      // Trier : actifs en premier, puis par date de création
      didsData.sort((a, b) => (b.active - a.active) || (b.createdAt - a.createdAt))
      setDids(didsData)
      setIsLoading(false)
    } catch (err) {
      console.error('useDIDs error:', err)
      setError(err.message)
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchDIDs() }, [provider, isConnected])

  return { dids, isLoading, error, refetch: fetchDIDs }
}