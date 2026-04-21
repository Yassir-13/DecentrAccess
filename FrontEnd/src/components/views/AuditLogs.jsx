// FrontEnd/src/components/views/AuditLogs.jsx
import { useAuditLogs } from '../../hooks/useAuditLogs'

function AuditLogs() {
  const { logs, merkleRoot, isLoading, error } = useAuditLogs()

  const formatDate = (ts) => new Date(ts * 1000).toLocaleString('fr-FR')

  const ACTION_BADGE = {
    CREATE_USER:    'info',
    DELETE_USER:    'danger',
    MODIFY_USER:    'purple',
    RESET_PASSWORD: 'warning',
    CREATE_GROUP:   'success',
  }

  if (isLoading) return (
    <div className="activity-section">
      <p style={{ color: 'var(--text-secondary)' }}>Chargement des logs on-chain...</p>
    </div>
  )

  if (error) return (
    <div className="activity-section">
      <p style={{ color: '#ff4d4d' }}>Erreur : {error}</p>
    </div>
  )

  return (
    <div className="activity-section">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Audit Logs ({logs.length})
        </h2>
        {merkleRoot && merkleRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
          <div style={styles.merkleBox}>
            <span style={styles.merkleLabel}>Merkle Root</span>
            <span style={styles.merkleValue}>
              {merkleRoot.slice(0, 10)}...{merkleRoot.slice(-8)}
            </span>
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucun log enregistré pour le moment.</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Action</th>
              <th>Signataire</th>
              <th>IPFS CID</th>
              <th>Bloc</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.index}>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                  #{log.index}
                </td>
                <td>
                  <span className={`badge badge--${ACTION_BADGE[log.actionType] || 'info'}`}>
                    {log.actionType}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {log.signer.slice(0, 6)}...{log.signer.slice(-4)}
                </td>
                <td>
                  {log.ipfsCID ? (
                    <span style={styles.cid} title={log.ipfsCID}>
                      {log.ipfsCID.slice(0, 12)}...{log.ipfsCID.slice(-6)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>—</span>
                  )}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {log.blockNumber}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {formatDate(log.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const styles = {
  merkleBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    background: 'var(--bg-secondary, #f5f5f5)',
    borderRadius: '8px', padding: '6px 12px'
  },
  merkleLabel: { fontSize: '0.72rem', color: 'var(--text-secondary)' },
  merkleValue: { fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-primary)' },
  cid: {
    fontFamily: 'monospace', fontSize: '0.82rem',
    background: 'var(--bg-secondary, #f0f0f0)',
    padding: '2px 6px', borderRadius: '4px',
    color: 'var(--text-primary)'
  }
}

export default AuditLogs