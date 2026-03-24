function Computers({ data }) {
  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>Machines et Agents P2P</h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}>+ Enregistrer Agent</button>
      </div>
      
      <table className="activity-table">
        <thead>
          <tr>
            <th>Hostname</th>
            <th>IP</th>
            <th>OS</th>
            <th>Version Agent</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {data.map((computer) => (
            <tr key={computer.id}>
              <td style={{ fontWeight: '500' }}>{computer.hostname}</td>
              <td style={{ fontFamily: 'monospace' }}>{computer.ip}</td>
              <td>{computer.os}</td>
              <td>{computer.agentVersion}</td>
              <td>
                <span className={`badge badge--${computer.status === 'Online' ? 'success' : 'danger'}`}>
                  {computer.status}
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
