// FrontEnd/src/components/views/Settings.jsx
import { useState, useEffect } from 'react'
import { Contract, ethers } from 'ethers'
import { useWeb3 } from '../../context/Web3Context'
import { useDIDs } from '../../hooks/useDIDs'
import contracts from '../../config/contracts.json'

const FAUCET_ABI = [
  "function balance() view returns (uint256)",
  "function defaultAmount() view returns (uint256)",
  "function cooldown() view returns (uint256)",
  "function lastFunded(address) view returns (uint256)",
  "function canFund(address _recipient) view returns (bool, string)",
  "function fund(address _recipient) external",
  "function fundAmount(address _recipient, uint256 _amount) external",
  "function setDefaultAmount(uint256 _newAmount) external",
  "function setCooldown(uint256 _newCooldown) external"
]

function Settings() {
  const { provider, signer, isConnected } = useWeb3()
  const { dids } = useDIDs()

  const [faucetBalance, setFaucetBalance]   = useState(null)
  const [defaultAmount, setDefaultAmountVal]= useState(null)
  const [cooldown, setCooldownVal]          = useState(null)
  const [loadingInfo, setLoadingInfo]       = useState(true)

  // État par adresse pour le bouton Fund
  const [fundStates, setFundStates]   = useState({})
  const [fundErrors, setFundErrors]   = useState({})
  const [canFundMap, setCanFundMap]   = useState({})

  // Paramètres modifiables
  const [newAmount, setNewAmount]     = useState('')
  const [newCooldown, setNewCooldown] = useState('')
  const [paramTx, setParamTx]         = useState(null)  // null | 'signing' | 'pending' | 'success' | 'error'
  const [paramError, setParamError]   = useState(null)

  // Charger infos faucet
  const loadFaucetInfo = async () => {
    if (!provider) return
    try {
      const faucet = new Contract(contracts.FaucetManager, FAUCET_ABI, provider)
      const [bal, amt, cd] = await Promise.all([
        faucet.balance(),
        faucet.defaultAmount(),
        faucet.cooldown()
      ])
      setFaucetBalance(ethers.formatEther(bal))
      setDefaultAmountVal(ethers.formatEther(amt))
      setCooldownVal(Number(cd))
      setLoadingInfo(false)

      // Vérifier canFund pour chaque DID
      const checks = {}
      await Promise.all(dids.map(async (did) => {
        try {
          const [ok, reason] = await faucet.canFund(did.address)
          checks[did.address] = { ok, reason }
        } catch { checks[did.address] = { ok: false, reason: 'Erreur' } }
      }))
      setCanFundMap(checks)
    } catch (err) {
      console.error('[Settings] Erreur faucet info :', err)
      setLoadingInfo(false)
    }
  }

  useEffect(() => { if (isConnected) loadFaucetInfo() }, [provider, isConnected, dids.length])

  const setFundState = (addr, s) => setFundStates(p => ({ ...p, [addr]: s }))
  const setFundError = (addr, e) => setFundErrors(p => ({ ...p, [addr]: e }))

  const handleFund = async (did) => {
    if (!signer) return
    try {
      setFundState(did.address, 'signing')
      setFundError(did.address, null)
      const faucet = new Contract(contracts.FaucetManager, FAUCET_ABI, signer)
      const tx = await faucet.fund(did.address)
      setFundState(did.address, 'pending')
      await tx.wait()
      setFundState(did.address, 'success')
      setTimeout(() => { setFundState(did.address, null); loadFaucetInfo() }, 1500)
    } catch (err) {
      setFundState(did.address, 'error')
      setFundError(did.address, err.reason || err.message)
    }
  }

  const handleSetAmount = async () => {
    if (!signer || !newAmount) return
    try {
      setParamTx('signing'); setParamError(null)
      const faucet = new Contract(contracts.FaucetManager, FAUCET_ABI, signer)
      const tx = await faucet.setDefaultAmount(ethers.parseEther(newAmount))
      setParamTx('pending')
      await tx.wait()
      setParamTx('success')
      setNewAmount('')
      setTimeout(() => { setParamTx(null); loadFaucetInfo() }, 1500)
    } catch (err) {
      setParamTx('error'); setParamError(err.reason || err.message)
    }
  }

  const handleSetCooldown = async () => {
    if (!signer || newCooldown === '') return
    try {
      setParamTx('signing'); setParamError(null)
      const faucet = new Contract(contracts.FaucetManager, FAUCET_ABI, signer)
      const tx = await faucet.setCooldown(Number(newCooldown) * 3600) // heures → secondes
      setParamTx('pending')
      await tx.wait()
      setParamTx('success')
      setNewCooldown('')
      setTimeout(() => { setParamTx(null); loadFaucetInfo() }, 1500)
    } catch (err) {
      setParamTx('error'); setParamError(err.reason || err.message)
    }
  }

  const formatCooldown = (s) => {
    if (s === 0) return 'Aucun'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}min`
  }

  return (
    <div className="activity-section">

      <h2 className="activity-section__title" style={{ marginBottom: '24px' }}>Paramètres</h2>

      {/* ── Faucet Info ── */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>💧 Faucet Manager</h3>
        <p style={styles.cardSub}>Distribue de l'ETH aux wallets enregistrés pour payer le gas.</p>

        {loadingInfo ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Chargement...</p>
        ) : (
          <div style={styles.infoGrid}>
            <InfoBox label="Balance du faucet" value={`${faucetBalance} ETH`} highlight={parseFloat(faucetBalance) < 1} />
            <InfoBox label="Montant par défaut" value={`${defaultAmount} ETH`} />
            <InfoBox label="Cooldown" value={formatCooldown(cooldown)} />
            <InfoBox label="Wallets éligibles" value={`${Object.values(canFundMap).filter(c => c.ok).length} / ${dids.length}`} />
          </div>
        )}
      </div>

      {/* ── Paramètres faucet ── */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>⚙️ Configurer le Faucet</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={styles.label}>Nouveau montant par défaut (ETH)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={styles.input} placeholder="ex: 0.5" type="number" step="0.1" min="0.1"
                value={newAmount} onChange={e => setNewAmount(e.target.value)} />
              <button style={styles.btnSmall} onClick={handleSetAmount}
                disabled={!newAmount || paramTx === 'signing' || paramTx === 'pending'}>
                Appliquer
              </button>
            </div>
          </div>
          <div>
            <label style={styles.label}>Nouveau cooldown (heures, 0 = aucun)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={styles.input} placeholder="ex: 24" type="number" min="0"
                value={newCooldown} onChange={e => setNewCooldown(e.target.value)} />
              <button style={styles.btnSmall} onClick={handleSetCooldown}
                disabled={newCooldown === '' || paramTx === 'signing' || paramTx === 'pending'}>
                Appliquer
              </button>
            </div>
          </div>
        </div>
        {paramTx === 'signing'  && <p style={styles.txMsg}>⏳ En attente de signature MetaMask...</p>}
        {paramTx === 'pending'  && <p style={styles.txMsg}>⏳ Transaction on-chain...</p>}
        {paramTx === 'success'  && <p style={{ ...styles.txMsg, color: '#4caf50' }}>✓ Paramètre mis à jour</p>}
        {paramTx === 'error'    && <p style={{ ...styles.txMsg, color: '#ff4d4d' }}>✗ {paramError}</p>}
      </div>

      {/* ── Distribution manuelle ── */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🪙 Distribuer de l'ETH</h3>
        <p style={styles.cardSub}>Envoie {defaultAmount} ETH à un wallet enregistré. Utile si un admin est à sec.</p>

        {dids.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Aucun DID enregistré.</p>
        ) : (
          <table className="activity-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Adresse</th>
                <th>Type</th>
                <th>Éligible</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {dids.map((did) => {
                const check    = canFundMap[did.address]
                const fState   = fundStates[did.address]
                const fError   = fundErrors[did.address]
                const eligible = check?.ok
                return (
                  <tr key={did.address}>
                    <td style={{ fontWeight: '500' }}>{did.name !== did.address ? did.name : did.hostname}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {did.address.slice(0, 6)}...{did.address.slice(-4)}
                    </td>
                    <td><span className={`badge badge--${did.entityType === 'Admin' ? 'info' : did.entityType === 'Machine' ? 'purple' : 'warning'}`}>{did.entityType}</span></td>
                    <td>
                      {check ? (
                        <span className={`badge badge--${eligible ? 'success' : 'warning'}`} title={check.reason}>
                          {eligible ? '✓ Oui' : check.reason}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {fState === 'success' && <span className="badge badge--success">✓ Envoyé</span>}
                      {fState === 'error'   && <span className="badge badge--danger" title={fError}>✗ Échec</span>}
                      {(fState === 'signing' || fState === 'pending') && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <div style={styles.spinner} />
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {fState === 'signing' ? 'Signature...' : 'On-chain...'}
                          </span>
                        </div>
                      )}
                      {!fState && (
                        <button
                          style={{ ...styles.btnFund, opacity: eligible ? 1 : 0.4, cursor: eligible ? 'pointer' : 'not-allowed' }}
                          onClick={() => eligible && handleFund(did)}
                          disabled={!eligible || !isConnected}
                          title={!eligible ? check?.reason : `Envoyer ${defaultAmount} ETH`}
                        >
                          Financer
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}

function InfoBox({ label, value, highlight }) {
  return (
    <div style={{ background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '8px', padding: '12px 16px' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: '1rem', fontWeight: '600', color: highlight ? '#ff9800' : 'var(--text-primary)', margin: 0 }}>{value}</p>
    </div>
  )
}

const styles = {
  card:      { background: 'var(--bg-secondary, #f9f9f9)', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px', border: '1px solid var(--border, #eee)' },
  cardTitle: { margin: '0 0 6px', fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)' },
  cardSub:   { margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' },
  infoGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' },
  label:     { display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px' },
  input:     { flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border, #ddd)', fontSize: '0.9rem', background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)' },
  btnSmall:  { padding: '8px 14px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnFund:   { padding: '4px 12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '500' },
  txMsg:     { margin: '10px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' },
  spinner:   { width: '14px', height: '14px', border: '2px solid #eee', borderTop: '2px solid #667eea', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }
}

export default Settings