// FrontEnd/src/hooks/useAlerts.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const ALERT_MANAGER_ABI = [
  "function getAllRules() view returns (tuple(bytes32 ruleId, string name, string condition, uint8 severity, bool active, address createdBy, uint256 createdAt)[])",
  "function getActiveAlerts() view returns (tuple(uint256 alertId, bytes32 ruleId, uint8 severity, string description, string ipfsCID, address triggeredBy, uint256 timestamp, bool acknowledged, address acknowledgedBy, uint256 acknowledgedAt)[])"
]

const SEVERITY_LABELS = { 0: 'LOW', 1: 'MEDIUM', 2: 'HIGH', 3: 'CRITICAL' }
const SEVERITY_BADGES = { 0: 'success', 1: 'info', 2: 'warning', 3: 'danger' }

export function useAlerts() {
  const { provider, isConnected } = useWeb3()
  const [rules, setRules]   = useState([])
  const [alerts, setAlerts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchAlerts = async () => {
      try {
        setIsLoading(true)
        const alertManager = new Contract(contracts.AlertManager, ALERT_MANAGER_ABI, provider)

        const [rawRules, rawAlerts] = await Promise.all([
          alertManager.getAllRules(),
          alertManager.getActiveAlerts()
        ])

        setRules(rawRules.map(r => ({
          ruleId:    r.ruleId,
          name:      r.name,
          condition: r.condition,
          severity:  SEVERITY_LABELS[Number(r.severity)],
          severityBadge: SEVERITY_BADGES[Number(r.severity)],
          active:    r.active,
          createdBy: r.createdBy,
          createdAt: Number(r.createdAt)
        })))

        setAlerts(rawAlerts.map(a => ({
          alertId:       Number(a.alertId),
          ruleId:        a.ruleId,
          severity:      SEVERITY_LABELS[Number(a.severity)],
          severityBadge: SEVERITY_BADGES[Number(a.severity)],
          description:   a.description,
          triggeredBy:   a.triggeredBy,
          timestamp:     Number(a.timestamp),
          acknowledged:  a.acknowledged,
        })))

        setIsLoading(false)
      } catch (err) {
        console.error('useAlerts error:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    fetchAlerts()
  }, [provider, isConnected])

  return { rules, alerts, isLoading, error }
}