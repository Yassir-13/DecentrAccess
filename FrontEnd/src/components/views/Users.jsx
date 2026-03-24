function Users({ data }) {
  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>Gestion des Utilisateurs AD</h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>+ Nouvel Utilisateur</button>
      </div>
      
      <table className="activity-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>DID</th>
            <th>Rôle</th>
            <th>Statut</th>
            <th>Dernière Activité</th>
          </tr>
        </thead>
        <tbody>
          {data.map((user) => (
            <tr key={user.id}>
              <td style={{ fontWeight: '500' }}>{user.name}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{user.did}</td>
              <td>
                <span className={`badge badge--${user.role === 'SUPER_ADMIN' ? 'purple' : user.role === 'ADMIN' ? 'info' : 'success'}`}>
                  {user.role}
                </span>
              </td>
              <td>
                <span className={`badge badge--${user.status === 'Actif' ? 'success' : 'danger'}`}>
                  {user.status}
                </span>
              </td>
              <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{user.lastActive}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Users
