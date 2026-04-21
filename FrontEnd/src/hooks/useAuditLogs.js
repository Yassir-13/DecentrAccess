// FrontEnd/src/hooks/useAuditLogs.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const AUDIT_LOG_ABI = [
  "function getLogCount() view returns (uint256)",
  "function getLatestLogs(uint256 _count) view returns (tuple(bytes32 actionHash, string actionType, string ipfsCID, address signer, bytes signature, uint256 timestamp, uint256 blockNumber)[])",
  "function merkleRoot() view returns (bytes32)"
]

export function useAuditLogs() {
  const { provider, isConnected } = useWeb3()
  const [logs, setLogs]             = useState([])
  const [merkleRoot, setMerkleRoot] = useState(null)
  const [isLoading, setIsLoading]   = useState(true)
  const [error, setError]           = useState(null)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchLogs = async () => {
      try {
        setIsLoading(true)
        const auditLog = new Contract(contracts.AuditLog, AUDIT_LOG_ABI, provider)

        const [count, root] = await Promise.all([
          auditLog.getLogCount(),
          auditLog.merkleRoot()
        ])

        const total = Number(count)
        let rawLogs = []

        if (total > 0) {
          // Récupère les 50 derniers logs (plus récents en premier)
          rawLogs = await auditLog.getLatestLogs(Math.min(total, 50))
        }

        const parsed = rawLogs.map((l, i) => ({
          index:       total - 1 - i,
          actionHash:  l.actionHash,
          actionType:  l.actionType,
          ipfsCID:     l.ipfsCID,
          signer:      l.signer,
          timestamp:   Number(l.timestamp),
          blockNumber: Number(l.blockNumber)
        }))

        setLogs(parsed)
        setMerkleRoot(root)
        setIsLoading(false)
      } catch (err) {
        console.error('useAuditLogs error:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    fetchLogs()
  }, [provider, isConnected])

  return { logs, merkleRoot, isLoading, error }
}