// FrontEnd/src/hooks/useRecovery.js
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import contracts from '../config/contracts.json'

const RECOVERY_ABI = [
  "function getGuardians() view returns (address[])",
  "function getGuardianCount() view returns (uint256)",
  "function getAllRequestIds() view returns (bytes32[])",
  "function getRecoveryRequest(bytes32 _requestId) view returns (tuple(bytes32 requestId, uint8 recoveryType, address targetAccount, address newAccount, address initiator, address[] approvers, uint256 createdAt, uint256 executionDelay, bool executed, bool cancelled))",
  "function RECOVERY_THRESHOLD() view returns (uint8)"
]

const RECOVERY_TYPES = { 0: 'REPLACE_ADMIN', 1: 'REVOKE_ADMIN', 2: 'ROTATE_KEY' }

export function useRecovery() {
  const { provider, isConnected } = useWeb3()
  const [guardians, setGuardians]    = useState([])
  const [requests, setRequests]      = useState([])
  const [threshold, setThreshold]    = useState(3)
  const [isLoading, setIsLoading]    = useState(true)
  const [error, setError]            = useState(null)

  useEffect(() => {
    if (!isConnected || !provider) return

    const fetchRecovery = async () => {
      try {
        setIsLoading(true)
        const recovery = new Contract(contracts.EmergencyRecovery, RECOVERY_ABI, provider)

        const [guardianList, thresh, requestIds] = await Promise.all([
          recovery.getGuardians(),
          recovery.RECOVERY_THRESHOLD(),
          recovery.getAllRequestIds()
        ])

        setGuardians([...guardianList])
        setThreshold(Number(thresh))

        const reqs = await Promise.all(
          requestIds.map(async (id) => {
            const r = await recovery.getRecoveryRequest(id)
            return {
              requestId:    r.requestId,
              recoveryType: RECOVERY_TYPES[Number(r.recoveryType)] || 'UNKNOWN',
              targetAccount: r.targetAccount,
              newAccount:    r.newAccount,
              initiator:     r.initiator,
              voteCount:     r.approvers.length,
              createdAt:     Number(r.createdAt),
              executed:      r.executed,
              cancelled:     r.cancelled
            }
          })
        )

        setRequests(reqs)
        setIsLoading(false)
      } catch (err) {
        console.error('useRecovery error:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    fetchRecovery()
  }, [provider, isConnected])

  return { guardians, requests, threshold, isLoading, error }
}