// FrontEnd/src/hooks/usePolicies.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const POLICY_ENGINE_ABI = [
  "function getAllPolicyTypes() view returns (string[])",
  "function getPolicy(string _actionType) view returns (tuple(string actionType, bytes32 minimumRole, bool requiresMultiSig, uint8 requiredSignatures, uint256 cooldownPeriod, uint256 expiryPeriod, bool active))",
  "function getPendingActionIds() view returns (bytes32[])",
  "function getPendingAction(bytes32 _actionId) view returns (tuple(bytes32 actionId, string actionType, address initiator, bytes actionData, address[] approvers, uint256 createdAt, uint256 expiresAt, bool executed, bool cancelled))"
]

export function usePolicies() {
  const { provider, isConnected } = useWeb3()
  const [policies, setPolicies]           = useState([])
  const [pendingActions, setPendingActions] = useState([])
  const [isLoading, setIsLoading]         = useState(true)
  const [error, setError]                 = useState(null)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchPolicies = async () => {
      try {
        setIsLoading(true)
        const policyEngine = new Contract(contracts.PolicyEngine, POLICY_ENGINE_ABI, provider)

        // 1. Récupérer tous les types de politiques
        const policyTypes = await policyEngine.getAllPolicyTypes()

        // 2. Récupérer chaque politique
        const policiesData = await Promise.all(
          policyTypes.map(async (type) => {
            const policy = await policyEngine.getPolicy(type)
            return {
              actionType:         policy.actionType,
              requiresMultiSig:   policy.requiresMultiSig,
              requiredSignatures: Number(policy.requiredSignatures),
              expiryPeriod:       Number(policy.expiryPeriod),
              active:             policy.active
            }
          })
        )

        // 3. Récupérer les actions en attente
        const pendingIds = await policyEngine.getPendingActionIds()
        const pendingData = await Promise.all(
          pendingIds.map(async (id) => {
            const action = await policyEngine.getPendingAction(id)
            return {
              actionId:   action.actionId,
              actionType: action.actionType,
              initiator:  action.initiator,
              approvers:  action.approvers,
              createdAt:  Number(action.createdAt),
              expiresAt:  Number(action.expiresAt),
              executed:   action.executed,
              cancelled:  action.cancelled
            }
          })
        )

        setPolicies(policiesData)
        setPendingActions(pendingData)
        setIsLoading(false)

      } catch (err) {
        console.error('usePolicies error:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    fetchPolicies()
  }, [provider, isConnected])

  return { policies, pendingActions, isLoading, error }
}