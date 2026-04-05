// FrontEnd/src/hooks/useIdentity.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

// ABIs minimaux — uniquement les fonctions qu'on utilise
const DID_REGISTRY_ABI = [
  "function isDIDActive(address _owner) view returns (bool)",
  "function resolveDID(address _owner) view returns (tuple(address owner, string did, uint8 entityType, bytes32 publicKeyHash, string metadata, uint256 createdAt, uint256 updatedAt, bool active))"
]

const ACCESS_CONTROL_ABI = [
  "function hasRole(address account, bytes32 role) view returns (bool)",
  "function SUPER_ADMIN() view returns (bytes32)",
  "function ADMIN() view returns (bytes32)",
  "function OPERATOR() view returns (bytes32)",
  "function AUDITOR() view returns (bytes32)"
]

export function useIdentity() {
  const { provider, address, isConnected } = useWeb3()

  const [identity, setIdentity] = useState({
    hasDID: false,
    role: null,
    metadata: null,
    isLoading: true,
    error: null
  })

  useEffect(() => {
    if (!isConnected || !provider || !address) {
      setIdentity({ hasDID: false, role: null, metadata: null, isLoading: false, error: null })
      return
    }

    const checkIdentity = async () => {
      try {
        setIdentity(prev => ({ ...prev, isLoading: true, error: null }))

        const didRegistry   = new Contract(contracts.DIDRegistry,   DID_REGISTRY_ABI,   provider)
        const accessControl = new Contract(contracts.AccessControl, ACCESS_CONTROL_ABI, provider)

        // 1. Est-ce que cet adresse a un DID actif ?
        const hasDID = await didRegistry.isDIDActive(address)

        if (!hasDID) {
          setIdentity({ hasDID: false, role: null, metadata: null, isLoading: false, error: null })
          return
        }

        // 2. Récupérer les métadonnées du DID
        const didDoc = await didRegistry.resolveDID(address)
        const metadata = JSON.parse(didDoc.metadata)

        // 3. Quel est son rôle ?
        const [SUPER_ADMIN, ADMIN, OPERATOR, AUDITOR] = await Promise.all([
          accessControl.SUPER_ADMIN(),
          accessControl.ADMIN(),
          accessControl.OPERATOR(),
          accessControl.AUDITOR()
        ])

        const [isSuperAdmin, isAdmin, isOperator, isAuditor] = await Promise.all([
          accessControl.hasRole(address, SUPER_ADMIN),
          accessControl.hasRole(address, ADMIN),
          accessControl.hasRole(address, OPERATOR),
          accessControl.hasRole(address, AUDITOR)
        ])

        let role = null
        if (isSuperAdmin) role = 'SUPER_ADMIN'
        else if (isAdmin)  role = 'ADMIN'
        else if (isOperator) role = 'OPERATOR'
        else if (isAuditor)  role = 'AUDITOR'

        setIdentity({ hasDID: true, role, metadata, isLoading: false, error: null })

      } catch (err) {
        console.error('Erreur useIdentity :', err)
        setIdentity(prev => ({ ...prev, isLoading: false, error: err.message }))
      }
    }

    checkIdentity()
  }, [provider, address, isConnected])

  return identity
}