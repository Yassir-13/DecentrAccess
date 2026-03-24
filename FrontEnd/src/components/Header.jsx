function Header({ adminName }) {
  const now = new Date()
  const hour = now.getHours()
  let greeting = 'Bonsoir'
  if (hour < 12) greeting = 'Bonjour'
  else if (hour < 18) greeting = 'Bon après-midi'

  return (
    <div className="header">
      <div className="header__greeting">
        <h1>{greeting}, {adminName} 👋</h1>
        <p>Voici l'état de votre infrastructure DecentrAccess</p>
      </div>

      <div className="header__search">
        <span className="header__search-icon">🔍</span>
        <input
          type="text"
          className="header__search-input"
          placeholder="Rechercher..."
        />
      </div>
    </div>
  )
}

export default Header
