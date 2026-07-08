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

  /** Max consecutive defenses before the reigning champion is forced to rotate
   *  out (king-of-the-hill exposure cap). Stops one hot card from hogging the
   *  comparison budget so late-added and mid-pack cards still get sampled. */
  reignCap: Number(process.env.REIGN_CAP || 4),

  /** Show the diversity-balanced cut (vs. pure score order) on the public Radar.
   *  Set RADAR_COMPOSE=0 to display the raw top-N by score instead. */
  radarCompose: (process.env.RADAR_COMPOSE ?? '1') !== '0',
  /** Diversity penalties (Elo points) for the balanced cut: how much a repeated
   *  focus area / angle is discounted when composing the digest. */
  composeLambdaArea: Number(process.env.COMPOSE_LAMBDA_AREA || 60),
  composeLambdaAngle: Number(process.env.COMPOSE_LAMBDA_ANGLE || 30),
} as const

export function isAdmin(userId: number): boolean {
  return config.adminIds.includes(userId)
}

/** The current monthly edition, as YYYY-MM (news items "expire" monthly). */
export function currentEdition(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * The edition that is currently OPEN FOR VOTING. Defaults to the calendar month
 * (`currentEdition()`), but can be pinned via the `ACTIVE_EDITION` env var
 * (YYYY-MM) — e.g. keep the crowd voting on June while July's pool is still
 * filling up. Everything vote-related keys off this: the votable pool, challenger
 * selection, and vote validation.
 */
export function activeEdition(): string {
  const pinned = (process.env.ACTIVE_EDITION || '').trim()
  return /^\d{4}-\d{2}$/.test(pinned) ? pinned : currentEdition()
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
