/**
 * Weekly nudge scheduler (optional).
 *
 * If DAILY_NUDGE_HOUR (0–23, UTC) is set, once a week — on NUDGE_WEEKDAY
 * (0=Sun…6=Sat, default Monday) at that hour — we ping every active, onboarded
 * curator to start a round. Kept simple (no cron dep): we check every 5 minutes
 * and fire once on the target weekday. The "help settle the cut" ask only goes
 * out in the final week of the month; the rest of the month it's a light
 * general reminder. Disabled when DAILY_NUDGE_HOUR is unset.
 */
import type { Bot } from 'grammy'
import db from './db/index.js'
import { coverageGaps } from './ranking/strength.js'
import { ingestSources } from './ingest/ingest.js'
import { activeEdition, editionLabel, config } from './config.js'

let lastFiredDay = ''

/**
 * Background ingest loop. Re-fetches every source on an interval; because dedup
 * happens on write (content layer), this keeps the pool free of cross-post
 * duplicates as sources publish, and self-heals any that slipped in earlier.
 * Runs an initial pass ~1 min after boot, then every `ingestIntervalHours`.
 */
function startIngestSchedule(): void {
  const hours = config.ingestIntervalHours
  if (!hours || hours <= 0) {
    console.log('[ingest] periodic ingest disabled (INGEST_INTERVAL_HOURS=0)')
    return
  }
  console.log(`[ingest] periodic re-ingest every ${hours}h (dedup on write)`)
  const run = () =>
    ingestSources({ log: (l) => console.log('[ingest]', l) })
      .then((r) => console.log(`[ingest] done: +${r.ingested} new, ${r.deduped} deduped`))
      .catch((e) => console.error('[ingest] failed:', e))
  setTimeout(run, 60_000)
  setInterval(run, hours * 3600_000)
}

export function startScheduler(bot: Bot): void {
  // Background dedup/ingest runs regardless of the nudge setting.
  startIngestSchedule()

  const hour = process.env.DAILY_NUDGE_HOUR
  if (hour === undefined || hour === '') {
    console.log('[scheduler] DAILY_NUDGE_HOUR unset — weekly nudges disabled')
    return
  }
  const targetHour = Number(hour)
  const targetWeekday = Number(process.env.NUDGE_WEEKDAY ?? 1) // 0=Sun..6=Sat
  console.log(`[scheduler] weekly nudges on weekday ${targetWeekday} at ${targetHour}:00 UTC`)

  setInterval(
    async () => {
      const now = new Date()
      const day = now.toISOString().slice(0, 10)
      // Fires once: only on the target weekday + hour, guarded per calendar day.
      if (
        now.getUTCDay() !== targetWeekday ||
        now.getUTCHours() !== targetHour ||
        lastFiredDay === day
      )
        return
      lastFiredDay = day
      await sendWeeklyNudges(bot)
    },
    5 * 60 * 1000,
  )
}

/** True in the final 7 days of the current month (UTC) — when the cut is about
 *  to publish and settling it actually matters. */
function isFinalWeekOfMonth(d = new Date()): boolean {
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  return daysInMonth - d.getUTCDate() <= 7
}

/**
 * Craft the weekly nudge. For most of the month it's a light general reminder.
 * Only in the FINAL WEEK — when the cut is about to publish — do we send the
 * targeted "help us settle the cut" ask, saying exactly how much signal is still
 * missing. So the settle push lands once, at month end, not every week.
 */
function nudgeText(): string {
  const label = editionLabel(activeEdition())
  if (!isFinalWeekOfMonth()) {
    return (
      `🔭 Your weekly PL R&D Radar match-ups are ready. ` +
      `A quick /vote round shapes the ${label}.`
    )
  }
  try {
    const gap = coverageGaps(activeEdition())
    if (gap.needsVotes) {
      const bits: string[] = []
      if (!gap.cutResolved) bits.push(`the top-5 cut is still too close to call`)
      if (gap.underSampled > 0)
        bits.push(`${gap.underSampled} card${gap.underSampled === 1 ? '' : 's'} still need more eyes`)
      return (
        `⏳ Last week for the ${label}! It isn’t locked yet — ${bits.join(' and ')}. ` +
        `A quick /vote round now directly decides what ships.`
      )
    }
    return `✅ Last week for the ${label} — it’s looking solid. Want to stress-test it? Tap /vote.`
  } catch {
    return `⏳ Last week for the ${label}! Tap /vote to help settle what ships.`
  }
}

async function sendWeeklyNudges(bot: Bot): Promise<void> {
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
