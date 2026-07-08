/**
 * Central configuration, parsed once from the environment.
 *
 * All secrets come from environment variables (see `.env.example`). Nothing
 * sensitive is ever hard-coded or committed.
 */
import 'dotenv/config'

export const config = {
  /** Telegram bot token from @BotFather. Validated at bot start, not import,
   *  so tools like `npm run seed` run without needing a token. */
  botToken: process.env.BOT_TOKEN || '',

  /** Path to the SQLite database file. */
  databasePath: process.env.DATABASE_PATH || '.data/radar.sqlite',

  /** HTTP port for /health and the public results API. */
  port: Number(process.env.PORT || 3000),

  /** Telegram user IDs allowed to run admin commands. */
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),

  /** Number of pair comparisons in one daily round. */
  roundSize: Number(process.env.ROUND_SIZE || 3),
} as const

export function isAdmin(userId: number): boolean {
  return config.adminIds.includes(userId)
}

/** The current monthly edition, as YYYY-MM (news items "expire" monthly). */
export function currentEdition(): string {
  return new Date().toISOString().slice(0, 7)
}

/** Human label for an edition, e.g. "2026-07" -> "July Radar". */
export function editionLabel(edition: string): string {
  const [y, m] = edition.split('-').map(Number)
  const month = new Date(y!, (m ?? 1) - 1, 1).toLocaleString('en-US', {
    month: 'long',
  })
  const thisYear = new Date().getFullYear()
  return y === thisYear ? `${month} Radar` : `${month} ${y}`
}

/** Throw a friendly error if the bot token is missing (call before bot start). */
export function requireBotToken(): string {
  if (!config.botToken) {
    throw new Error(
      'Missing BOT_TOKEN. Copy .env.example to .env and paste your @BotFather token.',
    )
  }
  return config.botToken
}
