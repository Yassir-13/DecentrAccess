import { useState } from 'react'

const menuItems = [
  { icon: '', label: 'Dashboard', id: 'dashboard' },
  { icon: '', label: 'Users', id: 'users' },
  { icon: '', label: 'Groups', id: 'groups' },
  { icon: '', label: 'Computers', id: 'computers' },
  { icon: '', label: 'Audit Logs', id: 'audit' },
  { icon: '', label: 'Policies', id: 'policies' },
  { icon: '', label: 'Alerts', id: 'alerts' },
  { icon: '', label: 'Reputation', id: 'reputation' },
  { icon: '', label: 'Recovery', id: 'recovery' },
  { icon: '', label: 'Settings', id: 'settings' },
]

function Sidebar({ activeItem, setActiveItem, onDisconnect }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">DecentrAccess</div>

      <nav className="sidebar__nav">
        {menuItems.map(item => (
          <div
            key={item.id}
            className={`sidebar__item ${activeItem === item.id ? 'sidebar__item--active' : ''}`}
            onClick={() => setActiveItem(item.id)}
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar__bottom">
        <button className="sidebar__disconnect" onClick={onDisconnect}>
          <span className="sidebar__icon"></span>
          <span>Disconnect</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
