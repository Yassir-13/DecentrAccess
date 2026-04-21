// FrontEnd/src/components/views/Recovery.jsx
import { useRecovery } from '../../hooks/useRecovery'

function Recovery() {
  const { guardians, requests, threshold, isLoading, error } = useRecovery()

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement du protocole DRP on-chain...</p>
    </div>
  )

  if (error) return (
    <div className="activity-section">
      <p style={{ color: '#ff4d4d' }}>Erreur : {error}</p>
    </div>
  )

  const formatDate = (ts) => ts > 0 ? new Date(ts * 1000).toLocaleString('fr-FR') : '—'

  return (
    <div className="activity-section">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Protocole de Récupération d'Urgence
        </h2>
        <span className="badge badge--warning">
          Seuil : {threshold} vote(s)
        </span>
      </div>

      {/* Gardiens */}
      <h3 style={styles.subTitle}>Gardiens ({guardians.length})</h3>

      {guardians.length === 0 ? (
        <div style={styles.emptyBox}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Aucun gardien configuré. Le SUPER_ADMIN peut en ajouter via le contrat EmergencyRecovery.
          </p>
        </div>
      ) : (
        <table className="activity-table" style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Adresse gardien</th>
            </tr>
          </thead>
          <tbody>
            {guardians.map((g, i) => (
              <tr key={g}>
                <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Demandes de récupération */}
      <h3 style={styles.subTitle}>Demandes de récupération ({requests.length})</h3>

      {requests.length === 0 ? (
        <div style={styles.emptyBox}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Aucune demande de récupération en cours.
          </p>
        </div>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Admin ciblé</th>
              <th>Nouvel admin</th>
              <th>Votes</th>
              <th>Statut</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.requestId}>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                  #{r.requestId}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {r.targetAdmin.slice(0, 6)}...{r.targetAdmin.slice(-4)}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {r.newAdmin.slice(0, 6)}...{r.newAdmin.slice(-4)}
                </td>
                <td>
                  <span className="badge badge--info">
                    {r.voteCount} / {threshold}
                  </span>
                </td>
                <td>
                  <span className={`badge badge--${r.executed ? 'success' : 'warning'}`}>
                    {r.executed ? 'Exécuté' : 'En attente'}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {formatDate(r.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const styles = {
  subTitle: {
    fontSize: '1rem', fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 12px'
  },
  emptyBox: {
    background: 'var(--bg-secondary, #f5f5f5)',
    borderRadius: '8px', padding: '16px',
    marginBottom: '2rem'
  }
}

export default Recovery