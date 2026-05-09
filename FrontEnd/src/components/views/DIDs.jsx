// FrontEnd/src/components/views/DIDs.jsx
import { useState } from 'react'
import { Contract } from 'ethers'
import { useDIDs } from '../../hooks/useDIDs'
import { useWeb3 } from '../../context/Web3Context'
import contracts from '../../config/contracts.json'

const DID_REGISTRY_ABI = [
  "function deactivateDID(address _owner) external",
  "function reactivateDID(address _owner) external"
]

const ENTITY_BADGE = { Admin: 'info', Machine: 'purple', Service: 'warning' }

function DIDs() {
  const { dids, isLoading, error, refetch } = useDIDs()
  const { signer, isConnected } = useWeb3()

  // État par adresse : null | 'signing' | 'pending' | 'success' | 'error'
  const [txStates, setTxStates] = useState({})
  const [txErrors, setTxErrors] = useState({})

  const setTxState = (addr, s) => setTxStates(prev => ({ ...prev, [addr]: s }))
  const setTxError = (addr, e) => setTxErrors(prev => ({ ...prev, [addr]: e }))

  const handleToggle = async (did) => {
    if (!signer) return
    try {
      setTxState(did.address, 'signing')
      setTxError(did.address, null)

      const registry = new Contract(contracts.DIDRegistry, DID_REGISTRY_ABI, signer)
      const tx = did.active
        ? await registry.deactivateDID(did.address)
        : await registry.reactivateDID(did.address)

      setTxState(did.address, 'pending')
      await tx.wait()
      setTxState(did.address, 'success')

      // Rafraîchir après 1s
      setTimeout(() => { refetch(); setTxState(did.address, null) }, 1000)

    } catch (err) {
      console.error('[DIDs] Erreur toggle :', err)
      setTxState(did.address, 'error')
      setTxError(did.address, err.reason || err.message)
    }
  }

  const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('fr-FR') : '—'

  const stats = {
    total:    dids.length,
    active:   dids.filter(d => d.active).length,
    admins:   dids.filter(d => d.entityType === 'Admin').length,
    machines: dids.filter(d => d.entityType === 'Machine').length,
  }

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement des DIDs on-chain...</p>
    </div>
  )

  if (error) return (
    <div className="activity-section">
      <p style={{ color: '#ff4d4d' }}>Erreur : {error}</p>
    </div>
  )

  return (
    <div className="activity-section">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Identités Décentralisées ({stats.total})
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <StatPill label="Actifs"    value={stats.active}   color="#4caf50" />
          <StatPill label="Admins"    value={stats.admins}   color="#667eea" />
          <StatPill label="Machines"  value={stats.machines} color="#9c27b0" />
        </div>
      </div>

      {dids.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucun DID enregistré.</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th>DID</th>
              <th>Nom / Hostname</th>
              <th>Type</th>
              <th>Statut</th>
              <th>Créé le</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {dids.map((did) => {
              const txState = txStates[did.address]
              const txError = txErrors[did.address]
              return (
                <tr key={did.address} style={{ opacity: did.active ? 1 : 0.65 }}>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {did.did.length > 30 ? did.did.slice(0, 18) + '...' + did.did.slice(-8) : did.did}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                      {did.address.slice(0, 6)}...{did.address.slice(-4)}
                    </div>
                  </td>
                  <td style={{ fontWeight: '500' }}>{did.name !== did.address ? did.name : did.hostname}</td>
                  <td>
                    <span className={`badge badge--${ENTITY_BADGE[did.entityType] || 'info'}`}>
                      {did.entityType}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge--${did.active ? 'success' : 'danger'}`}>
                      {did.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {formatDate(did.createdAt)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {txState === 'success' && (
                      <span className="badge badge--success">✓</span>
                    )}
                    {txState === 'error' && (
                      <div>
                        <span className="badge badge--danger" title={txError}>✗ Échec</span>
                        <button style={styles.btnRetry} onClick={() => handleToggle(did)}>Réessayer</button>
                      </div>
                    )}
                    {(txState === 'signing' || txState === 'pending') && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <div style={styles.spinner} />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {txState === 'signing' ? 'Signature...' : 'On-chain...'}
                        </span>
                      </div>
                    )}
                    {!txState && isConnected && (
                      <button
                        style={{ ...styles.btnToggle, background: did.active ? '#ff9800' : '#4caf50' }}
                        onClick={() => handleToggle(did)}
                        title={did.active ? 'Désactiver ce DID' : 'Réactiver ce DID'}
                      >
                        {did.active ? 'Désactiver' : 'Réactiver'}
                      </button>
                    )}
                    {!txState && !isConnected && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>—</span>
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

function StatPill({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '20px', padding: '4px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

const styles = {
  btnToggle: { padding: '4px 10px', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '500' },
  btnRetry:  { display: 'block', marginTop: '4px', padding: '3px 10px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border, #ddd)', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer' },
  spinner:   { width: '14px', height: '14px', border: '2px solid #eee', borderTop: '2px solid #667eea', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }
}

export default DIDs