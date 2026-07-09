/**
 * Capability-guard + admin sign-in tests. Run with `npm test` (uses a temp DB
 * via DATABASE_PATH so it never touches real data). See docs/admin-panel.md.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { hasRight, RIGHTS, type AdminContext } from './auth.js'
import {
  createAdminLoginToken,
  consumeAdminLoginToken,
  createAdminSession,
  getAdminSessionCurator,
  deleteAdminSession,
} from '../db/repo.js'

const root: AdminContext = { curatorId: 1, name: 'Root', root: true, rights: new Set() }
const granted: AdminContext = {
  curatorId: 2,
  name: 'Granted',
  root: false,
  rights: new Set(['manage_cards']),
}

test('hasRight: root holds every capability', () => {
  for (const r of RIGHTS) assert.equal(hasRight(root, r), true)
})

test('hasRight: granted admin holds only its listed rights', () => {
  assert.equal(hasRight(granted, 'manage_cards'), true)
  assert.equal(hasRight(granted, 'manage_sources'), false)
  assert.equal(hasRight(granted, 'manage_admins'), false)
  assert.equal(hasRight(granted, 'trigger_rounds'), false)
})

test('hasRight: a null (non-admin) context holds nothing', () => {
  for (const r of RIGHTS) assert.equal(hasRight(null, r), false)
})

test('admin login token is single-use', () => {
  const t = createAdminLoginToken(90001)
  assert.equal(consumeAdminLoginToken(t), 90001)
  // A replay must fail (token marked used).
  assert.equal(consumeAdminLoginToken(t), null)
})

test('unknown login token / session id resolve to null', () => {
  assert.equal(consumeAdminLoginToken('al_does_not_exist'), null)
  assert.equal(getAdminSessionCurator('as_does_not_exist'), null)
})

test('admin session: create → resolve → delete', () => {
  const sid = createAdminSession(90002)
  assert.equal(getAdminSessionCurator(sid), 90002)
  deleteAdminSession(sid)
  assert.equal(getAdminSessionCurator(sid), null)
})
