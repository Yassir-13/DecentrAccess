// Agents/src/blockchain/client.js
import { ethers } from 'ethers'
import config from '../../config.js'

const DID_REGISTRY_ABI = [
  "function isDIDActive(address _owner) view returns (bool)",
  "function resolveDID(address _owner) view returns (tuple(address owner, string did, uint8 entityType, bytes32 publicKeyHash, string metadata, uint256 createdAt, uint256 updatedAt, bool active))"
]

const ACCESS_CONTROL_ABI = [
  "function canPerform(address account, string memory action) view returns (bool)",
  "function hasRole(address account, bytes32 role) view returns (bool)",
  "function SUPER_ADMIN() view returns (bytes32)",
  "function ADMIN() view returns (bytes32)"
]

const AGENT_REGISTRY_ABI = [
  "function registerAgent(string memory hostname, bool canExecuteAD, string memory peerId) external",
  "function heartbeat() external",
  "function isAgentOnline(address agent) view returns (bool)",
  "function electExecutor(bytes32 actionId) view returns (address)"
]

const AUDIT_LOG_ABI = [
  "function logAction(bytes32 actionHash, string memory ipfsCID, bytes memory signature) external"
]

class BlockchainClient {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl)
    this.wallet   = new ethers.Wallet(config.privateKey, this.provider)

    this.didRegistry   = new ethers.Contract(config.contracts.DIDRegistry,   DID_REGISTRY_ABI,   this.wallet)
    this.accessControl = new ethers.Contract(config.contracts.AccessControl, ACCESS_CONTROL_ABI, this.wallet)
    this.agentRegistry = new ethers.Contract(config.contracts.AgentRegistry, AGENT_REGISTRY_ABI, this.wallet)
    this.auditLog      = new ethers.Contract(config.contracts.AuditLog,      AUDIT_LOG_ABI,      this.wallet)

    console.log(`[Blockchain] Wallet agent : ${this.wallet.address}`)
  }

  async isDIDActive(address) {
    return await this.didRegistry.isDIDActive(address)
  }

  async canPerform(address, action) {
    return await this.accessControl.canPerform(address, action)
  }

  async isValidSigner(address, action) {
    const hasDID = await this.isDIDActive(address)
    if (!hasDID) {
      console.warn(`[Blockchain] DID inactif pour ${address}`)
      return false
    }
    const canDo = await this.canPerform(address, action)
    if (!canDo) {
      console.warn(`[Blockchain] Permission refusée pour ${address} — action: ${action}`)
      return false
    }
    return true
  }

  async registerAgent(peerId = "") {
    try {
      const tx = await this.agentRegistry.registerAgent(
        config.hostname,
        config.hasLDAP,
        peerId
      )
      await tx.wait()
      console.log(`[Blockchain] Agent enregistré dans AgentRegistry ✅`)
    } catch (err) {
      console.log(`[Blockchain] Agent déjà enregistré — skip`)
    }
  }

  async sendHeartbeat() {
    try {
      const tx = await this.agentRegistry.heartbeat()
      await tx.wait()
      console.log(`[Blockchain] Heartbeat envoyé ✅`)
    } catch (err) {
      console.error(`[Blockchain] Erreur heartbeat :`, err.message)
    }
  }

  async logAction(actionHash, ipfsCID, signature) {
    try {
      const tx = await this.auditLog.logAction(actionHash, ipfsCID, signature)
      await tx.wait()
      console.log(`[Blockchain] Action ancrée — CID: ${ipfsCID} ✅`)
    } catch (err) {
      console.error(`[Blockchain] Erreur AuditLog :`, err.message)
    }
  }
}

export default new BlockchainClient()