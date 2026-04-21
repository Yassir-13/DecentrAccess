// FrontEnd/src/components/views/Reputation.jsx
import { useReputation } from '../../hooks/useReputation'

function Reputation() {
  const { scores, isLoading, error } = useReputation()

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement des scores on-chain...</p>
    </div>
  )

  if (error) return (
    <div className="activity-section">
      <p style={{ color: '#ff4d4d' }}>Erreur : {error}</p>
    </div>
  )

  const getScoreBadge = (score) => {
    if (score >= 10) return 'success'
    if (score >= 5)  return 'info'
    if (score >= 0)  return 'warning'
    return 'danger'
  }

  const getMedal = (index) => {
    if (index === 0) return '🥇'
    if (index === 1) return '🥈'
    if (index === 2) return '🥉'
    return `#${index + 1}`
  }

  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Scores de Réputation ({scores.length})
        </h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Basé sur les actions on-chain
        </span>
      </div>

      <table className="activity-table">
        <thead>
          <tr>
            <th>Rang</th>
            <th>Administrateur</th>
            <th>Département</th>
            <th>Score</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s, i) => (
            <tr key={s.address}>
              <td style={{ fontSize: '1.1rem', textAlign: 'center' }}>
                {getMedal(i)}
              </td>
              <td>
                <div style={{ fontWeight: '500' }}>{s.name}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {s.address.slice(0, 6)}...{s.address.slice(-4)}
                </div>
              </td>
              <td style={{ color: 'var(--text-secondary)' }}>{s.department}</td>
              <td>
                <span className={`badge badge--${getScoreBadge(s.score)}`}>
                  {s.score} pts
                </span>
              </td>
              <td>
                <span className={`badge badge--${s.active ? 'success' : 'danger'}`}>
                  {s.active ? 'Actif' : 'Inactif'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Reputation