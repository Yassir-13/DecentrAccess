// FrontEnd/src/context/Web3Context.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { BrowserProvider, ethers } from 'ethers'
import { NETWORK } from '../config/network'
import { initP2P, publishAction, setAgentPeerId, onResult } from '../services/p2pService'

const Web3Context = createContext(null)

export function Web3Provider({ children }) {
  const [provider, setProvider]       = useState(null)
  const [signer, setSigner]           = useState(null)
  const [address, setAddress]         = useState(null)
  const [chainId, setChainId]         = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError]             = useState(null)
  const [p2pReady, setP2pReady]       = useState(false)

  const isCorrectNetwork = chainId === NETWORK.chainId

  const switchToGethNetwork = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK.chainIdHex }],
      })
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: NETWORK.chainIdHex,
            chainName: NETWORK.name,
            rpcUrls: [NETWORK.rpcUrl],
            nativeCurrency: {
              name: NETWORK.currencySymbol,
              symbol: NETWORK.currencySymbol,
              decimals: 18,
            },
          }],
        })
      } else {
        throw switchError
      }
    }
  }

  const connect = useCallback(async () => {
    setError(null)
    try {
      if (!window.ethereum) {
        setError('MetaMask non détecté. Installe MetaMask et réessaie.')
        return
      }

      await window.ethereum.request({ method: 'eth_requestAccounts' })

      const rawChainId = await window.ethereum.request({ method: 'eth_chainId' })
      const currentChainId = parseInt(rawChainId, 16)

      if (currentChainId !== NETWORK.chainId) {
        await switchToGethNetwork()
      }

      const web3Provider = new BrowserProvider(window.ethereum)
      const web3Signer   = await web3Provider.getSigner()
      const userAddress  = await web3Signer.getAddress()
      const network      = await web3Provider.getNetwork()

      setProvider(web3Provider)
      setSigner(web3Signer)
      setAddress(userAddress)
      setChainId(Number(network.chainId))
      setIsConnected(true)

    } catch (err) {
      console.error('Erreur connexion MetaMask :', err)
      setError(err.message || 'Connexion échouée')
    }
  }, [])

  const disconnect = useCallback(() => {
    setProvider(null)
    setSigner(null)
    setAddress(null)
    setChainId(null)
    setIsConnected(false)
    setP2pReady(false)
    setError(null)
  }, [])

  // ═══ Init P2P après connexion MetaMask ═══
  // agentPeerId est affiché dans la console de l'agent : [P2P] Nœud démarré — PeerID: 12D3...
  // Pour le test, on le passe en dur ici — sera dynamique plus tard
  const initializeP2P = useCallback(async (agentPeerId) => {
    try {
      setAgentPeerId(agentPeerId)
      await initP2P()
      setP2pReady(true)
      console.log('[Web3] ✅ P2P initialisé')
    } catch (err) {
      console.error('[Web3] Erreur init P2P :', err.message)
    }
  }, [])

  // ═══ sendAction — signe + broadcaste une action ═══
  const sendAction = useCallback(async (actionType, payload) => {
    if (!signer) throw new Error('Wallet non connecté')
    if (!p2pReady) throw new Error('P2P non initialisé — appeler initializeP2P() d\'abord')

    // 1. Construire le message à signer (identique à ce que l'agent vérifie)
    const message = JSON.stringify({ actionType, payload })

    // 2. Signer avec MetaMask → popup
    console.log('[sendAction] Signature MetaMask en cours...')
    const signature = await signer.signMessage(message)

    // 3. Construire l'actionHash (identifiant unique de cette action)
    const actionHash = ethers.keccak256(
      ethers.toUtf8Bytes(message + Date.now().toString())
    )

    // 4. Construire la payload complète
    const actionData = {
      actionHash,
      actionType,
      payload,
      signer:    address,
      signature,
      timestamp: Date.now()
    }

    // 5. Broadcaster sur le topic P2P
    await publishAction(actionData)
    console.log('[sendAction] ✅ Action broadcastée :', actionType)

    return actionData
  }, [signer, address, p2pReady])

  // Écoute les changements de compte et de réseau
  useEffect(() => {
    if (!window.ethereum) return

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) disconnect()
      else connect()
    }

    const handleChainChanged = () => window.location.reload()

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [connect, disconnect])

  return (
    <Web3Context.Provider value={{
      provider,
      signer,
      address,
      chainId,
      isConnected,
      isCorrectNetwork,
      p2pReady,
      error,
      connect,
      disconnect,
      initializeP2P,
      sendAction,
      onResult,
    }}>
      {children}
    </Web3Context.Provider>
  )
}

export function useWeb3() {
  const context = useContext(Web3Context)
  if (!context) throw new Error('useWeb3 doit être utilisé dans un Web3Provider')
  return context
}