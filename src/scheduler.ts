/**
 * Daily nudge scheduler (optional).
 *
 * If DAILY_NUDGE_HOUR (0–23, server time) is set, once a day at that hour we
 * ping every active, onboarded curator with a one-tap button to start their
 * round. Kept intentionally simple (no cron dep): we check every 5 minutes and
 * fire once per calendar day. Disabled entirely when the env var is unset, so
 * local development never spams anyone.
 */
import type { Bot } from 'grammy'
import db from './db/index.js'
import { coverageGaps } from './ranking/strength.js'
import { currentEdition, editionLabel } from './config.js'

let lastFiredDay = ''

export function startScheduler(bot: Bot): void {
  const hour = process.env.DAILY_NUDGE_HOUR
  if (hour === undefined || hour === '') {
    console.log('[scheduler] DAILY_NUDGE_HOUR unset — daily nudges disabled')
    return
  }
  const targetHour = Number(hour)
  console.log(`[scheduler] daily nudges at ${targetHour}:00 server time`)

  setInterval(
    async () => {
      const now = new Date()
      const day = now.toISOString().slice(0, 10)
      if (now.getHours() !== targetHour || lastFiredDay === day) return
      lastFiredDay = day
      await sendDailyNudges(bot)
    },
    5 * 60 * 1000,
  )
}

/**
 * Craft the nudge from the CURRENT state of the cut. If the top-5 boundary is
 * unresolved or cards are under-sampled, we say exactly how much signal is
 * still missing — turning the daily ping into a targeted "help us lock the
 * Radar" ask (the whole point of having curators on tap). If the cut is already
 * confident, we send a lighter touch.
 */
function nudgeText(): string {
  const label = editionLabel(currentEdition())
  try {
    const gap = coverageGaps()
    if (gap.needsVotes) {
      const bits: string[] = []
      if (!gap.cutResolved) bits.push(`the top-5 cut is still too close to call`)
      if (gap.underSampled > 0)
        bits.push(`${gap.underSampled} card${gap.underSampled === 1 ? '' : 's'} still need more eyes`)
      return (
        `🥊 The ${label} isn’t locked yet — ${bits.join(' and ')}. ` +
        `A quick /vote round now directly decides what ships.`
      )
    }
    return `✅ The ${label} is looking solid. Want to stress-test it? Tap /vote.`
  } catch {
    return '🥊 Your daily match-ups are ready! Tap /vote to shape today’s Radar.'
  }
}

async function sendDailyNudges(bot: Bot): Promise<void> {
  const curators = db
    .prepare(
      `SELECT id FROM curators
       WHERE status = 'active' AND onboarded_at IS NOT NULL`,
    )
    .all() as { id: number }[]
  const text = nudgeText()
  console.log(`[scheduler] nudging ${curators.length} curators: ${text}`)

  for (const c of curators) {
    try {
      await bot.api.sendMessage(c.id, text)
    } catch (err) {
      // Curator may have blocked the bot — ignore and continue.
      console.warn(`[scheduler] could not nudge ${c.id}:`, String(err))
    }
    // Gentle pacing to stay well within Telegram rate limits.
    await new Promise((r) => setTimeout(r, 100))
  }
}
