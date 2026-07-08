/**
 * Entry point. Boots the read-only HTTP API and (when a bot token is present)
 * the Telegram bot in a single process, plus the daily nudge scheduler.
 *
 * The bot uses long polling, so no public webhook URL is required — it works
 * anywhere with outbound internet (local machine, Fly.io, etc.).
 *
 * Two run modes, chosen automatically by whether BOT_TOKEN is set:
 *   • Full mode (BOT_TOKEN present, e.g. production on Fly): HTTP API + bot +
 *     scheduler. Real curators vote in Telegram.
 *   • Web-only mode (no BOT_TOKEN, e.g. a secrets-free sandbox like PLN LabOS):
 *     HTTP API only — the web dashboard, read-only JSON, and in-browser voting,
 *     none of which need Telegram. On an empty DB we seed demo data so the
 *     embedded dashboard shows a live Radar instead of a blank shell.
 */
import { startServer } from './http/server.js'
import { startScheduler } from './scheduler.js'
import { config } from './config.js'
import { totalVotes } from './db/repo.js'
import { seedDemoData } from './dev/demoData.js'

async function main() {
  // The HTTP surface (health, dashboard, API, in-browser voting) has no
  // Telegram dependency, so it always starts — even without a bot token.
  startServer()

  if (!config.botToken) {
    // Web-only mode. Seed a demo dataset if the DB is empty so a fresh sandbox
    // deploy renders a populated dashboard rather than an empty one.
    console.log('[bot] no BOT_TOKEN set — running web-only (dashboard + API + in-browser voting)')
    if (totalVotes() === 0) {
      console.log('[demo] empty DB — seeding demo data for the web dashboard…')
      seedDemoData()
    }
    return
  }

  // Import the bot lazily: `bot/index.ts` constructs `new Bot(token)` at import
  // time, which throws on an empty token. In web-only mode we never get here, so
  // the bot module (and grammY) is only loaded when a real token is present.
  const { bot, registerCommands } = await import('./bot/index.js')
  await registerCommands()
  startScheduler(bot)

  // Graceful shutdown so long polling stops cleanly.
  process.once('SIGINT', () => bot.stop())
  process.once('SIGTERM', () => bot.stop())

  console.log('[bot] starting long-polling…')
  await bot.start({
    onStart: (me) => console.log(`[bot] online as @${me.username}`),
  })
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
