export const usersData = [
  { id: 1, did: 'did:da:0x12..3ab', name: 'Ali Bensalem', role: 'SUPER_ADMIN', status: 'Actif', lastActive: 'Il y a 2 min' },
  { id: 2, did: 'did:da:0x44..9f3', name: 'Youssef Amrani', role: 'ADMIN', status: 'Actif', lastActive: 'Il y a 10 min' },
  { id: 3, did: 'did:da:0x88..1c2', name: 'Kenza Benali', role: 'OPERATOR', status: 'Actif', lastActive: 'Il y a 1 h' },
  { id: 4, did: 'did:da:0xaa..bb1', name: 'Marc Dupont', role: 'AUDITOR', status: 'Inactif', lastActive: 'Il y a 3 jours' }
]

export const groupsData = [
  { id: 1, name: 'IT-Admins', members: 4, policies: 2, status: 'Actif' },
  { id: 2, name: 'HR-Managers', members: 8, policies: 1, status: 'Actif' },
  { id: 3, name: 'DevOps', members: 12, policies: 4, status: 'Actif' }
]

export const computersData = [
  { id: 1, hostname: 'SRV-DC-01', ip: '192.168.1.10', os: 'Windows Server 2022', status: 'Online', agentVersion: 'v1.5.0' },
  { id: 2, hostname: 'PC-ADMIN-03', ip: '192.168.1.45', os: 'Windows 11', status: 'Online', agentVersion: 'v1.5.0' },
  { id: 3, hostname: 'PC-HR-12', ip: '192.168.1.102', os: 'Windows 10', status: 'Offline', agentVersion: 'v1.4.2' }
]

export const policiesData = [
  { id: 'POL-001', type: 'DELETE_USER', requiredSigs: 2, expiry: '6 heures', status: 'Active' },
  { id: 'POL-002', type: 'REVOKE_ADMIN', requiredSigs: 3, expiry: '48 heures', status: 'Active' },
  { id: 'POL-003', type: 'CREATE_USER', requiredSigs: 1, expiry: '1 heure', status: 'Inactive' }
]

export const alertsData = [
  { id: 'ALT-101', rule: 'BRUTE_FORCE', severity: 'CRITICAL', triggerer: 'Agent-SRV01', date: 'Il y a 1h', ack: false },
  { id: 'ALT-102', rule: 'UNAUTH_ACCESS', severity: 'HIGH', triggerer: 'Agent-PC03', date: 'Il y a 5h', ack: true },
  { id: 'ALT-103', rule: 'PRIVILEGE_DSC', severity: 'CRITICAL', triggerer: 'Agent-SRV02', date: 'Il y a 1j', ack: true }
]
