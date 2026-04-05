// FrontEnd/src/hooks/useUsers.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const DID_REGISTRY_ABI = [
  "function getDIDsByType(uint8 _entityType) view returns (address[])",
  "function resolveDID(address _owner) view returns (tuple(address owner, string did, uint8 entityType, bytes32 publicKeyHash, string metadata, uint256 createdAt, uint256 updatedAt, bool active))"
]

const ACCESS_CONTROL_ABI = [
  "function hasRole(address account, bytes32 role) view returns (bool)",
  "function SUPER_ADMIN() view returns (bytes32)",
  "function ADMIN() view returns (bytes32)",
  "function OPERATOR() view returns (bytes32)",
  "function AUDITOR() view returns (bytes32)"
]

export function useUsers() {
  const { provider, isConnected } = useWeb3()
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchUsers = async () => {
      try {
        setIsLoading(true)

        const didRegistry   = new Contract(contracts.DIDRegistry,   DID_REGISTRY_ABI,   provider)
        const accessControl = new Contract(contracts.AccessControl, ACCESS_CONTROL_ABI, provider)

        // Récupérer les rôles bytes32
        const [SUPER_ADMIN, ADMIN, OPERATOR, AUDITOR] = await Promise.all([
          accessControl.SUPER_ADMIN(),
          accessControl.ADMIN(),
          accessControl.OPERATOR(),
          accessControl.AUDITOR()
        ])

        // Récupérer toutes les adresses de type Admin (EntityType = 0)
        const adminAddresses = await didRegistry.getDIDsByType(0)

        // Pour chaque adresse, récupérer le DID + le rôle
        const usersData = await Promise.all(
          adminAddresses.map(async (address) => {
            const didDoc = await didRegistry.resolveDID(address)
            const metadata = JSON.parse(didDoc.metadata)

            const [isSuperAdmin, isAdmin, isOperator, isAuditor] = await Promise.all([
              accessControl.hasRole(address, SUPER_ADMIN),
              accessControl.hasRole(address, ADMIN),
              accessControl.hasRole(address, OPERATOR),
              accessControl.hasRole(address, AUDITOR)
            ])

            let role = 'NO_ROLE'
            if (isSuperAdmin)   role = 'SUPER_ADMIN'
            else if (isAdmin)   role = 'ADMIN'
            else if (isOperator) role = 'OPERATOR'
            else if (isAuditor)  role = 'AUDITOR'

            return {
              address,
              did: didDoc.did,
              name: metadata.name || address,
              department: metadata.department || '—',
              role,
              active: didDoc.active,
              createdAt: Number(didDoc.createdAt)
            }
          })
        )

        setUsers(usersData)
        setIsLoading(false)

      } catch (err) {
        console.error('useUsers error:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    fetchUsers()
  }, [provider, isConnected])

  return { users, isLoading, error }
}