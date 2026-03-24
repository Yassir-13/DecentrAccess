import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [adminName, setAdminName] = useState('')

  const handleConnect = () => {
    // Mock connexion — pas de MetaMask réel
    setAdminName('Yassir Nacir')
    setIsConnected(true)
  }

  const handleDisconnect = () => {
    setIsConnected(false)
    setAdminName('')
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          isConnected
            ? <Navigate to="/dashboard" replace />
            : <Landing onConnect={handleConnect} />
        }
      />
      <Route
        path="/dashboard"
        element={
          isConnected
            ? <Dashboard adminName={adminName} onDisconnect={handleDisconnect} />
            : <Navigate to="/" replace />
        }
      />
    </Routes>
  )
}

export default App