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

  /** How often (hours) the background job re-ingests every source. Re-ingesting
   *  is what keeps the pool deduped as sources publish (dedup happens on write),
   *  and it self-heals cross-posts that entered before their identity was known.
   *  Set INGEST_INTERVAL_HOURS=0 to disable. Only runs in the full (bot) process. */
  ingestIntervalHours: Number(process.env.INGEST_INTERVAL_HOURS ?? 3),

  /** Shared passphrase that gates the AI-powered submission endpoints (paste a
   *  URL → an LLM turns it into a card; add a recurring source). Empty = the
   *  whole submission surface is DISABLED, so the site never burns AI tokens.
   *  Set it so only people you trust can trigger the model. The browser sends
   *  it as the `x-submit-key` header after the user unlocks the submit panel. */
  submitKey: process.env.SUBMIT_KEY || '',

  /** LLM used to parse a pasted URL into a card/source draft. Auto-detects the
   *  provider: Anthropic if ANTHROPIC_API_KEY is set, else an OpenAI-compatible
   *  endpoint if OPENAI_API_KEY is set. With no key the AI parse is unavailable
   *  and the UI falls back to the manual / bring-your-own-agent path. */
  llm: {
    provider: (process.env.LLM_PROVIDER || '').toLowerCase(), // 'anthropic' | 'openai' | ''
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
    openaiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },
} as const

/** True when the submission surface is turned on (a SUBMIT_KEY is configured). */
export function submitEnabled(): boolean {
  return !!config.submitKey
}

/** Which LLM provider is usable right now (based on which key is present), or
 *  null when none is configured. Provider preference: explicit LLM_PROVIDER,
 *  else Anthropic, else OpenAI. */
export function llmProvider(): 'anthropic' | 'openai' | null {
  const p = config.llm.provider
  if (p === 'anthropic') return config.llm.anthropicKey ? 'anthropic' : null
  if (p === 'openai') return config.llm.openaiKey ? 'openai' : null
  if (config.llm.anthropicKey) return 'anthropic'
  if (config.llm.openaiKey) return 'openai'
  return null
}

/** True when an LLM is configured and the site can parse a URL into a draft. */
export function aiAvailable(): boolean {
  return llmProvider() !== null
}

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
