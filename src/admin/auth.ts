/**
 * Admin authentication + capability resolution for the admin panel.
 *
 * Auth is the same "magic link" the bot already hands out for web voting: the
 * browser sends the curator's stable `web_token` as the `x-admin-token` header,
 * we resolve it to a curator, and check admin status. No new secret, no
 * password. See docs/admin-panel.md (and the TODO there about moving to
 * short-TTL, single-use tokens).
 *
 * Two admin tiers:
 *   • ROOT  — a Telegram id in ADMIN_IDS. Always admin, holds every right,
 *             cannot be demoted from the panel (break-glass).
 *   • GRANT — a curator whose `is_admin` flag is set, holding exactly the
 *             rights listed in `curator_admin_rights`.
 */
import type express from 'express'
import { isAdmin as isRootAdmin } from '../config.js'
import * as repo from '../db/repo.js'

/** All admin capabilities. Root admins implicitly hold all of these. */
export const RIGHTS = ['manage_sources', 'manage_cards', 'manage_admins', 'trigger_rounds'] as const
export type Right = (typeof RIGHTS)[number]

export type AdminContext = {
  curatorId: number
  name: string
  /** Root admin (ADMIN_IDS) — implicitly holds every right, undemotable. */
  root: boolean
  rights: Set<Right>
}

/** Parse a named cookie out of the raw Cookie header (no cookie-parser dep). */
export function readCookie(req: express.Request, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw) return null
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

/** Name of the httpOnly admin session cookie. */
export const ADMIN_COOKIE = 'pla_sid'

/** Resolve the admin context from the session cookie, or null. */
export function adminFromRequest(req: express.Request): AdminContext | null {
  const sid = readCookie(req, ADMIN_COOKIE)
  if (!sid) return null
  const curatorId = repo.getAdminSessionCurator(sid)
  if (curatorId == null) return null
  return adminForCurator(curatorId)
}

/** Resolve the admin context for a curator id, or null if not an admin. */
export function adminForCurator(curatorId: number): AdminContext | null {
  const root = isRootAdmin(curatorId)
  const cur = repo.getCurator(curatorId)
  const name = cur?.first_name || cur?.username || `#${curatorId}`
  if (root) {
    return { curatorId, name, root: true, rights: new Set(RIGHTS) }
  }
  if (cur?.is_admin) {
    const granted = repo.listCuratorRights(curatorId).filter((r): r is Right =>
      (RIGHTS as readonly string[]).includes(r),
    )
    return { curatorId, name, root: false, rights: new Set(granted) }
  }
  return null
}

export function hasRight(ctx: AdminContext | null, right: Right): boolean {
  return !!ctx && (ctx.root || ctx.rights.has(right))
}

/**
 * Express guard factory. Returns a middleware-style check: reads the
 * `x-admin-token` header, resolves the admin context, and (optionally) enforces
 * a required capability. On success it stashes the context on `res.locals.admin`
 * and returns it; on failure it writes the 401/403 and returns null.
 */
export function requireAdmin(
  req: express.Request,
  res: express.Response,
  right?: Right,
): AdminContext | null {
  const ctx = adminFromRequest(req)
  if (!ctx) {
    res.status(401).json({ ok: false, error: 'not-admin' })
    return null
  }
  if (right && !hasRight(ctx, right)) {
    res.status(403).json({ ok: false, error: 'forbidden', need: right })
    return null
  }
  res.locals.admin = ctx
  return ctx
}
