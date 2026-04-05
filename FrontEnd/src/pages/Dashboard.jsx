// FrontEnd/src/pages/Dashboard.jsx
import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import DashboardHome from '../components/views/DashboardHome'
import Users from '../components/views/Users'
import Groups from '../components/views/Groups'
import Computers from '../components/views/Computers'
import Policies from '../components/views/Policies'
import Alerts from '../components/views/Alerts'
import StatCard from '../components/StatCard'
import RecentActivity from '../components/RecentActivity'
import { useStats } from '../hooks/useStats'
import { recentActivities } from '../data/mockData'

function Dashboard({ adminName, role, onDisconnect }) {
  const [activeItem, setActiveItem] = useState('dashboard')
  const { totalDIDs, activeAlerts, pendingActions, driftDetected, isLoading } = useStats()

  // Construire les stats cards depuis les données on-chain
  const stats = [
    {
      icon: '🖥️',
      label: 'Agents Online',
      value: '—',         // pas encore lisible sans agents réels
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
      case 'users':
        return <Users />
      case 'groups':
        return <Groups />
      case 'computers':
        return <Computers />
      case 'policies':
        return <Policies />
      case 'alerts':
        return <Alerts />
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