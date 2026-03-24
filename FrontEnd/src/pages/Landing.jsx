function Landing({ onConnect }) {
  return (
    <div className="landing">
      <h1 className="landing__title">DecentrAccess</h1>
      <p className="landing__tagline">Decentralized Identity & Access Management</p>
      <button className="landing__connect-btn" onClick={onConnect}>
        🦊 Connect with MetaMask
      </button>
    </div>
  )
}

export default Landing
