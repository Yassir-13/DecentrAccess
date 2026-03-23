import { useState } from "react";
import { ethers } from "ethers";

function App() {
  const [account, setAccount] = useState("");

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not detected");
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    setAccount(accounts[0]);
  };

  return (
    <div style={{ padding: "40px" }}>
      <h1>DecentrAccess</h1>

      <button onClick={connectWallet}>
        Connect Wallet
      </button>

      {account && (
        <p>Connected account: {account}</p>
      )}
    </div>
  );
}

export default App;