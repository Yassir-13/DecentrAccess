function Policies({ data }) {
  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>Gouvernance et Politiques</h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>+ Nouvelle Politique</button>
      </div>
      
      <table className="activity-table">
        <thead>
          <tr>
            <th>ID Politique</th>
            <th>Type d'Action</th>
            <th>Signatures Requises</th>
            <th>Délai d'Expiration</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {data.map((policy) => (
            <tr key={policy.id}>
              <td style={{ fontFamily: 'monospace' }}>{policy.id}</td>
              <td style={{ fontWeight: '500' }}>
                <span className="badge badge--purple">{policy.type}</span>
              </td>
              <td>{policy.requiredSigs} validateur(s)</td>
              <td>{policy.expiry}</td>
              <td>
                <span className={`badge badge--${policy.status === 'Active' ? 'success' : 'danger'}`}>
                  {policy.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Policies
