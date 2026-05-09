// FrontEnd/src/hooks/useRecentActivity.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import { fetchReport } from '../services/p2pService'
import contracts from '../config/contracts.json'

const AUDIT_LOG_ABI = [
  "function getLatestLogs(uint256 _count) view returns (tuple(bytes32 actionHash, string actionType, string ipfsCID, address signer, bytes signature, uint256 timestamp, uint256 blockNumber)[])",
  "function getLogCount() view returns (uint256)"
]

const DID_REGISTRY_ABI = [
  "function resolveDID(address _owner) view returns (tuple(address owner, string did, uint8 entityType, bytes32 publicKeyHash, string metadata, uint256 createdAt, uint256 updatedAt, bool active))"
]

const ACTION_LABELS = {
  CREATE_USER:    'Création utilisateur',
  DELETE_USER:    'Suppression utilisateur',
  MODIFY_USER:    'Modification utilisateur',
  RESET_PASSWORD: 'Réinitialisation mot de passe',
  CREATE_GROUP:   'Création groupe',
  REVOKE_ADMIN:   'Révocation admin',
  DEACTIVATE_DID: 'Désactivation DID',
}

const ACTION_BADGES = {
  CREATE_USER:    'info',
  DELETE_USER:    'danger',
  MODIFY_USER:    'purple',
  RESET_PASSWORD: 'warning',
  CREATE_GROUP:   'success',
  REVOKE_ADMIN:   'danger',
  DEACTIVATE_DID: 'danger',
}

function timeAgo(timestamp) {
  const now  = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60)        return 'À l\'instant'
  if (diff < 3600)      return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400)     return `Il y a ${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `Il y a ${Math.floor(diff / 86400)} jour(s)`
  return new Date(timestamp * 1000).toLocaleDateString('fr-FR')
}

function formatActionLabel(actionType, report) {
  if (!report?.payload) return ACTION_LABELS[actionType] || actionType
  const p = report.payload
  switch (actionType) {
    case 'CREATE_USER':    return `Création utilisateur ${p.username || ''}`
    case 'DELETE_USER':    return `Suppression utilisateur ${p.username || ''}`
    case 'MODIFY_USER':    return `Modification utilisateur ${p.username || ''}`
    case 'RESET_PASSWORD': return `Réinitialisation MDP — ${p.username || ''}`
    case 'CREATE_GROUP':   return `Création groupe ${p.groupName || ''}`
    default: return ACTION_LABELS[actionType] || actionType
  }
}

// Cache nom des signataires
const nameCache = {}

export function useRecentActivity(limit = 6) {
  const { provider, isConnected } = useWeb3()
  const [activities, setActivities] = useState([])
  const [isLoading, setIsLoading]   = useState(true)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchActivities = async () => {
      try {
        setIsLoading(true)

        const auditLog    = new Contract(contracts.AuditLog,    AUDIT_LOG_ABI,    provider)
        const didRegistry = new Contract(contracts.DIDRegistry, DID_REGISTRY_ABI, provider)

        const count = Number(await auditLog.getLogCount())
        if (count === 0) {
          setActivities([])
          setIsLoading(false)
          return
        }

        const logs = await auditLog.getLatestLogs(Math.min(count, limit))

        const result = await Promise.all(logs.map(async (log) => {
          // 1. Résoudre le nom du signataire
          let userName = `${log.signer.slice(0, 6)}...${log.signer.slice(-4)}`
          try {
            if (nameCache[log.signer]) {
              userName = nameCache[log.signer]
            } else {
              const didDoc = await didRegistry.resolveDID(log.signer)
              const meta   = JSON.parse(didDoc.metadata)
              userName     = meta.name || meta.hostname || userName
              nameCache[log.signer] = userName
            }
          } catch {}

          // 2. Récupérer le rapport IPFS via la connexion WS existante
          let report = null
          if (log.ipfsCID) {
            report = await fetchReport(log.ipfsCID)
          }

          // 3. Formater le label avec le détail du payload
          const actionLabel = formatActionLabel(log.actionType, report)

          return {
            action:      actionLabel,
            user:        userName,
            type:        log.actionType,
            typeBadge:   ACTION_BADGES[log.actionType] || 'info',
            status:      'Exécuté',
            statusBadge: 'success',
            date:        timeAgo(Number(log.timestamp)),
            ipfsCID:     log.ipfsCID
          }
        }))

        setActivities(result)
        setIsLoading(false)
      } catch (err) {
        console.error('useRecentActivity error:', err)
        setIsLoading(false)
      }
    }

    fetchActivities()
    const interval = setInterval(fetchActivities, 30000)
    return () => clearInterval(interval)

  }, [provider, isConnected, limit])

  return { activities, isLoading }
}