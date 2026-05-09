// Agents/src/ldap/client.js
import { Client, Change, Attribute } from 'ldapts'
import config from '../../config.js'

let client = null

async function getClient() {
  if (client) return client

  const c = new Client({
    url:            config.ldap.url,  // ldaps://192.168.19.133:636
    connectTimeout: 10_000,
    tlsOptions:     { rejectUnauthorized: false }
  })

  try {
    await c.bind(config.ldap.user, config.ldap.password)
    client = c
    console.log(`[LDAP] ✅ Connecté avec LDAPS`)
  } catch (err) {
    // Bind échoué → on ne garde pas le client cassé
    try { await c.unbind() } catch (_) {}
    client = null
    throw err
  }

  return client
}

/**
 * Wrapper sécurisé pour exécuter une opération LDAP.
 * Si l'opération échoue à cause d'une connexion cassée, on reset le client
 * et on retente une seule fois.
 */
async function withLdap(fn) {
  try {
    const ldap = await getClient()
    return await fn(ldap)
  } catch (err) {
    // Si la connexion est cassée, on reset et on retente
    const isConnectionError =
      err.message?.includes('ECONNRESET') ||
      err.message?.includes('ECONNREFUSED') ||
      err.message?.includes('EPIPE') ||
      err.message?.includes('socket hang up') ||
      err.message?.includes('connection closed') ||
      err.code === 'ERR_SOCKET_CONNECTION_TIMEOUT'

    if (isConnectionError) {
      console.warn(`[LDAP] ⚠️ Connexion cassée — reconnexion...`)
      try { if (client) await client.unbind() } catch (_) {}
      client = null
      const ldap = await getClient()
      return await fn(ldap)
    }
    throw err
  }
}

async function disconnectLDAP() {
  if (client) {
    try { await client.unbind() } catch (_) {}
    client = null
    console.log('[LDAP] Déconnecté')
  }
}

async function findUserDN(ldapClient, username) {
  const { searchEntries } = await ldapClient.search(
    `OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`,
    { scope: 'sub', filter: `(sAMAccountName=${username})`, attributes: ['dn', 'userAccountControl', 'givenName', 'sn'] }
  )
  if (searchEntries.length === 0) throw new Error(`Utilisateur ${username} introuvable`)
  return searchEntries[0]
}

async function findGroupDN(ldapClient, groupName) {
  const { searchEntries } = await ldapClient.search(
    `OU=Groups,OU=DecentrAccess,${config.ldap.baseDN}`,
    { scope: 'sub', filter: `(sAMAccountName=${groupName})`, attributes: ['dn'] }
  )
  if (searchEntries.length === 0) throw new Error(`Groupe ${groupName} introuvable`)
  return searchEntries[0].dn
}

// ═══ Helper pour créer un Change compatible ldapts v8 ═══
function makeChange(operation, type, values) {
  return new Change({
    operation,
    modification: new Attribute({ type, values })
  })
}

// ═══════════════════════════════════════════════════════════
// Actions LDAP
// ═══════════════════════════════════════════════════════════

export async function createUser(payload) {
  return withLdap(async (ldap) => {
    const { username, firstName, lastName, department } = payload
    const dn = `CN=${firstName} ${lastName},OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`
    await ldap.add(dn, {
      objectClass:        ['top', 'person', 'organizationalPerson', 'user'],
      cn:                 `${firstName} ${lastName}`,
      sAMAccountName:     username,
      givenName:          firstName,
      sn:                 lastName,
      displayName:        `${firstName} ${lastName}`,
      department:         department || '',
      userPrincipalName:  `${username}@${config.ldap.baseDN.replace(/DC=/g, '').replace(/,/g, '.')}`,
      userAccountControl: '514'  // Créé désactivé
    })
    console.log(`[LDAP] ✅ Utilisateur créé (désactivé) : ${username}`)
    return { success: true, dn, status: 'disabled' }
  })
}

export async function activateUser(payload) {
  return withLdap(async (ldap) => {
    const { username, password = 'Temp@123456!' } = payload
    const entry = await findUserDN(ldap, username)

    // 1. Définir un mot de passe (LDAPS natif — port 636)
    const encodedPassword = Buffer.from(`"${password}"`, 'utf16le')
    await ldap.modify(entry.dn, [
      makeChange('replace', 'unicodePwd', [encodedPassword])
    ])
    console.log(`[LDAP] Mot de passe défini pour ${username}`)

    // 2. Activer le compte (APRÈS le mot de passe — ordre obligatoire AD)
    await ldap.modify(entry.dn, [
      makeChange('replace', 'userAccountControl', ['512'])
    ])

    console.log(`[LDAP] ✅ Utilisateur activé : ${username}`)
    return { success: true, status: 'enabled' }
  })
}

