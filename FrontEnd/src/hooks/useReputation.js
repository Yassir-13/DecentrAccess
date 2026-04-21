// FrontEnd/src/hooks/useReputation.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const REPUTATION_ABI = [
  "function getScore(address account) view returns (uint256)"
]

const DID_REGISTRY_ABI = [
  "function getDIDsByType(uint8 _entityType) view returns (address[])",
  "function resolveDID(address _owner) view returns (tuple(address owner, string did, uint8 entityType, bytes32 publicKeyHash, string metadata, uint256 createdAt, uint256 updatedAt, bool active))"
]

export function useReputation() {
  const { provider, isConnected } = useWeb3()
  const [scores, setScores]       = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState(null)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchScores = async () => {
      try {
        setIsLoading(true)
        const reputation  = new Contract(contracts.ReputationScore, REPUTATION_ABI,  provider)
        const didRegistry = new Contract(contracts.DIDRegistry,     DID_REGISTRY_ABI, provider)

        const adminAddresses = await didRegistry.getDIDsByType(0)

        const data = await Promise.all(
          adminAddresses.map(async (address) => {
            const [didDoc, score] = await Promise.all([
              didRegistry.resolveDID(address),
              reputation.getScore(address)
            ])
            const metadata = JSON.parse(didDoc.metadata)
            return {
              address,
              name:       metadata.name || address,
              department: metadata.department || '—',
              score:      Number(score),
              active:     didDoc.active
            }
          })
        )

        // Trier par score décroissant
        data.sort((a, b) => b.score - a.score)
        setScores(data)
        setIsLoading(false)
      } catch (err) {
        console.error('useReputation error:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    fetchScores()
  }, [provider, isConnected])

  return { scores, isLoading, error }
}