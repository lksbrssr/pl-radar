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
import { startServer } from '../http/server.js'

async function main() {
  if (repo.getActiveCards().length === 0 && repo.countCurators() === 0) {
    console.log('[preview] empty DB — seeding demo data…')
    // simulate.ts seeds cards + curators + votes as import side effects.
    await import('./simulate.js')
  }
  startServer()
  console.log('[preview] HTTP-only preview is up')
}

main().catch((err) => {
  console.error('preview fatal:', err)
  process.exit(1)
})
