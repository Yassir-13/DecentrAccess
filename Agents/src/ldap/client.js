// Agents/src/ldap/client.js
import { Client } from 'ldapts'
import config from '../../config.js'

let client = null

async function getClient() {
  if (client) return client

  client = new Client({
    url:            config.ldap.url,
    connectTimeout: 10000
  })

  await client.bind(config.ldap.user, config.ldap.password)
  console.log('[LDAP] ✅ Connecté à', config.ldap.url)
  return client
}

async function disconnectLDAP() {
  if (client) {
    await client.unbind()
    client = null
    console.log('[LDAP] Déconnecté')
  }
}

// ═══ Users ═══

export async function createUser(payload) {
  const ldap = await getClient()
  const { username, firstName, lastName, department, password = 'Temp@123456' } = payload

  const dn = `CN=${firstName} ${lastName},OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`

  await ldap.add(dn, {
    objectClass:       ['top', 'person', 'organizationalPerson', 'user'],
    cn:                `${firstName} ${lastName}`,
    sAMAccountName:    username,
    givenName:         firstName,
    sn:                lastName,
    displayName:       `${firstName} ${lastName}`,
    department:        department || '',
    userPrincipalName: `${username}@${config.ldap.baseDN.replace(/DC=/g, '').replace(/,/g, '.')}`,
    userAccountControl: '514'  // Disabled — sera activé après set password
  })

  console.log(`[LDAP] ✅ Utilisateur créé : ${username}`)
  return { success: true, dn }
}

export async function deleteUser(payload) {
  const ldap = await getClient()
  const { username } = payload

  // Chercher le DN de l'utilisateur
  const { searchEntries } = await ldap.search(
    `OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`,
    {
      scope:  'sub',
      filter: `(sAMAccountName=${username})`,
      attributes: ['dn']
    }
  )

  if (searchEntries.length === 0) {
    throw new Error(`Utilisateur ${username} introuvable`)
  }

  await ldap.del(searchEntries[0].dn)
  console.log(`[LDAP] ✅ Utilisateur supprimé : ${username}`)
  return { success: true }
}

export async function modifyUser(payload) {
  const ldap = await getClient()
  const { username, firstName, lastName, department } = payload

  const { searchEntries } = await ldap.search(
    `OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`,
    {
      scope:  'sub',
      filter: `(sAMAccountName=${username})`,
      attributes: ['dn']
    }
  )

  if (searchEntries.length === 0) {
    throw new Error(`Utilisateur ${username} introuvable`)
  }

  const changes = []

  if (firstName && lastName) {
    changes.push({
      operation: 'replace',
      modification: { type: 'displayName', values: [`${firstName} ${lastName}`] }
    })
    changes.push({
      operation: 'replace',
      modification: { type: 'givenName', values: [firstName] }
    })
    changes.push({
      operation: 'replace',
      modification: { type: 'sn', values: [lastName] }
    })
  }

  if (department) {
    changes.push({
      operation: 'replace',
      modification: { type: 'department', values: [department] }
    })
  }

  if (changes.length > 0) {
    await ldap.modify(searchEntries[0].dn, changes)
  }

  console.log(`[LDAP] ✅ Utilisateur modifié : ${username}`)
  return { success: true }
}

export async function resetPassword(payload) {
  const ldap = await getClient()
  const { username, newPassword = 'Reset@123456' } = payload

  const { searchEntries } = await ldap.search(
    `OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`,
    {
      scope:  'sub',
      filter: `(sAMAccountName=${username})`,
      attributes: ['dn']
    }
  )

  if (searchEntries.length === 0) {
    throw new Error(`Utilisateur ${username} introuvable`)
  }

  // Encode le mot de passe en UTF-16LE pour AD
  const encodedPassword = Buffer.from(`"${newPassword}"`, 'utf16le')

  await ldap.modify(searchEntries[0].dn, [
    {
      operation: 'replace',
      modification: { type: 'unicodePwd', values: [encodedPassword] }
    }
  ])

  console.log(`[LDAP] ✅ Mot de passe réinitialisé : ${username}`)
  return { success: true }
}

// ═══ Groups ═══

export async function createGroup(payload) {
  const ldap = await getClient()
  const { groupName, description = '' } = payload

  const dn = `CN=${groupName},OU=Groups,OU=DecentrAccess,${config.ldap.baseDN}`

  await ldap.add(dn, {
    objectClass:    ['top', 'group'],
    cn:             groupName,
    sAMAccountName: groupName,
    description:    description,
    groupType:      '-2147483646'  // Global Security Group
  })

  console.log(`[LDAP] ✅ Groupe créé : ${groupName}`)
  return { success: true, dn }
}

export async function searchUsers(filter = '') {
  const ldap = await getClient()

  const { searchEntries } = await ldap.search(
    `OU=Users,OU=DecentrAccess,${config.ldap.baseDN}`,
    {
      scope:      'sub',
      filter:     filter || '(objectClass=user)',
      attributes: ['sAMAccountName', 'displayName', 'department', 'userAccountControl']
    }
  )

  return searchEntries.map(e => ({
    username:    e.sAMAccountName,
    displayName: e.displayName,
    department:  e.department,
    disabled:    (Number(e.userAccountControl) & 2) !== 0
  }))
}

export { getClient, disconnectLDAP }