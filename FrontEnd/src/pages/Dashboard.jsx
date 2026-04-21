// FrontEnd/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import { Contract } from 'ethers'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import DashboardHome from '../components/views/DashboardHome'
import Users from '../components/views/Users'
import Groups from '../components/views/Groups'
import Computers from '../components/views/Computers'
import Policies from '../components/views/Policies'
import Alerts from '../components/views/Alerts'
import AuditLogs from '../components/views/AuditLogs'
import Reputation from '../components/views/Reputation'
import Recovery from '../components/views/Recovery'
import StatCard from '../components/StatCard'
import RecentActivity from '../components/RecentActivity'
import { useStats } from '../hooks/useStats'
import { useWeb3 } from '../context/Web3Context'
import { recentActivities } from '../data/mockData'
import contracts from '../config/contracts.json'

const AGENT_REGISTRY_ABI = [
  "function getOnlineAgentCount() view returns (uint256)"
]

function Dashboard({ adminName, role, onDisconnect }) {
  const [activeItem, setActiveItem] = useState('dashboard')
  const [agentsOnline, setAgentsOnline] = useState('—')
  const { totalDIDs, activeAlerts, pendingActions, driftDetected, isLoading } = useStats()
  const { provider, isConnected } = useWeb3()

  // Agents Online — branché on-chain
  useEffect(() => {
    if (!isConnected || !provider) return
    const fetchAgents = async () => {
      try {
        const agentRegistry = new Contract(contracts.AgentRegistry, AGENT_REGISTRY_ABI, provider)
        const count = await agentRegistry.getOnlineAgentCount()
        setAgentsOnline(String(Number(count)))
      } catch (err) {
        console.warn('[Dashboard] Erreur AgentRegistry :', err.message)
      }
    }
    fetchAgents()
    const interval = setInterval(fetchAgents, 30000) // refresh toutes les 30s
    return () => clearInterval(interval)
  }, [provider, isConnected])

  const stats = [
    {
      icon: '🖥️',
      label: 'Agents Online',
      value: agentsOnline,
      trend: null,
      trendDirection: null,
      color: 'green'
    },
    {
      icon: '🔥',
      label: 'Active Alerts',
      value: isLoading ? '...' : String(activeAlerts),
      trend: null,
      trendDirection: null,
      color: 'orange'
    },
    {
      icon: '⏳',
      label: 'Pending Actions',
      value: isLoading ? '...' : String(pendingActions),
      trend: null,
      trendDirection: null,
      color: 'purple'
    },
    {
      icon: '🔒',
      label: 'AD Drift Status',
      value: isLoading ? '...' : driftDetected ? '⚠️ DRIFT' : '✅ OK',
      trend: null,
      trendDirection: null,
      color: 'blue'
    },
  ]

  const renderContent = () => {
    switch (activeItem) {
      case 'dashboard':
        return (
          <DashboardHome
            stats={stats}
            recentActivities={recentActivities}
            StatCard={StatCard}
            RecentActivity={RecentActivity}
          />
        )
      case 'users':       return <Users />
      case 'groups':      return <Groups />
      case 'computers':   return <Computers />
      case 'policies':    return <Policies />
      case 'alerts':      return <Alerts />
      case 'auditlogs':   return <AuditLogs />
      case 'reputation':  return <Reputation />
      case 'recovery':    return <Recovery />
      default:
        return (
          <div className="activity-section">
            <h2 className="activity-section__title">
              Page "{activeItem}" en construction
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Cette fonctionnalité n'est pas encore disponible.
            </p>
          </div>
        )
    }
  }

  return (
    <div className="dashboard">
      <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} onDisconnect={onDisconnect} />
      <main className="dashboard__main">
        <Header adminName={adminName} role={role} />
        {renderContent()}
      </main>
    </div>
  )
}

export default Dashboard