function Alerts({ data }) {
  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>Alertes de Sécurité</h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>+ Gérer les Règles</button>
      </div>
      
      <table className="activity-table">
        <thead>
          <tr>
            <th>Alerte ID</th>
            <th>Règle Sécurité</th>
            <th>Sévérité</th>
            <th>Déclencheur</th>
            <th>Heure</th>
            <th>Acquittement</th>
          </tr>
        </thead>
        <tbody>
          {data.map((alert) => (
            <tr key={alert.id}>
              <td style={{ fontFamily: 'monospace' }}>{alert.id}</td>
              <td style={{ fontWeight: '500' }}>{alert.rule}</td>
              <td>
                <span className={`badge badge--${alert.severity === 'CRITICAL' ? 'danger' : 'warning'}`}>
                  {alert.severity}
                </span>
              </td>
              <td>{alert.triggerer}</td>
              <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{alert.date}</td>
              <td>
                {alert.ack ? (
                  <span className="badge badge--success">Acquitté</span>
                ) : (
                  <button style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '20px', border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>
                    Acquitter
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Alerts
