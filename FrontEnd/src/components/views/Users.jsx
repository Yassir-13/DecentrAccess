// FrontEnd/src/components/views/Users.jsx
import { useUsers } from '../../hooks/useUsers'

function Users() {
  const { users, isLoading, error } = useUsers()

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement des utilisateurs on-chain...</p>
    </div>
  )

  if (error) return (
    <div className="activity-section">
      <p style={{ color: '#ff4d4d' }}>Erreur : {error}</p>
    </div>
  )

  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Gestion des Utilisateurs AD ({users.length})
        </h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>
          + Nouvel Utilisateur
        </button>
      </div>

      <table className="activity-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Adresse</th>
            <th>Département</th>
            <th>Rôle</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.address}>
              <td style={{ fontWeight: '500' }}>{user.name}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {user.address.slice(0, 6)}...{user.address.slice(-4)}
              </td>
              <td style={{ color: 'var(--text-secondary)' }}>{user.department}</td>
              <td>
                <span className={`badge badge--${
                  user.role === 'SUPER_ADMIN' ? 'purple' :
                  user.role === 'ADMIN'       ? 'info'   :
                  user.role === 'OPERATOR'    ? 'success': 'warning'
                }`}>
                  {user.role}
                </span>
              </td>
              <td>
                <span className={`badge badge--${user.active ? 'success' : 'danger'}`}>
                  {user.active ? 'Actif' : 'Inactif'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Users