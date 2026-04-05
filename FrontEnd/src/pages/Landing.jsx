// FrontEnd/src/pages/Landing.jsx
function Landing({ onConnect, error }) {
  return (
    <div className="landing">
      <h1 className="landing__title">DecentrAccess</h1>
      <p className="landing__tagline">Decentralized Identity & Access Management</p>
      <button className="landing__connect-btn" onClick={onConnect}>
        🦊 Connect with MetaMask
      </button>
      {error && (
        <p style={{ color: '#ff4d4d', marginTop: '1rem', fontSize: '0.9rem' }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  )
}

export default Landing