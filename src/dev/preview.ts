/**
 * Preview entrypoint (Fly preview app / any PR preview).
 *
 * Runs ONLY the read-only HTTP app — no Telegram bot — so it can run alongside
 * production without fighting over long-polling, and needs no BOT_TOKEN. On a
 * cold start with an empty database it self-seeds a realistic demo (25-card
 * current edition + a past published edition + ~40 curators) so the preview URL
 * always shows a populated, clickable app.
 */
import * as repo from '../db/repo.js'
import db from '../db/index.js'
import { config } from '../config.js'
import { startServer } from '../http/server.js'

/**
 * Preview-only: seed a demo ROOT admin curator so the admin surface is testable
 * without a Telegram bot (the preview has none). The `/api/admin/session`
 * endpoint accepts PREVIEW_ADMIN_TOKEN as a valid one-time token in this mode.
 * Runs ONLY when PREVIEW_ADMIN_TOKEN is set — production uses dist/index.js and
 * never sets it, so there is no backdoor. Reviewer opens `/#admin?t=<token>`.
 */
function seedPreviewAdmin() {
  const token = process.env.PREVIEW_ADMIN_TOKEN
  const rootId = config.adminIds[0]
  if (!token || !rootId) return
  db.prepare(
    `INSERT INTO curators (id, first_name, status, onboarded_at)
     VALUES (?, 'Preview Admin', 'active', datetime('now'))
     ON CONFLICT(id) DO UPDATE SET onboarded_at = COALESCE(curators.onboarded_at, datetime('now'))`,
  ).run(rootId)
  console.log(`[preview] demo root admin ready — open /#admin?t=${token}`)
}

async function main() {
  if (repo.getActiveCards().length === 0 && repo.countCurators() === 0) {
    console.log('[preview] empty DB — seeding demo data…')
    // simulate.ts seeds cards + curators + votes as import side effects.
    await import('./simulate.js')
  }
  seedPreviewAdmin()
  startServer()
  console.log('[preview] HTTP-only preview is up')
}

main().catch((err) => {
  console.error('preview fatal:', err)
  process.exit(1)
})
