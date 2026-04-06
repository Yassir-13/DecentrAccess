// Agents/config.js
import 'dotenv/config'

export default {
  privateKey:  process.env.AGENT_PRIVATE_KEY,
  hostname:    process.env.AGENT_HOSTNAME,
  hasLDAP:     process.env.AGENT_HAS_LDAP === 'true',

  rpcUrl:  process.env.RPC_URL,
  chainId: parseInt(process.env.CHAIN_ID),

  contracts: {
    DIDRegistry:       process.env.DID_REGISTRY,
    AccessControl:     process.env.ACCESS_CONTROL,
    PolicyEngine:      process.env.POLICY_ENGINE,
    AuditLog:          process.env.AUDIT_LOG,
    AgentRegistry:     process.env.AGENT_REGISTRY,
    AlertManager:      process.env.ALERT_MANAGER,
    ADStateAnchor:     process.env.AD_STATE_ANCHOR,
    ReputationScore:   process.env.REPUTATION_SCORE,
    EmergencyRecovery: process.env.EMERGENCY_RECOVERY,
  },

  ldap: {
    url:      process.env.LDAP_URL,
    baseDN:   process.env.LDAP_BASE_DN,
    user:     process.env.LDAP_USER,
    password: process.env.LDAP_PASSWORD,
  }
}