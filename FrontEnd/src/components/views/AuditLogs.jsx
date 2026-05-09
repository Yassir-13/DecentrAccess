// FrontEnd/src/components/views/AuditLogs.jsx
import { useState } from 'react'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { fetchReport } from '../../services/p2pService'

function AuditLogs() {
  const { logs, merkleRoot, isLoading, error } = useAuditLogs()

  // État par CID : null | 'loading' | 'loaded' | 'error'
  const [reportStates, setReportStates] = useState({})
  const [reports, setReports]           = useState({})
  const [openCid, setOpenCid]           = useState(null)   // CID du modal ouvert

  const formatDate = (ts) => new Date(ts * 1000).toLocaleString('fr-FR')

  const ACTION_BADGE = {
    CREATE_USER:      'info',
    DELETE_USER:      'danger',
    MODIFY_USER:      'purple',
    RESET_PASSWORD:   'warning',
    CREATE_GROUP:     'success',
    ACTIVATE_USER:    'success',
    DISABLE_USER:     'warning',
    ENABLE_USER:      'success',
    ADD_TO_GROUP:     'info',
    REMOVE_FROM_GROUP:'warning',
  }

  const handleViewReport = async (cid) => {
    // Déjà chargé → ouvrir directement
    if (reports[cid]) { setOpenCid(cid); return }

    setReportStates(prev => ({ ...prev, [cid]: 'loading' }))

    const report = await fetchReport(cid)

    if (report) {
      setReports(prev => ({ ...prev, [cid]: report }))
      setReportStates(prev => ({ ...prev, [cid]: 'loaded' }))
      setOpenCid(cid)
    } else {
      setReportStates(prev => ({ ...prev, [cid]: 'error' }))
    }
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
            <span style={styles.merkleValue}>{merkleRoot.slice(0, 10)}...{merkleRoot.slice(-8)}</span>
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
              <th style={{ textAlign: 'center' }}>Rapport</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const rState = reportStates[log.ipfsCID]
              return (
                <tr key={log.index}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>#{log.index}</td>
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
                  <td style={{ textAlign: 'center' }}>
                    {log.ipfsCID ? (
                      <>
                        {rState === 'loading' && <div style={styles.spinner} />}
                        {rState === 'error'   && <span style={{ fontSize: '0.78rem', color: '#ff4d4d' }}>Indisponible</span>}
                        {rState === 'loaded'  && (
                          <button style={styles.btnView} onClick={() => setOpenCid(log.ipfsCID)}>
                            Voir
                          </button>
                        )}
                        {!rState && (
                          <button style={styles.btnView} onClick={() => handleViewReport(log.ipfsCID)}>
                            Voir rapport
                          </button>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Modal rapport IPFS */}
      {openCid && reports[openCid] && (
        <div style={styles.overlay} onClick={() => setOpenCid(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={styles.modalTitle}>Rapport IPFS</h3>
                <p style={styles.modalCid}>{openCid}</p>
              </div>
              <button style={styles.btnClose} onClick={() => setOpenCid(null)}>✕</button>
            </div>

            {/* Champs clés du rapport */}
            <div style={styles.reportGrid}>
              {reports[openCid].actionType && (
                <ReportField label="Action" value={<span className={`badge badge--${ACTION_BADGE[reports[openCid].actionType] || 'info'}`}>{reports[openCid].actionType}</span>} />
              )}
              {reports[openCid].signer && (
                <ReportField label="Signataire" value={<code style={styles.code}>{reports[openCid].signer}</code>} />
              )}
              {reports[openCid].executor && (
                <ReportField label="Exécuteur" value={<code style={styles.code}>{reports[openCid].executor}</code>} />
              )}
              {reports[openCid].timestamp && (
                <ReportField label="Timestamp" value={new Date(reports[openCid].timestamp).toLocaleString('fr-FR')} />
              )}
              {reports[openCid].network && (
                <ReportField label="Réseau" value={reports[openCid].network} />
              )}
              {reports[openCid].result && (
                <ReportField label="Résultat" value={
                  <span className={`badge badge--${reports[openCid].result.success ? 'success' : 'danger'}`}>
                    {reports[openCid].result.success ? 'Succès' : 'Échec'}
                  </span>
                } />
              )}
              {reports[openCid].payload && (
                <ReportField label="Payload" value={
                  <pre style={styles.pre}>{JSON.stringify(reports[openCid].payload, null, 2)}</pre>
                } fullWidth />
              )}
            </div>

            {/* JSON brut repliable */}
            <details style={{ marginTop: '16px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                JSON brut
              </summary>
              <pre style={{ ...styles.pre, marginTop: '8px' }}>
                {JSON.stringify(reports[openCid], null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportField({ label, value, fullWidth }) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : 'auto' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>{label}</p>
      <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

const styles = {
  merkleBox:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '8px', padding: '6px 12px' },
  merkleLabel: { fontSize: '0.72rem', color: 'var(--text-secondary)' },
  merkleValue: { fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-primary)' },
  cid:         { fontFamily: 'monospace', fontSize: '0.82rem', background: 'var(--bg-secondary, #f0f0f0)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-primary)' },
  btnView:     { padding: '4px 10px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' },
  spinner:     { width: '14px', height: '14px', border: '2px solid #eee', borderTop: '2px solid #667eea', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:       { background: 'var(--bg-primary, #fff)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  modalTitle:  { margin: 0, fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' },
  modalCid:    { margin: '4px 0 0', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all' },
  btnClose:    { background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 4px', lineHeight: 1 },
  reportGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  code:        { fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' },
  pre:         { fontFamily: 'monospace', fontSize: '0.78rem', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '6px', padding: '10px', overflowX: 'auto', margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }
}

export default AuditLogs