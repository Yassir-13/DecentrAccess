function DashboardHome({ stats, recentActivities, StatCard, RecentActivity }) {
  return (
    <>
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      <RecentActivity activities={recentActivities} />
    </>
  )
}

export default DashboardHome
