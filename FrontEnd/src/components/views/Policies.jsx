// FrontEnd/src/components/views/Policies.jsx
import { useState } from 'react'
import { Contract } from 'ethers'
import { usePolicies } from '../../hooks/usePolicies'
import { useWeb3 } from '../../context/Web3Context'
import contracts from '../../config/contracts.json'

const POLICY_ENGINE_ABI = [
  "function approveAction(bytes32 _actionId) external"
]

function formatExpiry(seconds) {
  if (seconds === 0) return '24h (défaut)'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m > 0 ? m + 'min' : ''}`
  return `${m}min`
}

function formatAddress(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function Policies() {
  const { policies, pendingActions, isLoading, error } = usePolicies()
  const { signer, isConnected } = useWeb3()

  // État par actionId : null | 'signing' | 'pending' | 'success' | 'error'
  const [txStates, setTxStates] = useState({})
  const [txErrors, setTxErrors] = useState({})

  const setTxState = (actionId, state) =>
    setTxStates(prev => ({ ...prev, [actionId]: state }))

  const setTxError = (actionId, err) =>
    setTxErrors(prev => ({ ...prev, [actionId]: err }))

  const handleApprove = async (actionId) => {
    if (!signer) return
    try {
      setTxState(actionId, 'signing')
      setTxError(actionId, null)

      const policyEngine = new Contract(contracts.PolicyEngine, POLICY_ENGINE_ABI, signer)
      const tx = await policyEngine.approveAction(actionId)

      setTxState(actionId, 'pending')
      await tx.wait()

      setTxState(actionId, 'success')
    } catch (err) {
      console.error('[Policies] Erreur approveAction :', err)
      setTxState(actionId, 'error')
      setTxError(actionId, err.reason || err.message)
    }
  }

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement des politiques on-chain...</p>
    </div>
  )

  if (error) return (
    <div className="activity-section">
      <p style={{ color: '#ff4d4d' }}>Erreur : {error}</p>
    </div>
  )

  // Filtrer les actions non exécutées et non annulées
  const activePending = pendingActions.filter(a => !a.executed && !a.cancelled)

  return (
    <div className="activity-section">

      {/* ── Politiques ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Gouvernance et Politiques ({policies.length})
        </h2>
      </div>

      <table className="activity-table" style={{ marginBottom: '2.5rem' }}>
        <thead>
          <tr>
            <th>Type d'Action</th>
            <th>Multi-Sig</th>
            <th>Signatures Requises</th>
            <th>Délai d'Expiration</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((policy, i) => (
            <tr key={i}>
              <td style={{ fontWeight: '500' }}>
                <span className="badge badge--purple">{policy.actionType}</span>
              </td>
              <td>{policy.requiresMultiSig ? '✅ Oui' : '—'}</td>
              <td>{policy.requiredSignatures} validateur(s)</td>
              <td>{formatExpiry(policy.expiryPeriod)}</td>
              <td>
                <span className={`badge badge--${policy.active ? 'success' : 'danger'}`}>
                  {policy.active ? 'Active' : 'Inactive'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Actions en attente ── */}
      <h2 className="activity-section__title">
        Actions en Attente ({activePending.length})
      </h2>

      {activePending.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucune action en attente de validation.</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Initiateur</th>
              <th>Approbations</th>
              <th>Expire</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {activePending.map((action) => {
              const txState = txStates[action.actionId]
              const txError = txErrors[action.actionId]
              const isExpired = Date.now() > action.expiresAt * 1000

              return (
                <tr key={action.actionId}>
                  <td><span className="badge badge--purple">{action.actionType}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {formatAddress(action.initiator)}
                  </td>
                  <td>{action.approvers.length} signature(s)</td>
                  <td style={{ fontSize: '0.85rem', color: isExpired ? '#ff4d4d' : 'var(--text-secondary)' }}>
                    {isExpired ? '⚠️ Expirée' : new Date(action.expiresAt * 1000).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {/* Succès */}
                    {txState === 'success' && (
                      <span className="badge badge--success">✓ Approuvée</span>
                    )}

                    {/* Erreur */}
                    {txState === 'error' && (
                      <div>
                        <span className="badge badge--danger" title={txError}>✗ Échec</span>
                        <button
                          style={{ ...styles.btnRetry }}
                          onClick={() => handleApprove(action.actionId)}
                        >
                          Réessayer
                        </button>
                      </div>
                    )}

                    {/* En cours */}
                    {(txState === 'signing' || txState === 'pending') && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <div style={styles.spinner} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {txState === 'signing' ? 'Signature...' : 'On-chain...'}
                        </span>
                      </div>
                    )}

                    {/* Bouton Approuver */}
                    {!txState && !isExpired && isConnected && (
                      <button
                        style={styles.btnApprove}
                        onClick={() => handleApprove(action.actionId)}
                      >
                        Approuver
                      </button>
                    )}

                    {/* Expirée sans tx */}
                    {!txState && isExpired && (
                      <span className="badge badge--danger">Expirée</span>
                    )}

                    {/* Non connecté */}
                    {!txState && !isExpired && !isConnected && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Connexion requise
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

const styles = {
  btnApprove: {
    padding: '5px 14px',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', border: 'none', borderRadius: '6px',
    fontSize: '0.85rem', cursor: 'pointer', fontWeight: '500'
  },
  btnRetry: {
    display: 'block', marginTop: '4px',
    padding: '3px 10px',
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid var(--border, #ddd)', borderRadius: '6px',
    fontSize: '0.78rem', cursor: 'pointer'
  },
  spinner: {
    width: '14px', height: '14px',
    border: '2px solid #eee', borderTop: '2px solid #667eea',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    flexShrink: 0
  }
}

export default Policies