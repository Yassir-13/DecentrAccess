// FrontEnd/src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useWeb3 } from './context/Web3Context'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'

function App() {
  const { isConnected, address, connect, disconnect, error } = useWeb3()

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
          isConnected
            ? <Dashboard adminName={address} onDisconnect={disconnect} />
            : <Navigate to="/" replace />
        }
      />
    </Routes>
  )
}

export default App