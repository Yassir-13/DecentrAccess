// FrontEnd/src/hooks/useStats.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const ALERT_MANAGER_ABI = [
  "function getRuleCount() view returns (uint256)",
  "function activeAlertCount() view returns (uint256)"
]

const POLICY_ENGINE_ABI = [
  "function getPendingActionIds() view returns (bytes32[])"
]

const AD_STATE_ANCHOR_ABI = [
  "function driftDetected() view returns (bool)"
]

const DID_REGISTRY_ABI = [
  "function totalDIDs() view returns (uint256)"
]

export function useStats() {
  const { provider, isConnected } = useWeb3()

  const [stats, setStats] = useState({
    totalDIDs: 0,
    activeAlerts: 0,
    pendingActions: 0,
    driftDetected: false,
    isLoading: true,
    error: null
  })

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchStats = async () => {
      try {
        const didRegistry   = new Contract(contracts.DIDRegistry,   DID_REGISTRY_ABI,    provider)
        const alertManager  = new Contract(contracts.AlertManager,  ALERT_MANAGER_ABI,   provider)
        const policyEngine  = new Contract(contracts.PolicyEngine,  POLICY_ENGINE_ABI,   provider)
        const adStateAnchor = new Contract(contracts.ADStateAnchor, AD_STATE_ANCHOR_ABI, provider)

        const [totalDIDs, activeAlerts, pendingActionIds, driftDetected] = await Promise.all([
            didRegistry.totalDIDs(),
            alertManager.activeAlertCount(),
            policyEngine.getPendingActionIds(),
            adStateAnchor.driftDetected()
            ])

        setStats({
          totalDIDs:      Number(totalDIDs),
          activeAlerts:   Number(activeAlerts),
          pendingActions: pendingActionIds.length,
          driftDetected:  driftDetected,
          isLoading: false,
          error: null
        })

      } catch (err) {
        console.error('useStats error:', err)
        setStats(prev => ({ ...prev, isLoading: false, error: err.message }))
      }
    }

    fetchStats()
  }, [provider, isConnected])

  return stats
}