import { useState, useEffect, useRef, useCallback } from 'react'
import { useUsers } from '../../hooks/useUsers'
import { useWeb3 } from '../../context/Web3Context'
import { onMessage, offMessage, sendRequest, onResult, offResult } from '../../services/p2pService'

const AGENT_PEER_ID = '12D3KooWNBwtCbWmjKCJyXGYa5Ni6gQwBuDJr96RNVGQ2tfqWB7a'

const EMPTY_FORM = { username: '', firstName: '', lastName: '', department: '', role: 'OPERATOR' }
const EMPTY_EDIT = { username: '', firstName: '', lastName: '', department: '' }

function Users() {
  const { users, isLoading, error } = useUsers()
  const { sendAction, initializeP2P, p2pReady, isConnected } = useWeb3()

  const [adUsers, setAdUsers]       = useState([])
  const [modalMode, setModalMode]   = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [editForm, setEditForm]     = useState(EMPTY_EDIT)
  const [selectedUser, setSelected] = useState(null)
  const [txStatus, setTxStatus]     = useState(null)
  const [txResult, setTxResult]     = useState(null)
  const [txError, setTxError]       = useState(null)
  const fetchDone                   = useRef(false)

  // ── 1. Init P2P ──
  useEffect(() => {
    if (isConnected && !p2pReady) initializeP2P(AGENT_PEER_ID)
  }, [isConnected, p2pReady, initializeP2P])

  // ── 2. Listeners AD + onResult + fetch initial ──
  useEffect(() => {
    if (!p2pReady) return

    // Handlers AD
    onMessage('AD_USERS', (data) => setAdUsers(data.users || []))
    onMessage('AD_USERS_UPDATE', (data) => setAdUsers(data.users || []))

    // Handler résultat d'action
    onResult((data) => {
      if (data.status === 'success') {
        setTxStatus('success')
        setTxResult({ ipfsCID: data.ipfsCID, txHash: data.txHash })
        // Rafraîchir la liste AD après une action réussie
        setTimeout(() => sendRequest({ type: 'getUsers' }), 1500)
      } else {
        setTxStatus('error')
        setTxError(data.error || 'Échec côté agent')
      }
    })

    // Fetch initial (une seule fois par montage)
    if (!fetchDone.current) {
      fetchDone.current = true
      sendRequest({ type: 'getUsers' })
    }

    return () => {
      offMessage('AD_USERS')
      offMessage('AD_USERS_UPDATE')
      offResult()
    }
  }, [p2pReady])

  const resetTx    = () => { setTxStatus(null); setTxResult(null); setTxError(null) }
  const closeModal = () => {
    if (txStatus === 'signing' || txStatus === 'pending') return
    setModalMode(null); setSelected(null); resetTx()
  }
  const execAction = async (actionType, payload) => {
    try {
      resetTx(); setTxStatus('signing')
      await sendAction(actionType, payload)
      setTxStatus('pending')
    } catch (err) {
      setTxStatus('error'); setTxError(err.message)
    }
  }

  const handleToggle     = (user) => {
    // On-chain user : extraire un username depuis les données disponibles
    setSelected({ ...user, username: user.username || user.name })
    setModalMode('confirm_toggle'); resetTx()
  }
  const handleEdit       = (user) => {
    const uname = user.username || user.name
    setSelected({ ...user, username: uname })
    setEditForm({ username: uname, firstName: user.name?.split(' ')[0] || '', lastName: user.name?.split(' ').slice(1).join(' ') || '', department: user.department || '' })
    setModalMode('edit'); resetTx()
  }
  const handleDelete     = (user) => { setSelected({ ...user, username: user.username || user.name }); setModalMode('delete'); resetTx() }
  const handleOpenCreate = () => { setForm(EMPTY_FORM); setModalMode('create'); resetTx() }
  const handleEditAD     = (u) => {
    setSelected({ name: u.displayName, username: u.username, department: u.department })
    setEditForm({ username: u.username, firstName: u.displayName?.split(' ')[0] || '', lastName: u.displayName?.split(' ').slice(1).join(' ') || '', department: u.department || '' })
    setModalMode('edit'); resetTx()
  }
  const handleDeleteAD   = (u) => { setSelected({ name: u.displayName, username: u.username }); setModalMode('delete'); resetTx() }
  const handleToggleAD   = (u) => {
    // Mappe les champs AD → format attendu par submitToggle
    setSelected({ name: u.displayName, username: u.username, active: !u.disabled })
    setModalMode('confirm_toggle')
    resetTx()
  }

  const submitCreate = async () => {
    if (!form.username || !form.firstName || !form.lastName) { setTxError('Remplis tous les champs obligatoires.'); return }
    await execAction('CREATE_USER', { username: form.username, firstName: form.firstName, lastName: form.lastName, department: form.department, role: form.role })
  }
  const submitEdit = async () => {
    if (!editForm.firstName || !editForm.lastName) { setTxError('Prénom et Nom sont obligatoires.'); return }
    await execAction('MODIFY_USER', { username: selectedUser.username || selectedUser.name, firstName: editForm.firstName, lastName: editForm.lastName, department: editForm.department })
  }
  const submitDelete = async () => {
    await execAction('DELETE_USER', { username: selectedUser.username || selectedUser.name })
  }
  const submitToggle = async () => {
    const actionType = selectedUser.active ? 'DISABLE_USER' : 'ACTIVATE_USER'
    await execAction(actionType, { username: selectedUser.username || selectedUser.name })
  }

  // Handlers onChange sécurisés (capture value avant setter async)
  const onChangeFirst  = (e) => { const v = e.target.value; setEditForm(f => ({ ...f, firstName:  v })) }
  const onChangeLast   = (e) => { const v = e.target.value; setEditForm(f => ({ ...f, lastName:   v })) }
  const onChangeDept   = (e) => { const v = e.target.value; setEditForm(f => ({ ...f, department: v })) }

  const onChangeFormUser = (e) => { const v = e.target.value; setForm(f => ({ ...f, username:   v })) }
  const onChangeFormFirst= (e) => { const v = e.target.value; setForm(f => ({ ...f, firstName:  v })) }
  const onChangeFormLast = (e) => { const v = e.target.value; setForm(f => ({ ...f, lastName:   v })) }
  const onChangeFormDept = (e) => { const v = e.target.value; setForm(f => ({ ...f, department: v })) }
  const onChangeFormRole = (e) => { const v = e.target.value; setForm(f => ({ ...f, role:       v })) }

  if (isLoading) return <div className="activity-section"><p style={{ color: 'var(--text-secondary)' }}>Chargement des utilisateurs on-chain...</p></div>
  if (error)     return <div className="activity-section"><p style={{ color: '#ff4d4d' }}>Erreur : {error}</p></div>

  return (
    <div className="activity-section">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>Identités On-Chain ({users.length})</h2>
        <button className="landing__connect-btn" style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }} onClick={handleOpenCreate}>+ Nouvel Utilisateur</button>
      </div>

      {/* ── Tableau DIDs on-chain ── */}
      <table className="activity-table">
        <thead><tr><th>Nom</th><th>Adresse</th><th>Département</th><th>Rôle</th><th>Statut</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.address}>
              <td style={{ fontWeight: '500' }}>{user.name}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{user.address.slice(0, 6)}...{user.address.slice(-4)}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{user.department}</td>
              <td><span className={`badge badge--${user.role === 'SUPER_ADMIN' ? 'purple' : user.role === 'ADMIN' ? 'info' : user.role === 'OPERATOR' ? 'success' : 'warning'}`}>{user.role}</span></td>
              <td><span className={`badge badge--${user.active ? 'success' : 'danger'}`}>{user.active ? 'Actif' : 'Inactif'}</span></td>
              <td>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  <button style={{ ...styles.actionBtn, background: user.active ? '#ff9800' : '#4caf50' }} onClick={() => handleToggle(user)} title={user.active ? 'Désactiver' : 'Activer'}>{user.active ? '⏸' : '▶'}</button>
                  <button style={{ ...styles.actionBtn, background: '#2196f3' }} onClick={() => handleEdit(user)} title="Modifier">✏️</button>
                  <button style={{ ...styles.actionBtn, background: '#f44336' }} onClick={() => handleDelete(user)} title="Supprimer">🗑</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Tableau AD réel ── */}
      <h2 className="activity-section__title" style={{ marginTop: '32px' }}>Utilisateurs Active Directory ({adUsers.length})</h2>
      <table className="activity-table">
        <thead><tr><th>Username</th><th>Nom complet</th><th>Département</th><th>Statut AD</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
        <tbody>
          {adUsers.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>En attente des données AD...</td></tr>
          ) : adUsers.map((u) => (
            <tr key={u.username}>
              <td style={{ fontFamily: 'monospace' }}>{u.username}</td>
              <td style={{ fontWeight: '500' }}>{u.displayName || '—'}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{u.department || '—'}</td>
              <td><span className={`badge badge--${u.disabled ? 'danger' : 'success'}`}>{u.disabled ? 'Désactivé' : 'Actif'}</span></td>
              <td>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  <button style={{ ...styles.actionBtn, background: u.disabled ? '#4caf50' : '#ff9800' }} onClick={() => handleToggleAD(u)} title={u.disabled ? 'Activer' : 'Désactiver'}>{u.disabled ? '▶' : '⏸'}</button>
                  <button style={{ ...styles.actionBtn, background: '#2196f3' }} onClick={() => handleEditAD(u)} title="Modifier">✏️</button>
                  <button style={{ ...styles.actionBtn, background: '#f44336' }} onClick={() => handleDeleteAD(u)} title="Supprimer">🗑</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ════ MODALS ════ */}

      {modalMode === 'create' && (
        <Modal title="Nouvel Utilisateur AD" onClose={closeModal}>
          {(txStatus === null || txStatus === 'error') && (
            <div style={styles.form}>
              <label style={styles.label}>Nom d'utilisateur *</label>
              <input style={styles.input} placeholder="ex: j.dupont" value={form.username} onChange={onChangeFormUser} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}><label style={styles.label}>Prénom *</label><input style={styles.input} placeholder="Jean" value={form.firstName} onChange={onChangeFormFirst} /></div>
                <div style={{ flex: 1 }}><label style={styles.label}>Nom *</label><input style={styles.input} placeholder="Dupont" value={form.lastName} onChange={onChangeFormLast} /></div>
              </div>
              <label style={styles.label}>Département</label>
              <input style={styles.input} placeholder="ex: IT, Finance, RH..." value={form.department} onChange={onChangeFormDept} />
              <label style={styles.label}>Rôle</label>
              <select style={styles.input} value={form.role} onChange={onChangeFormRole}>
                <option value="OPERATOR">OPERATOR</option>
                <option value="ADMIN">ADMIN</option>
                <option value="AUDITOR">AUDITOR</option>
              </select>
              {txError && <p style={styles.errorText}>{txError}</p>}
              <div style={styles.btnRow}>
                <button style={styles.btnSecondary} onClick={closeModal}>Annuler</button>
                <button style={styles.btnPrimary} onClick={submitCreate}>Signer & Envoyer</button>
              </div>
            </div>
          )}
          <TxFeedback status={txStatus} result={txResult} error={txError} onClose={closeModal} />
        </Modal>
      )}

      {modalMode === 'edit' && selectedUser && (
        <Modal title={`Modifier — ${selectedUser.name}`} onClose={closeModal}>
          {(txStatus === null || txStatus === 'error') && (
            <div style={styles.form}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}><label style={styles.label}>Prénom *</label><input style={styles.input} value={editForm.firstName} onChange={onChangeFirst} /></div>
                <div style={{ flex: 1 }}><label style={styles.label}>Nom *</label><input style={styles.input} value={editForm.lastName} onChange={onChangeLast} /></div>
              </div>
              <label style={styles.label}>Département</label>
              <input style={styles.input} value={editForm.department} onChange={onChangeDept} />
              {txError && <p style={styles.errorText}>{txError}</p>}
              <div style={styles.btnRow}>
                <button style={styles.btnSecondary} onClick={closeModal}>Annuler</button>
                <button style={styles.btnPrimary} onClick={submitEdit}>Signer & Envoyer</button>
              </div>
            </div>
          )}
          <TxFeedback status={txStatus} result={txResult} error={txError} onClose={closeModal} />
        </Modal>
      )}

      {modalMode === 'delete' && selectedUser && (
        <Modal title="Confirmer la suppression" onClose={closeModal}>
          {(txStatus === null || txStatus === 'error') && (
            <div style={styles.form}>
              <p style={{ color: 'var(--text-primary)', margin: '0 0 8px' }}>Es-tu sûr de vouloir supprimer <strong>{selectedUser.name}</strong> ?</p>
              <p style={{ color: '#ff4d4d', fontSize: '0.85rem', margin: '0 0 20px' }}>Cette action est irréversible et sera ancrée on-chain.</p>
              {txError && <p style={styles.errorText}>{txError}</p>}
              <div style={styles.btnRow}>
                <button style={styles.btnSecondary} onClick={closeModal}>Annuler</button>
                <button style={{ ...styles.btnPrimary, background: '#f44336' }} onClick={submitDelete}>Supprimer</button>
              </div>
            </div>
          )}
          <TxFeedback status={txStatus} result={txResult} error={txError} onClose={closeModal} />
        </Modal>
      )}

      {modalMode === 'confirm_toggle' && selectedUser && (
        <Modal title={selectedUser.active ? 'Désactiver le compte' : 'Activer le compte'} onClose={closeModal}>
          {(txStatus === null || txStatus === 'error') && (
            <div style={styles.form}>
              <p style={{ color: 'var(--text-primary)', margin: '0 0 20px' }}>
                {selectedUser.active ? `Désactiver le compte de ${selectedUser.name} ?` : `Activer le compte de ${selectedUser.name} ?`}
              </p>
              {txError && <p style={styles.errorText}>{txError}</p>}
              <div style={styles.btnRow}>
                <button style={styles.btnSecondary} onClick={closeModal}>Annuler</button>
                <button style={{ ...styles.btnPrimary, background: selectedUser.active ? '#ff9800' : '#4caf50' }} onClick={submitToggle}>
                  {selectedUser.active ? 'Désactiver' : 'Activer'}
                </button>
              </div>
            </div>
          )}
          <TxFeedback status={txStatus} result={txResult} error={txError} onClose={closeModal} />
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

function TxFeedback({ status, result, error, onClose }) {
  if (status === 'signing') return (
    <div style={styles.statusBox}>
      <div style={styles.spinner} />
      <p style={styles.statusText}>En attente de la signature MetaMask...</p>
      <p style={styles.statusSub}>Confirme la popup MetaMask</p>
    </div>
  )
  if (status === 'pending') return (
    <div style={styles.statusBox}>
      <div style={styles.spinner} />
      <p style={styles.statusText}>Action broadcastée — agent en cours d'exécution...</p>
      <p style={styles.statusSub}>Vérification → LDAP → IPFS → AuditLog on-chain</p>
    </div>
  )
  if (status === 'success') return (
    <div style={styles.statusBox}>
      <div style={styles.successIcon}>✓</div>
      <p style={{ ...styles.statusText, color: '#4caf50' }}>Action exécutée avec succès</p>
      {result?.ipfsCID && <div style={styles.resultBox}><p style={styles.resultLabel}>IPFS CID</p><p style={styles.resultValue}>{result.ipfsCID}</p></div>}
      {result?.txHash  && <div style={styles.resultBox}><p style={styles.resultLabel}>AuditLog tx</p><p style={styles.resultValue}>{result.txHash}</p></div>}
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

export default Users