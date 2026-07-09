/**
 * On-demand round broadcast — the "trigger a toss-up run" admin action.
 *
 * Reuses the same channel as the weekly nudge (see scheduler.ts): it pings every
 * active, onboarded Telegram curator with a fresh match-up invite + their
 * personal web link, independent of the weekly cadence. Kept in its own module
 * so the HTTP layer can call it without importing the bot at module load (the
 * bot constructs `new Bot(token)` on import, which throws in web-only mode) —
 * the bot is imported lazily, only when a token is actually configured.
 */
import db from '../db/index.js'
import { kb } from './keyboards.js'
import { webVoteUrl } from './links.js'
import { config, editionLabel, activeEdition } from '../config.js'

export type BroadcastResult = { sent: number; failed: number; total: number }

export async function broadcastRound(): Promise<BroadcastResult> {
  if (!config.botToken) throw new Error('No Telegram bot configured (BOT_TOKEN unset).')
  const { bot } = await import('./index.js')
  const curators = db
    .prepare(
      `SELECT id FROM curators
       WHERE status = 'active' AND onboarded_at IS NOT NULL AND id > 0`,
    )
    .all() as { id: number }[]
  const text =
    `Your PL R&D Radar match-ups are ready. ` +
    `A quick round shapes the ${editionLabel(activeEdition())}.`
  let sent = 0
  let failed = 0
  for (const c of curators) {
    try {
      await bot.api.sendMessage(c.id, text, {
        parse_mode: 'HTML',
        reply_markup: kb.nudge(webVoteUrl(c.id)),
      })
      sent++
    } catch {
      failed++
    }
    await new Promise((r) => setTimeout(r, 100)) // gentle pacing for rate limits
  }
  return { sent, failed, total: curators.length }
}
