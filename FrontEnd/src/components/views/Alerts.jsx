// FrontEnd/src/components/views/Alerts.jsx
import { useAlerts } from '../../hooks/useAlerts'

function Alerts() {
  const { rules, alerts, isLoading, error } = useAlerts()

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement des alertes on-chain...</p>
    </div>
  )

  if (error) return (
    <div className="activity-section">
      <p style={{ color: '#ff4d4d' }}>Erreur : {error}</p>
    </div>
  )

  return (
    <div className="activity-section">

      {/* Règles de sécurité */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Règles de Sécurité ({rules.length})
        </h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>
          + Nouvelle Règle
        </button>
      </div>

      <table className="activity-table" style={{ marginBottom: '2.5rem' }}>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Condition</th>
            <th>Sévérité</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, i) => (
            <tr key={i}>
              <td style={{ fontWeight: '500' }}>{rule.name}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {rule.condition}
              </td>
              <td>
                <span className={`badge badge--${rule.severityBadge}`}>
                  {rule.severity}
                </span>
              </td>
              <td>
                <span className={`badge badge--${rule.active ? 'success' : 'danger'}`}>
                  {rule.active ? 'Active' : 'Inactive'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Alertes actives */}
      <h2 className="activity-section__title">
        Alertes Actives ({alerts.length})
      </h2>

      {alerts.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucune alerte active pour le moment.</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Description</th>
              <th>Sévérité</th>
              <th>Déclencheur</th>
              <th>Acquittement</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.alertId}>
                <td style={{ fontFamily: 'monospace' }}>ALT-{alert.alertId}</td>
                <td>{alert.description}</td>
                <td>
                  <span className={`badge badge--${alert.severityBadge}`}>
                    {alert.severity}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {alert.triggeredBy.slice(0, 6)}...{alert.triggeredBy.slice(-4)}
                </td>
                <td>
                  <span className="badge badge--success">Acquitté</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Alerts