// FrontEnd/src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useWeb3 } from './context/Web3Context'
import { useIdentity } from './hooks/useIdentity'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'

function App() {
  const { isConnected, connect, disconnect, error } = useWeb3()
  const { hasDID, role, metadata, isLoading } = useIdentity()

  // Nom affiché : metadata.name si dispo, sinon adresse courte
  const adminName = metadata?.name || null

  if (isConnected && isLoading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', background: '#0a0e1a', color: '#fff', fontSize: '1.2rem'
      }}>
        Vérification de l'identité on-chain...
      </div>
    )
  }

  if (isConnected && !isLoading && !hasDID) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', height: '100vh', background: '#0a0e1a', color: '#fff', gap: '1rem'
      }}>
        <h2>⛔ Accès refusé</h2>
        <p style={{ color: '#aaa' }}>Ce wallet n'est pas enregistré dans DecentrAccess.</p>
        <button onClick={disconnect} style={{
          padding: '0.5rem 1.5rem', borderRadius: '8px',
          background: '#ff4d4d', color: '#fff', border: 'none', cursor: 'pointer'
        }}>
          Déconnecter
        </button>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          isConnected
            ? <Navigate to="/dashboard" replace />
            : <Landing onConnect={connect} error={error} />
        }
      />
      <Route
        path="/dashboard"
        element={
          isConnected && hasDID
            ? <Dashboard adminName={adminName} role={role} onDisconnect={disconnect} />
            : <Navigate to="/" replace />
        }
      />
    </Routes>
  )
}

export default App