function RecentActivity({ activities }) {
  return (
    <div className="activity-section">
      <h2 className="activity-section__title">Activité Récente</h2>
      <table className="activity-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Utilisateur</th>
            <th>Type</th>
            <th>Statut</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((activity, index) => (
            <tr key={index}>
              <td>{activity.action}</td>
              <td>{activity.user}</td>
              <td><span className={`badge badge--${activity.typeBadge}`}>{activity.type}</span></td>
              <td><span className={`badge badge--${activity.statusBadge}`}>{activity.status}</span></td>
              <td style={{ color: '#6b7280', fontSize: '0.85rem' }}>{activity.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default RecentActivity
