// FrontEnd/src/components/views/Policies.jsx
import { usePolicies } from '../../hooks/usePolicies'

function formatExpiry(seconds) {
  if (seconds === 0) return '24h (défaut)'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m > 0 ? m + 'min' : ''}`
  return `${m}min`
}

function Policies() {
  const { policies, pendingActions, isLoading, error } = usePolicies()

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

  return (
    <div className="activity-section">

      {/* Politiques */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Gouvernance et Politiques ({policies.length})
        </h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>
          + Nouvelle Politique
        </button>
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

      {/* Actions en attente */}
      <h2 className="activity-section__title">
        Actions en Attente ({pendingActions.length})
      </h2>

      {pendingActions.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucune action en attente de validation.</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Initiateur</th>
              <th>Approbations</th>
              <th>Expire</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {pendingActions.map((action, i) => (
              <tr key={i}>
                <td><span className="badge badge--purple">{action.actionType}</span></td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {action.initiator.slice(0, 6)}...{action.initiator.slice(-4)}
                </td>
                <td>{action.approvers.length} signature(s)</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {new Date(action.expiresAt * 1000).toLocaleString()}
                </td>
                <td>
                  <span className="badge badge--warning">En attente</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Policies