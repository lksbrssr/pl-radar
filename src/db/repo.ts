/**
 * Data-access layer. All SQL lives here so the bot/HTTP code reads cleanly and
 * a future maintainer has one place to understand persistence.
 */
import db from './index.js'
import type { Card, Curator } from '../types.js'

// ---------------------------------------------------------------------------
// Curators
// ---------------------------------------------------------------------------

export function upsertCurator(input: {
  id: number
  username?: string
  first_name?: string
}): Curator {
  db.prepare(
    `INSERT INTO curators (id, username, first_name)
     VALUES (@id, @username, @first_name)
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name`,
  ).run({
    id: input.id,
    username: input.username ?? null,
    first_name: input.first_name ?? null,
  })
  return getCurator(input.id)!
}

export function getCurator(id: number): Curator | undefined {
  return db.prepare('SELECT * FROM curators WHERE id = ?').get(id) as
    | Curator
    | undefined
}

export function setCuratorRole(id: number, role: string): void {
  db.prepare('UPDATE curators SET role = ? WHERE id = ?').run(role, id)
}

export function setCuratorCadence(id: number, cadence: number): void {
  db.prepare('UPDATE curators SET cadence = ? WHERE id = ?').run(cadence, id)
}

export function setCuratorStatus(id: number, status: 'active' | 'paused'): void {
  db.prepare('UPDATE curators SET status = ? WHERE id = ?').run(status, id)
}

export function completeOnboarding(id: number): void {
  db.prepare(
    `UPDATE curators SET onboarded_at = datetime('now') WHERE id = ?`,
  ).run(id)
}

export function touchCurator(id: number): void {
  db.prepare(
    `UPDATE curators SET last_active_at = datetime('now') WHERE id = ?`,
  ).run(id)
}

export function setFocusAreas(curatorId: number, areaSlugs: string[]): void {
  const tx = db.transaction((slugs: string[]) => {
    db.prepare('DELETE FROM curator_focus WHERE curator_id = ?').run(curatorId)
    const ins = db.prepare(
      'INSERT OR IGNORE INTO curator_focus (curator_id, area_slug) VALUES (?, ?)',
    )
    for (const slug of slugs) ins.run(curatorId, slug)
  })
  tx(areaSlugs)
}

export function getFocusAreas(curatorId: number): string[] {
  return (
    db
      .prepare('SELECT area_slug FROM curator_focus WHERE curator_id = ?')
      .all(curatorId) as { area_slug: string }[]
  ).map((r) => r.area_slug)
}

/** Onboarded curators + vote counts + focus areas — for the dashboard. */
export function listCuratorsWithStats() {
  const rows = db
    .prepare(
      `SELECT c.id, c.username, c.first_name, c.role, c.cadence, c.status,
              c.created_at, c.last_active_at,
              (SELECT COUNT(*) FROM votes v WHERE v.curator_id = c.id) AS votes
       FROM curators c
       WHERE c.onboarded_at IS NOT NULL
       ORDER BY votes DESC, c.created_at ASC`,
    )
    .all() as {
    id: number
    username: string | null
    first_name: string | null
    role: string | null
    cadence: number | null
    status: string
    created_at: string
    last_active_at: string | null
    votes: number
  }[]
  return rows.map((r) => ({ ...r, focus: getFocusAreas(r.id) }))
}

export function countCurators(): number {
  return (
    db.prepare(
      `SELECT COUNT(*) AS n FROM curators WHERE onboarded_at IS NOT NULL`,
    ).get() as { n: number }
  ).n
}

// ---------------------------------------------------------------------------
// Sessions (transient per-curator flow state, stored as JSON)
// ---------------------------------------------------------------------------

export function getSession<T = Record<string, unknown>>(
  curatorId: number,
): T {
  const row = db
    .prepare('SELECT state FROM sessions WHERE curator_id = ?')
    .get(curatorId) as { state: string } | undefined
  return row ? (JSON.parse(row.state) as T) : ({} as T)
}

export function setSession(curatorId: number, state: unknown): void {
  db.prepare(
    `INSERT INTO sessions (curator_id, state, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(curator_id) DO UPDATE SET
       state = excluded.state, updated_at = excluded.updated_at`,
  ).run(curatorId, JSON.stringify(state))
}

