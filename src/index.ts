/**
 * Entry point. Boots the read-only HTTP API and the Telegram bot together in a
 * single process, and (optionally) the daily nudge scheduler.
 *
 * The bot uses long polling, so no public webhook URL is required — it works
 * anywhere with outbound internet (local machine, Fly.io, etc.).
 */
import { bot, registerCommands } from './bot/index.js'
import { startServer } from './http/server.js'
import { startScheduler } from './scheduler.js'
import { requireBotToken } from './config.js'

async function main() {
  requireBotToken()
  startServer()

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