export async function disableUser(payload) {
  return withLdap(async (ldap) => {
    const entry = await findUserDN(ldap, payload.username)
    await ldap.modify(entry.dn, [makeChange('replace', 'userAccountControl', ['514'])])
    console.log(`[LDAP] ✅ Utilisateur désactivé : ${payload.username}`)
    return { success: true, status: 'disabled' }
  })
}

export async function enableUser(payload) {
  return activateUser(payload)
}

export async function deleteUser(payload) {
  return withLdap(async (ldap) => {
    const entry = await findUserDN(ldap, payload.username)
    await ldap.del(entry.dn)
    console.log(`[LDAP] ✅ Utilisateur supprimé : ${payload.username}`)
    return { success: true }
  })
}

export async function modifyUser(payload) {
  return withLdap(async (ldap) => {
    const { username, firstName, lastName, department } = payload
    const entry = await findUserDN(ldap, username)
    const changes = []

    if (firstName) changes.push(makeChange('replace', 'givenName', [firstName]))
    if (lastName)  changes.push(makeChange('replace', 'sn', [lastName]))
    if (firstName || lastName) {
      // Reconstruire le displayName à partir des données fournies ou existantes
      const dn = firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName
          ? `${firstName} ${entry.sn || ''}`
          : `${entry.givenName || ''} ${lastName}`
      changes.push(makeChange('replace', 'displayName', [dn.trim()]))
    }
    if (department) changes.push(makeChange('replace', 'department', [department]))

    if (changes.length > 0) await ldap.modify(entry.dn, changes)
    console.log(`[LDAP] ✅ Utilisateur modifié : ${username}`)
    return { success: true }
  })
}

export async function resetPassword(payload) {
  return withLdap(async (ldap) => {
    // LDAPS natif (port 636) — unicodePwd fonctionne directement
    const { username, newPassword = 'Reset@123456' } = payload
    const entry = await findUserDN(ldap, username)
    const encodedPassword = Buffer.from(`"${newPassword}"`, 'utf16le')
    await ldap.modify(entry.dn, [makeChange('replace', 'unicodePwd', [encodedPassword])])
    console.log(`[LDAP] ✅ Mot de passe réinitialisé : ${username}`)
    return { success: true }
  })
}

export async function searchUsers(filter = '') {
  return withLdap(async (ldap) => {
    const { searchEntries } = await ldap.search(
      `OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`,
      { scope: 'sub', filter: filter || '(objectClass=user)', attributes: ['sAMAccountName', 'displayName', 'department', 'userAccountControl', 'mail', 'givenName', 'sn'] }
    )
    return searchEntries.map(e => ({
      username:    e.sAMAccountName,
      displayName: e.displayName || '',
      department:  e.department  || '',
      email:       e.mail        || '',
      disabled:    (Number(e.userAccountControl) & 2) !== 0,
      status:      (Number(e.userAccountControl) & 2) !== 0 ? 'disabled' : 'enabled'
    }))
  })
}

export async function createGroup(payload) {
  return withLdap(async (ldap) => {
    const { groupName, description = '' } = payload
    const dn = `CN=${groupName},OU=Groups,OU=DecentrAccess,${config.ldap.baseDN}`
    await ldap.add(dn, {
      objectClass:    ['top', 'group'],
      cn:             groupName,
      sAMAccountName: groupName,
      description,
      groupType:      '-2147483646'  // Global Security group
    })
    console.log(`[LDAP] ✅ Groupe créé : ${groupName}`)
    return { success: true, dn }
  })
}

export async function addMemberToGroup(payload) {
  return withLdap(async (ldap) => {
    const groupDN = await findGroupDN(ldap, payload.groupName)
    const entry   = await findUserDN(ldap, payload.username)
    await ldap.modify(groupDN, [makeChange('add', 'member', [entry.dn])])
    console.log(`[LDAP] ✅ ${payload.username} ajouté au groupe ${payload.groupName}`)
    return { success: true }
  })
}

export async function removeMemberFromGroup(payload) {
  return withLdap(async (ldap) => {
    const groupDN = await findGroupDN(ldap, payload.groupName)
    const entry   = await findUserDN(ldap, payload.username)
    await ldap.modify(groupDN, [makeChange('delete', 'member', [entry.dn])])
    console.log(`[LDAP] ✅ ${payload.username} retiré du groupe ${payload.groupName}`)
    return { success: true }
  })
}

export async function searchGroups() {
  return withLdap(async (ldap) => {
    const { searchEntries } = await ldap.search(
      `OU=Groups,OU=DecentrAccess,${config.ldap.baseDN}`,
      { scope: 'sub', filter: '(objectClass=group)', attributes: ['sAMAccountName', 'description', 'member', 'cn'] }
    )
    return searchEntries.map(e => ({
      groupName:   e.sAMAccountName || e.cn,
      description: e.description || '',
      memberCount: Array.isArray(e.member) ? e.member.length : e.member ? 1 : 0,
      members:     Array.isArray(e.member) ? e.member : e.member ? [e.member] : []
    }))
  })
}

export { getClient, disconnectLDAP }