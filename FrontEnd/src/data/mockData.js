// Données mockées pour le prototype DecentrAccess

export const stats = [
  {
    icon: '🟢',
    label: 'Agents Online',
    value: '12',
    trend: '+2',
    trendDirection: 'up',
    color: 'green'
  },
  {
    icon: '🔶',
    label: 'Active Alerts',
    value: '3',
    trend: '-1',
    trendDirection: 'down',
    color: 'orange'
  },
  {
    icon: '🔮',
    label: 'Pending Actions',
    value: '5',
    trend: '+3',
    trendDirection: 'up',
    color: 'purple'
  },
  {
    icon: '🔵',
    label: 'AD Drift Status',
    value: '✅ OK',
    trend: null,
    trendDirection: null,
    color: 'blue'
  }
]

export const recentActivities = [
  {
    action: 'Création utilisateur j.dupont',
    user: 'Ali Bensalem',
    type: 'CREATE_USER',
    typeBadge: 'info',
    status: 'Exécuté',
    statusBadge: 'success',
    date: 'Il y a 5 min'
  },
  {
    action: 'Suppression utilisateur m.martin',
    user: 'Ali Bensalem',
    type: 'DELETE_USER',
    typeBadge: 'danger',
    status: 'En attente (1/2 sig)',
    statusBadge: 'warning',
    date: 'Il y a 12 min'
  },
  {
    action: 'Modification groupe IT-Support',
    user: 'Youssef Amrani',
    type: 'MODIFY_GROUP',
    typeBadge: 'purple',
    status: 'Exécuté',
    statusBadge: 'success',
    date: 'Il y a 30 min'
  },
  {
    action: 'Alerte BRUTE_FORCE détectée',
    user: 'Agent-SRV01',
    type: 'ALERT',
    typeBadge: 'danger',
    status: 'Non acquitté',
    statusBadge: 'danger',
    date: 'Il y a 1h'
  },
  {
    action: 'Snapshot AD ancré (#47)',
    user: 'Agent-PC03',
    type: 'AD_ANCHOR',
    typeBadge: 'info',
    status: 'Exécuté',
    statusBadge: 'success',
    date: 'Il y a 2h'
  },
  {
    action: 'Rotation clé admin K.Benali',
    user: 'Guardian-01',
    type: 'RECOVERY',
    typeBadge: 'purple',
    status: 'En attente (2/3 sig)',
    statusBadge: 'warning',
    date: 'Il y a 3h'
  }
]
