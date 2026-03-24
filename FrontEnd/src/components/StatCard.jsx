function StatCard({ icon, label, value, trend, trendDirection, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card__header">
        <div className={`stat-card__icon stat-card__icon--${color}`}>
          {icon}
        </div>
        {trend && (
          <span className={`stat-card__trend stat-card__trend--${trendDirection}`}>
            {trendDirection === 'up' ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}

export default StatCard
