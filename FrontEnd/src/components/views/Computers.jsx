// FrontEnd/src/components/views/Computers.jsx
import { useComputers } from '../../hooks/useComputers'

function Computers() {
  const { computers, isLoading, error } = useComputers()

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement des machines on-chain...</p>
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
          Machines et Agents P2P ({computers.length})
        </h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>
          + Enregistrer Agent
        </button>
      </div>

      <table className="activity-table">
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Adresse</th>
            <th>Accès LDAP</th>
            <th>DID</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {computers.map((computer) => (
            <tr key={computer.address}>
              <td style={{ fontWeight: '500' }}>{computer.hostname}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {computer.address.slice(0, 6)}...{computer.address.slice(-4)}
              </td>
              <td>
                <span className={`badge badge--${computer.hasLDAP ? 'success' : 'warning'}`}>
                  {computer.hasLDAP ? 'Oui' : 'Non'}
                </span>
              </td>
              <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                {computer.did.slice(0, 20)}...
              </td>
              <td>
                <span className={`badge badge--${computer.active ? 'success' : 'danger'}`}>
                  {computer.active ? 'Enregistré' : 'Inactif'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Computers