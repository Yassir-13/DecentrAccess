import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import DashboardHome from '../components/views/DashboardHome'
import Users from '../components/views/Users'
import Groups from '../components/views/Groups'
import Computers from '../components/views/Computers'
import Policies from '../components/views/Policies'
import Alerts from '../components/views/Alerts'

// Mock Data
import { stats, recentActivities } from '../data/mockData'
import { usersData, groupsData, computersData, policiesData, alertsData } from '../data/mockPagesData'
import StatCard from '../components/StatCard'
import RecentActivity from '../components/RecentActivity'

function Dashboard({ adminName, onDisconnect }) {
  const [activeItem, setActiveItem] = useState('dashboard')

  const renderContent = () => {
    switch (activeItem) {
      case 'dashboard':
        return <DashboardHome stats={stats} recentActivities={recentActivities} StatCard={StatCard} RecentActivity={RecentActivity} />
      case 'users':
        return <Users data={usersData} />
      case 'groups':
        return <Groups data={groupsData} />
      case 'computers':
        return <Computers data={computersData} />
      case 'policies':
        return <Policies data={policiesData} />
      case 'alerts':
        return <Alerts data={alertsData} />
      // Placeholder for other pages
      default:
        return (
          <div className="activity-section">
            <h2 className="activity-section__title">Page "{activeItem}" en construction</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Cette fonctionnalité n'est pas encore mockée dans le prototype.</p>
          </div>
        )
    }
  }

  return (
    <div className="dashboard">
      <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} onDisconnect={onDisconnect} />
      <main className="dashboard__main">
        <Header adminName={adminName} />
        {renderContent()}
      </main>
    </div>
  )
}

export default Dashboard
