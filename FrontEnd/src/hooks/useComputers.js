// FrontEnd/src/hooks/useComputers.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const DID_REGISTRY_ABI = [
  "function getDIDsByType(uint8 _entityType) view returns (address[])",
  "function resolveDID(address _owner) view returns (tuple(address owner, string did, uint8 entityType, bytes32 publicKeyHash, string metadata, uint256 createdAt, uint256 updatedAt, bool active))"
]

export function useComputers() {
  const { provider, isConnected } = useWeb3()
  const [computers, setComputers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchComputers = async () => {
      try {
        setIsLoading(true)
        const didRegistry = new Contract(contracts.DIDRegistry, DID_REGISTRY_ABI, provider)

        // EntityType.Machine = 1
        const machineAddresses = await didRegistry.getDIDsByType(1)

        const computersData = await Promise.all(
          machineAddresses.map(async (address) => {
            const didDoc  = await didRegistry.resolveDID(address)
            const metadata = JSON.parse(didDoc.metadata)

            return {
              address,
              hostname: metadata.hostname || address,
              hasLDAP:  metadata.hasLDAP || false,
              active:   didDoc.active,
              did:      didDoc.did,
            }
          })
        )

        setComputers(computersData)
        setIsLoading(false)

      } catch (err) {
        console.error('useComputers error:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    fetchComputers()
  }, [provider, isConnected])

  return { computers, isLoading, error }
}