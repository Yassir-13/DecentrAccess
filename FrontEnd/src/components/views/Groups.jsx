// FrontEnd/src/components/views/Groups.jsx
import { useState, useEffect, useRef } from 'react'
import { useWeb3 } from '../../context/Web3Context'
import { sendRequest, onMessage, offMessage, onResult, offResult } from '../../services/p2pService'

const AGENT_PEER_ID = '12D3KooWNBwtCbWmjKCJyXGYa5Ni6gQwBuDJr96RNVGQ2tfqWB7a'

const EMPTY_GROUP  = { groupName: '', description: '' }
const EMPTY_MEMBER = { groupName: '', username: '' }

function Groups() {
  const { sendAction, initializeP2P, p2pReady, isConnected } = useWeb3()

  const [groups, setGroups]          = useState([])
  const [isLoading, setIsLoading]    = useState(true)
  const [loadError, setLoadError]    = useState(null)

  const [modalMode, setModalMode]    = useState(null)
  const [groupForm, setGroupForm]    = useState(EMPTY_GROUP)
  const [memberForm, setMemberForm]  = useState(EMPTY_MEMBER)
  const [selectedGroup, setSelected] = useState(null)

  const [txStatus, setTxStatus]      = useState(null)
  const [txResult, setTxResult]      = useState(null)
  const [txError, setTxError]        = useState(null)

  const fetchDone = useRef(false)

  // ── 1. Init P2P ──
  useEffect(() => {
    if (isConnected && !p2pReady) initializeP2P(AGENT_PEER_ID)
  }, [isConnected, p2pReady, initializeP2P])

  // ── 2. Listeners AD + onResult + fetch initial ──
  useEffect(() => {
    if (!p2pReady) return

    // Handlers AD
    onMessage('AD_GROUPS', (data) => {
      setGroups(data.groups || [])
      setIsLoading(false)
      if (data.error) setLoadError(data.error)
    })

    onMessage('AD_GROUPS_UPDATE', (data) => {
      setGroups(data.groups || [])
    })

    // Handler résultat d'action
    onResult((data) => {
      if (data.status === 'success') {
        setTxStatus('success')
        setTxResult({ ipfsCID: data.ipfsCID, txHash: data.txHash })
        // Rafraîchir la liste après action réussie
        setTimeout(() => sendRequest({ type: 'getGroups' }), 1500)
      } else {
        setTxStatus('error')
        setTxError(data.error || 'Échec côté agent')
      }
    })

    // Fetch initial (une seule fois par montage)
    if (!fetchDone.current) {
      fetchDone.current = true
      const sent = sendRequest({ type: 'getGroups' })
      if (!sent) { setIsLoading(false); setLoadError('Agent non connecté') }
    }

    return () => {
      offMessage('AD_GROUPS')
      offMessage('AD_GROUPS_UPDATE')
      offResult()
    }
  }, [p2pReady])

  const resetTx   = () => { setTxStatus(null); setTxResult(null); setTxError(null) }
  const closeModal = () => {
    if (txStatus === 'signing' || txStatus === 'pending') return
    setModalMode(null); setSelected(null); resetTx()
  }

  const execAction = async (actionType, payload) => {
    try { resetTx(); setTxStatus('signing'); await sendAction(actionType, payload); setTxStatus('pending') }
    catch (err) { setTxStatus('error'); setTxError(err.message) }
  }

  const handleCreateGroup    = () => { setGroupForm(EMPTY_GROUP); setModalMode('create_group'); resetTx() }
  const handleAddMember    = (g) => { setSelected(g); setMemberForm({ groupName: g.groupName, username: '' }); setModalMode('add_member'); resetTx() }
  const handleRemoveMember = (g) => { setSelected(g); setMemberForm({ groupName: g.groupName, username: '' }); setModalMode('remove_member'); resetTx() }

  const submitCreateGroup  = async () => {
    if (!groupForm.groupName) { setTxError('Le nom du groupe est obligatoire.'); return }
    await execAction('CREATE_GROUP', { groupName: groupForm.groupName, description: groupForm.description })
  }
  const submitAddMember    = async () => {
    if (!memberForm.username) { setTxError("Nom d'utilisateur obligatoire."); return }
    await execAction('ADD_TO_GROUP', { groupName: memberForm.groupName, username: memberForm.username })
  }
  const submitRemoveMember = async () => {
    if (!memberForm.username) { setTxError("Nom d'utilisateur obligatoire."); return }
    await execAction('REMOVE_FROM_GROUP', { groupName: memberForm.groupName, username: memberForm.username })
  }

  if (isLoading) return <div className="activity-section"><p style={{ color: 'var(--text-secondary)' }}>Chargement des groupes AD...</p></div>
  if (loadError) return <div className="activity-section"><p style={{ color: '#ff4d4d' }}>Erreur : {loadError}</p></div>

  return (
    <div className="activity-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>Groupes de Sécurité AD ({groups.length})</h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }} onClick={handleCreateGroup}>+ Nouveau Groupe</button>
      </div>

      <table className="activity-table">
        <thead><tr><th>Nom du Groupe</th><th>Description</th><th>Membres</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
        <tbody>
          {groups.length === 0
            ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>Aucun groupe trouvé dans l'OU DecentrAccess</td></tr>
            : groups.map(g => (
              <tr key={g.groupName}>
                <td style={{ fontWeight: '500' }}>{g.groupName}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{g.description || '—'}</td>
                <td><span className="badge badge--info">{g.memberCount} membre(s)</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <button style={{ ...styles.actionBtn, background: '#4caf50' }} onClick={() => handleAddMember(g)} title="Ajouter un membre">➕</button>
                    <button style={{ ...styles.actionBtn, background: '#f44336' }} onClick={() => handleRemoveMember(g)} title="Retirer un membre">➖</button>
                  </div>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>

      {modalMode === 'create_group' && (
        <Modal title="Nouveau Groupe AD" onClose={closeModal}>
          {(txStatus === null || txStatus === 'error') && (
            <div style={styles.form}>
              <label style={styles.label}>Nom du groupe *</label>
              <input style={styles.input} placeholder="ex: GRP-Finance" value={groupForm.groupName} onChange={e => setGroupForm(f => ({ ...f, groupName: e.target.value }))} />
              <label style={styles.label}>Description</label>
              <input style={styles.input} placeholder="ex: Équipe Finance" value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} />
              {txError && <p style={styles.errorText}>{txError}</p>}
              <div style={styles.btnRow}>
                <button style={styles.btnSecondary} onClick={closeModal}>Annuler</button>
                <button style={styles.btnPrimary} onClick={submitCreateGroup}>Signer & Envoyer</button>
              </div>
            </div>
          )}
          <TxFeedback status={txStatus} result={txResult} onClose={closeModal} />
        </Modal>
      )}

      {modalMode === 'add_member' && selectedGroup && (
        <Modal title={`Ajouter un membre — ${selectedGroup.groupName}`} onClose={closeModal}>
          {(txStatus === null || txStatus === 'error') && (
            <div style={styles.form}>
              <label style={styles.label}>Nom d'utilisateur *</label>
              <input style={styles.input} placeholder="ex: j.dupont" value={memberForm.username} onChange={e => setMemberForm(f => ({ ...f, username: e.target.value }))} />
              {txError && <p style={styles.errorText}>{txError}</p>}
              <div style={styles.btnRow}>
                <button style={styles.btnSecondary} onClick={closeModal}>Annuler</button>
                <button style={{ ...styles.btnPrimary, background: '#4caf50' }} onClick={submitAddMember}>Ajouter</button>
              </div>
            </div>
          )}
          <TxFeedback status={txStatus} result={txResult} onClose={closeModal} />
        </Modal>
      )}

      {modalMode === 'remove_member' && selectedGroup && (
        <Modal title={`Retirer un membre — ${selectedGroup.groupName}`} onClose={closeModal}>
          {(txStatus === null || txStatus === 'error') && (
            <div style={styles.form}>
              <label style={styles.label}>Nom d'utilisateur *</label>
              <input style={styles.input} placeholder="ex: j.dupont" value={memberForm.username} onChange={e => setMemberForm(f => ({ ...f, username: e.target.value }))} />
              {txError && <p style={styles.errorText}>{txError}</p>}
              <div style={styles.btnRow}>
                <button style={styles.btnSecondary} onClick={closeModal}>Annuler</button>
                <button style={{ ...styles.btnPrimary, background: '#f44336' }} onClick={submitRemoveMember}>Retirer</button>
              </div>
            </div>
          )}
          <TxFeedback status={txStatus} result={txResult} onClose={closeModal} />
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function TxFeedback({ status, result, onClose }) {
  if (status === 'signing') return <div style={styles.statusBox}><div style={styles.spinner} /><p style={styles.statusText}>En attente de la signature MetaMask...</p><p style={styles.statusSub}>Confirme la popup MetaMask</p></div>
  if (status === 'pending') return <div style={styles.statusBox}><div style={styles.spinner} /><p style={styles.statusText}>Action broadcastée — agent en cours...</p><p style={styles.statusSub}>LDAP → IPFS → AuditLog on-chain</p></div>
  if (status === 'success') return (
    <div style={styles.statusBox}>
      <div style={styles.successIcon}>✓</div>
      <p style={{ ...styles.statusText, color: '#4caf50' }}>Action exécutée avec succès</p>
      {result?.ipfsCID && <div style={styles.resultBox}><p style={styles.resultLabel}>IPFS CID</p><p style={styles.resultValue}>{result.ipfsCID}</p></div>}
      {result?.txHash && <div style={styles.resultBox}><p style={styles.resultLabel}>AuditLog tx</p><p style={styles.resultValue}>{result.txHash}</p></div>}
      <button style={{ ...styles.btnPrimary, marginTop: '16px' }} onClick={onClose}>Fermer</button>
    </div>
  )
  return null
}

const styles = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:       { background: 'var(--bg-primary, #fff)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  modalTitle:  { margin: '0 0 24px', fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' },
  form:        { display: 'flex', flexDirection: 'column', gap: '12px' },
  label:       { fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' },
  input:       { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border, #ddd)', fontSize: '0.95rem', background: 'var(--bg-secondary, #f9f9f9)', color: 'var(--text-primary)', boxSizing: 'border-box' },
  errorText:   { color: '#ff4d4d', fontSize: '0.85rem', margin: '4px 0 0' },
  btnRow:      { display: 'flex', gap: '10px', marginTop: '20px' },
  btnPrimary:  { flex: 1, padding: '10px 20px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: '500' },
  btnSecondary:{ flex: 1, padding: '10px 20px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border, #ddd)', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer' },
  actionBtn:   { padding: '4px 8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#fff', lineHeight: '1.4', minWidth: '28px' },
  statusBox:   { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: '12px' },
  statusText:  { fontSize: '1rem', fontWeight: '500', color: 'var(--text-primary)', margin: 0 },
  statusSub:   { fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 },
  spinner:     { width: '40px', height: '40px', border: '3px solid #eee', borderTop: '3px solid #667eea', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  successIcon: { width: '48px', height: '48px', background: '#4caf50', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.5rem', fontWeight: 'bold' },
  resultBox:   { width: '100%', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '8px', padding: '10px 14px' },
  resultLabel: { fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 4px' },
  resultValue: { fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-primary)', margin: 0, wordBreak: 'break-all' }
}

export default Groups