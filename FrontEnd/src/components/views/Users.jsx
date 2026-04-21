// FrontEnd/src/components/views/Users.jsx
import { useState, useEffect, useRef } from 'react'
import { useUsers } from '../../hooks/useUsers'
import { useWeb3 } from '../../context/Web3Context'

// ⚠️ PeerID de l'agent — visible dans la console agent au démarrage
// [P2P] Nœud démarré — PeerID: 12D3Koo...
const AGENT_PEER_ID = '12D3KooWPYhaX49mBZgsAMEnKD7Tva7gpug98BXojrzJ9ThgLHLi'

const EMPTY_FORM = { username: '', firstName: '', lastName: '', department: '', role: 'OPERATOR' }

function Users() {
  const { users, isLoading, error } = useUsers()
  const { sendAction, initializeP2P, onResult, p2pReady, isConnected } = useWeb3()

  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [txStatus, setTxStatus]       = useState(null)   // null | 'signing' | 'pending' | 'success' | 'error'
  const [txResult, setTxResult]       = useState(null)   // { ipfsCID, txHash }
  const [txError, setTxError]         = useState(null)
  const resultListenerSet             = useRef(false)

  // Init P2P une seule fois après connexion MetaMask
  useEffect(() => {
    if (isConnected && !p2pReady) {
      initializeP2P(AGENT_PEER_ID)
    }
  }, [isConnected, p2pReady, initializeP2P])

  // Écoute les résultats P2P de l'agent (une seule fois)
  useEffect(() => {
    if (!p2pReady || resultListenerSet.current) return
    resultListenerSet.current = true

    onResult((data) => {
      console.log('[Users] Résultat reçu :', data)
      if (data.status === 'success') {
        setTxStatus('success')
        setTxResult({ ipfsCID: data.ipfsCID, txHash: data.txHash })
      } else {
        setTxStatus('error')
        setTxError(data.error || 'Échec côté agent')
      }
    })
  }, [p2pReady, onResult])

  const handleOpenModal = () => {
    setForm(EMPTY_FORM)
    setTxStatus(null)
    setTxResult(null)
    setTxError(null)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    if (txStatus === 'signing' || txStatus === 'pending') return // bloque fermeture pendant tx
    setShowModal(false)
    setTxStatus(null)
  }

  const handleSubmit = async () => {
    if (!form.username || !form.firstName || !form.lastName) {
      setTxError('Remplis tous les champs obligatoires.')
      return
    }

    try {
      setTxError(null)
      setTxStatus('signing')

      // Signe + broadcaste via P2P
      await sendAction('CREATE_USER', {
        username:   form.username,
        firstName:  form.firstName,
        lastName:   form.lastName,
        department: form.department,
        role:       form.role
      })

      setTxStatus('pending') // en attente de la réponse de l'agent

    } catch (err) {
      console.error('[Users] Erreur sendAction :', err)
      setTxStatus('error')
      setTxError(err.message)
    }
  }

  // ── Rendu principal ──────────────────────────────────────────────

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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="activity-section__title" style={{ margin: 0 }}>
          Gestion des Utilisateurs AD ({users.length})
        </h2>
        <button
          className="landing__connect-btn"
          style={{ margin: 0, padding: '8px 16px', fontSize: '0.9rem' }}
          onClick={handleOpenModal}
        >
          + Nouvel Utilisateur
        </button>
      </div>

      {/* Tableau */}
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

      {/* ── Modal ── */}
      {showModal && (
        <div style={styles.overlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>

            <h3 style={styles.modalTitle}>Nouvel Utilisateur AD</h3>

            {/* Formulaire — masqué pendant/après tx */}
            {(txStatus === null || txStatus === 'error') && (
              <div style={styles.form}>
                <label style={styles.label}>Nom d'utilisateur *</label>
                <input
                  style={styles.input}
                  placeholder="ex: j.dupont"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                />

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>Prénom *</label>
                    <input
                      style={styles.input}
                      placeholder="Jean"
                      value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>Nom *</label>
                    <input
                      style={styles.input}
                      placeholder="Dupont"
                      value={form.lastName}
                      onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    />
                  </div>
                </div>

                <label style={styles.label}>Département</label>
                <input
                  style={styles.input}
                  placeholder="ex: IT, Finance, RH..."
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                />

                <label style={styles.label}>Rôle</label>
                <select
                  style={styles.input}
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="OPERATOR">OPERATOR</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="AUDITOR">AUDITOR</option>
                </select>

                {txError && (
                  <p style={{ color: '#ff4d4d', fontSize: '0.85rem', margin: '8px 0 0' }}>{txError}</p>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button style={styles.btnSecondary} onClick={handleCloseModal}>Annuler</button>
                  <button style={styles.btnPrimary} onClick={handleSubmit}>
                    Signer &amp; Envoyer
                  </button>
                </div>
              </div>
            )}

            {/* Signing */}
            {txStatus === 'signing' && (
              <div style={styles.statusBox}>
                <div style={styles.spinner} />
                <p style={styles.statusText}>En attente de la signature MetaMask...</p>
                <p style={styles.statusSub}>Confirme la popup MetaMask</p>
              </div>
            )}

            {/* Pending */}
            {txStatus === 'pending' && (
              <div style={styles.statusBox}>
                <div style={styles.spinner} />
                <p style={styles.statusText}>Action broadcastée — agent en cours d'exécution...</p>
                <p style={styles.statusSub}>Vérification signature → IPFS → AuditLog on-chain</p>
              </div>
            )}

            {/* Success */}
            {txStatus === 'success' && (
              <div style={styles.statusBox}>
                <div style={styles.successIcon}>✓</div>
                <p style={{ ...styles.statusText, color: '#4caf50' }}>Action exécutée avec succès</p>
                {txResult?.ipfsCID && (
                  <div style={styles.resultBox}>
                    <p style={styles.resultLabel}>IPFS CID</p>
                    <p style={styles.resultValue}>{txResult.ipfsCID}</p>
                  </div>
                )}
                {txResult?.txHash && (
                  <div style={styles.resultBox}>
                    <p style={styles.resultLabel}>AuditLog tx</p>
                    <p style={styles.resultValue}>{txResult.txHash}</p>
                  </div>
                )}
                <button style={{ ...styles.btnPrimary, marginTop: '16px' }} onClick={handleCloseModal}>
                  Fermer
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles inline (pas de dépendance CSS externe) ──────────────────
const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    background: 'var(--bg-primary, #fff)',
    borderRadius: '16px',
    padding: '32px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)'
  },
  modalTitle: {
    margin: '0 0 24px',
    fontSize: '1.2rem',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' },
  input: {
    width: '100%', padding: '10px 12px',
    borderRadius: '8px', border: '1px solid var(--border, #ddd)',
    fontSize: '0.95rem', background: 'var(--bg-secondary, #f9f9f9)',
    color: 'var(--text-primary)', boxSizing: 'border-box'
  },
  btnPrimary: {
    flex: 1, padding: '10px 20px',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', border: 'none', borderRadius: '8px',
    fontSize: '0.95rem', cursor: 'pointer', fontWeight: '500'
  },
  btnSecondary: {
    flex: 1, padding: '10px 20px',
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid var(--border, #ddd)', borderRadius: '8px',
    fontSize: '0.95rem', cursor: 'pointer'
  },
  statusBox: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '20px 0', gap: '12px'
  },
  statusText: { fontSize: '1rem', fontWeight: '500', color: 'var(--text-primary)', margin: 0 },
  statusSub:  { fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 },
  spinner: {
    width: '40px', height: '40px',
    border: '3px solid #eee',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  successIcon: {
    width: '48px', height: '48px',
    background: '#4caf50', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '1.5rem', fontWeight: 'bold'
  },
  resultBox: {
    width: '100%', background: 'var(--bg-secondary, #f5f5f5)',
    borderRadius: '8px', padding: '10px 14px'
  },
  resultLabel: { fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 4px' },
  resultValue: {
    fontSize: '0.78rem', fontFamily: 'monospace',
    color: 'var(--text-primary)', margin: 0,
    wordBreak: 'break-all'
  }
}

export default Users