export function clearSession(curatorId: number): void {
  db.prepare('DELETE FROM sessions WHERE curator_id = ?').run(curatorId)
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function getCard(id: number): Card | undefined {
  return db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as
    | Card
    | undefined
}

export function getActiveCards(): Card[] {
  return db
    .prepare('SELECT * FROM cards WHERE active = 1 ORDER BY id')
    .all() as Card[]
}

/** Every card (active and retired), highest-rated first — for the dashboard. */
export function getAllCards(): Card[] {
  return db
    .prepare('SELECT * FROM cards ORDER BY rating DESC')
    .all() as Card[]
}

/** Recent votes joined to card titles + curator role — for the dashboard feed. */
export function recentVotes(limit = 20) {
  return db
    .prepare(
      `SELECT v.created_at,
              c.role AS role,
              w.title AS winner, w.area_slug AS winner_area,
              l.title AS loser
       FROM votes v
       JOIN cards w ON w.id = v.winner_card_id
       JOIN cards l ON l.id = v.loser_card_id
       LEFT JOIN curators c ON c.id = v.curator_id
       ORDER BY v.id DESC LIMIT ?`,
    )
    .all(limit) as {
    created_at: string
    role: string | null
    winner: string
    winner_area: string
    loser: string
  }[]
}

/**
 * Pick a fresh challenger card that isn't `excludeId` and (where possible) the
 * curator hasn't seen recently. We bias toward cards with fewer matches so the
 * comparison budget spreads across the whole pool.
 */
export function pickChallenger(
  curatorId: number,
  excludeId: number | null,
): Card | undefined {
  return db
    .prepare(
      `SELECT * FROM cards
       WHERE active = 1
         AND id != COALESCE(?, -1)
       ORDER BY matches ASC, RANDOM()
       LIMIT 1`,
    )
    .get(excludeId) as Card | undefined
}

export function upsertCard(card: {
  key: string
  title: string
  description?: string | null
  href: string
  source?: string | null
  source_kind?: 'internal' | 'field'
  type?: string
  area_slug: string
  area_label: string
  image?: string | null
  external?: boolean
}): void {
  db.prepare(
    `INSERT INTO cards
       (key, title, description, href, source, source_kind, type,
        area_slug, area_label, image, external)
     VALUES
       (@key, @title, @description, @href, @source, @source_kind, @type,
        @area_slug, @area_label, @image, @external)
     ON CONFLICT(key) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       href = excluded.href,
       source = excluded.source,
       source_kind = excluded.source_kind,
       type = excluded.type,
       area_slug = excluded.area_slug,
       area_label = excluded.area_label,
       image = excluded.image,
       external = excluded.external`,
  ).run({
    key: card.key,
    title: card.title,
    description: card.description ?? null,
    href: card.href,
    source: card.source ?? null,
    source_kind: card.source_kind ?? 'internal',
    type: card.type ?? 'Signal',
    area_slug: card.area_slug,
    area_label: card.area_label,
    image: card.image ?? null,
    external: card.external ? 1 : 0,
  })
}

// ---------------------------------------------------------------------------
// Rounds & votes
// ---------------------------------------------------------------------------

export function startRound(curatorId: number, size: number): number {
  const info = db
    .prepare('INSERT INTO rounds (curator_id, size) VALUES (?, ?)')
    .run(curatorId, size)
  return Number(info.lastInsertRowid)
}

export function completeRound(roundId: number): void {
  db.prepare(
    `UPDATE rounds SET completed_at = datetime('now') WHERE id = ?`,
  ).run(roundId)
}

/**
 * Record one pairwise preference and update both cards' Elo cache in a single
 * transaction. `newWinner`/`newLoser` are the post-update ratings computed by
 * the caller (see ranking/elo.ts).
 */
export const recordVote = db.transaction(
  (v: {
    curatorId: number
    winnerId: number
    loserId: number
    roundId: number
    newWinnerRating: number
    newLoserRating: number
  }) => {
    db.prepare(
      `INSERT INTO votes (curator_id, winner_card_id, loser_card_id, round_id)
       VALUES (?, ?, ?, ?)`,
    ).run(v.curatorId, v.winnerId, v.loserId, v.roundId)

    db.prepare(
      'UPDATE cards SET rating = ?, matches = matches + 1 WHERE id = ?',
    ).run(v.newWinnerRating, v.winnerId)
    db.prepare(
      'UPDATE cards SET rating = ?, matches = matches + 1 WHERE id = ?',
    ).run(v.newLoserRating, v.loserId)

    db.prepare(
      'UPDATE rounds SET comparisons = comparisons + 1 WHERE id = ?',
    ).run(v.roundId)
  },
)

export function totalVotes(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM votes').get() as { n: number })
    .n
}
