/**
 * Segment ("conjoint-style") analysis.
 *
 * The global Elo answers "what is the strongest card overall?". This module
 * answers "who cares about what?" by slicing the same vote stream two ways:
 *
 *  1. Per-segment leaderboards — recompute Elo using only votes from curators
 *     in a given segment (e.g. role = capital). Reveals that, say, investors
 *     rank governance signals higher than researchers do.
 *
 *  2. Attribute win-rates (the conjoint/part-worth flavour) — for each card
 *     attribute (focus area, content type, internal-vs-field) compute how often
 *     cards with that attribute win their comparisons, per segment. This is a
 *     lightweight estimate of how much each attribute "pulls" a segment's
 *     preference, without asking curators anything beyond which card they liked.
 *
 * All of this is derived from `votes` + `cards` + `curators`; no extra input is
 * demanded of curators beyond the taps they already make.
 */
import db from '../db/index.js'
import { recomputeElo } from './elo.js'

type VoteRow = { winner_card_id: number; loser_card_id: number }

function allCardIds(): number[] {
  return (db.prepare('SELECT id FROM cards').all() as { id: number }[]).map(
    (r) => r.id,
  )
}

/** Elo leaderboard computed from votes cast by curators with a given role. */
export function leaderboardForRole(role: string) {
  const votes = db
    .prepare(
      `SELECT v.winner_card_id, v.loser_card_id
       FROM votes v JOIN curators c ON c.id = v.curator_id
       WHERE c.role = ?
       ORDER BY v.id`,
    )
    .all(role) as VoteRow[]
  return rankCards(recomputeElo(votes, allCardIds()))
}

/** Global Elo leaderboard from all votes. */
export function globalLeaderboard() {
  const votes = db
    .prepare('SELECT winner_card_id, loser_card_id FROM votes ORDER BY id')
    .all() as VoteRow[]
  return rankCards(recomputeElo(votes, allCardIds()))
}

/** Elo leaderboard from votes cast by curators who follow a given focus area. */
export function leaderboardForFocus(areaSlug: string) {
  const votes = db
    .prepare(
      `SELECT v.winner_card_id, v.loser_card_id
       FROM votes v
       WHERE v.curator_id IN (
         SELECT curator_id FROM curator_focus WHERE area_slug = ?
       )
       ORDER BY v.id`,
    )
    .all(areaSlug) as VoteRow[]
  return rankCards(recomputeElo(votes, allCardIds()))
}

/**
 * A "lens" is a curator PROFILE — a set of attributes describing whose taste to
 * view the Radar through. It's a composite (role AND focus areas, AND any
 * future traits), not either/or. An empty profile = the General Radar.
 *
 * `focus` matches curators who follow ANY of the selected areas; `traits` are
 * arbitrary key/value answers from `curator_traits` (future onboarding
 * questions) — so the profile can grow without touching this signature.
 */
export type Profile = {
  role?: string
  focus?: string[]
  traits?: { key: string; value: string }[]
}

function hasFilters(p: Profile): boolean {
  return !!(p.role || p.focus?.length || p.traits?.length)
}

/** Build the WHERE clause matching curators to a profile. */
function curatorWhere(p: Profile): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  if (p.role) {
    clauses.push('c.role = ?')
    params.push(p.role)
  }
  if (p.focus?.length) {
    clauses.push(
      `EXISTS (SELECT 1 FROM curator_focus cf WHERE cf.curator_id = c.id
               AND cf.area_slug IN (${p.focus.map(() => '?').join(',')}))`,
    )
    params.push(...p.focus)
  }
  for (const t of p.traits ?? []) {
    clauses.push(
      `EXISTS (SELECT 1 FROM curator_traits ct WHERE ct.curator_id = c.id
               AND ct.trait_key = ? AND ct.trait_value = ?)`,
    )
    params.push(t.key, t.value)
  }
  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params }
}

/** How many curators match this profile (the size of your "peer" set). */
export function countCuratorsMatching(p: Profile): number {
  const w = hasFilters(p) ? curatorWhere(p) : { sql: 'onboarded_at IS NOT NULL', params: [] }
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM curators c WHERE ${w.sql}`)
      .get(...w.params) as { n: number }
  ).n
}

function toEdition(board: ReturnType<typeof rankCards>, edition: string) {
  const ids = new Set(
    (
      db
        .prepare('SELECT id FROM cards WHERE edition = ? AND active = 1')
        .all(edition) as { id: number }[]
    ).map((r) => r.id),
  )
  return board.filter((c) => ids.has(c.id))
}

/**
 * Rank one edition's cards through a profile. No filters => General Radar (every
 * vote). Otherwise only votes from curators matching the profile are counted,
 * surfacing what "people like you" ranked highest. Cards never face cards from
 * other editions, so filtering the ranking to an edition is safe.
 */
export function rankEditionByProfile(edition: string, p: Profile) {
  let votes: VoteRow[]
  if (!hasFilters(p)) {
    votes = db
      .prepare('SELECT winner_card_id, loser_card_id FROM votes ORDER BY id')
      .all() as VoteRow[]
  } else {
    const w = curatorWhere(p)
    votes = db
      .prepare(
        `SELECT v.winner_card_id, v.loser_card_id FROM votes v
         WHERE v.curator_id IN (SELECT c.id FROM curators c WHERE ${w.sql})
         ORDER BY v.id`,
      )
      .all(...w.params) as VoteRow[]
  }
  return toEdition(rankCards(recomputeElo(votes, allCardIds())), edition)
}

function rankCards(ratings: Map<number, number>) {
  const cards = db
    .prepare('SELECT id, key, title, area_slug, type, source_kind FROM cards')
    .all() as {
    id: number
    key: string
    title: string
    area_slug: string
    type: string
    source_kind: string
  }[]
  return cards
    .map((c) => ({ ...c, rating: ratings.get(c.id) ?? 1500 }))
    .sort((a, b) => b.rating - a.rating)
}

/**
 * Attribute win-rates. For each value of an attribute, how often did cards with
 * that value win the comparisons they took part in? Optionally scoped to a role.
 */
export function attributeWinRates(
  attribute: 'area_slug' | 'type' | 'source_kind',
  role?: string,
) {
  const roleClause = role ? 'AND c.role = ?' : ''
  const params = role ? [role] : []

  const rows = db
    .prepare(
      `WITH outcomes AS (
         SELECT w.${attribute} AS attr, 1 AS win, 0 AS loss
         FROM votes v
         JOIN curators c ON c.id = v.curator_id
         JOIN cards w ON w.id = v.winner_card_id
         WHERE 1=1 ${roleClause}
         UNION ALL
         SELECT l.${attribute} AS attr, 0 AS win, 1 AS loss
         FROM votes v
         JOIN curators c ON c.id = v.curator_id
         JOIN cards l ON l.id = v.loser_card_id
         WHERE 1=1 ${roleClause}
       )
       SELECT attr,
              SUM(win) AS wins,
              SUM(loss) AS losses,
              SUM(win) + SUM(loss) AS appearances
       FROM outcomes
       GROUP BY attr
       ORDER BY (CAST(SUM(win) AS REAL) / MAX(SUM(win)+SUM(loss),1)) DESC`,
    )
    .all(...params, ...params) as {
    attr: string
    wins: number
    losses: number
    appearances: number
  }[]

  return rows.map((r) => ({
    value: r.attr,
    wins: r.wins,
    appearances: r.appearances,
    winRate: r.appearances ? r.wins / r.appearances : 0,
  }))
}
