// FrontEnd/src/context/Web3Context.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { BrowserProvider } from 'ethers'
import { NETWORK } from '../config/network'

const Web3Context = createContext(null)

export function Web3Provider({ children }) {
  const [provider, setProvider]   = useState(null)
  const [signer, setSigner]       = useState(null)
  const [address, setAddress]     = useState(null)
  const [chainId, setChainId]     = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError]         = useState(null)

  // Vérifie si on est sur le bon réseau
  const isCorrectNetwork = chainId === NETWORK.chainId

  // Demande à MetaMask d'ajouter/switcher vers le réseau Geth PoA
  const switchToGethNetwork = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK.chainIdHex }],
      })
    } catch (switchError) {
      // Code 4902 = le réseau n'existe pas encore dans MetaMask → on l'ajoute
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
      // 1. MetaMask présent ?
      if (!window.ethereum) {
        setError('MetaMask non détecté. Installe MetaMask et réessaie.')
        return
      }

      // 2. Demande accès au wallet
      await window.ethereum.request({ method: 'eth_requestAccounts' })

      // 3. Vérifie le réseau — switch si nécessaire
      const rawChainId = await window.ethereum.request({ method: 'eth_chainId' })
      const currentChainId = parseInt(rawChainId, 16)

      if (currentChainId !== NETWORK.chainId) {
        await switchToGethNetwork()
      }

      // 4. Crée le provider et signer ethers.js
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
    setError(null)
  }, [])

  // Écoute les changements de compte et de réseau
  useEffect(() => {
    if (!window.ethereum) return

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnect()
      } else {
        // L'utilisateur a changé de compte → reconnexion propre
        connect()
      }
    }

    const handleChainChanged = () => {
      // MetaMask recommande un reload sur chainChanged
      window.location.reload()
    }

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
      error,
      connect,
      disconnect,
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