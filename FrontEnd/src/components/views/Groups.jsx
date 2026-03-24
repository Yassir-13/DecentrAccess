function Groups({ data }) {
  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>Groupes de Sécurité (AD)</h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>+ Nouveau Groupe</button>
      </div>
      
      <table className="activity-table">
        <thead>
          <tr>
            <th>Nom du Groupe</th>
            <th>Membres</th>
            <th>Politiques Actives</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {data.map((group) => (
            <tr key={group.id}>
              <td style={{ fontWeight: '500' }}>{group.name}</td>
              <td>{group.members} utilisateurs</td>
              <td>{group.policies}</td>
              <td>
                <span className={`badge badge--${group.status === 'Actif' ? 'success' : 'danger'}`}>
                  {group.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Groups
