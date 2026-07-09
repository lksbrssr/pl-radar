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
 * Every pairwise vote cast by curators matching a profile, chronological. No
 * filters => all votes (the General baseline). This is the single place the
 * "whose votes count" logic lives, shared by the Elo lens and the part-worth
 * estimator (ranking/partworths.ts).
 */
export function votesForProfile(p: Profile): VoteRow[] {
  if (!hasFilters(p)) {
    return db
      .prepare('SELECT winner_card_id, loser_card_id FROM votes ORDER BY id')
      .all() as VoteRow[]
  }
  const w = curatorWhere(p)
  return db
    .prepare(
      `SELECT v.winner_card_id, v.loser_card_id FROM votes v
       WHERE v.curator_id IN (SELECT c.id FROM curators c WHERE ${w.sql})
       ORDER BY v.id`,
    )
    .all(...w.params) as VoteRow[]
}

/** Every pairwise vote cast by a single curator (for the admin per-curator
 *  Insights lens). Thin by nature, so callers should surface a low-N caveat. */
export function votesForCurator(curatorId: number): VoteRow[] {
  return db
    .prepare(
      'SELECT winner_card_id, loser_card_id FROM votes WHERE curator_id = ? ORDER BY id',
    )
    .all(curatorId) as VoteRow[]
}

/**
 * Rank one edition's cards through a profile. No filters => General Radar (every
 * vote). Otherwise only votes from curators matching the profile are counted,
 * surfacing what "people like you" ranked highest. Cards never face cards from
 * other editions, so filtering the ranking to an edition is safe.
 */
export function rankEditionByProfile(edition: string, p: Profile) {
  return toEdition(
    rankCards(recomputeElo(votesForProfile(p), allCardIds())),
    edition,
  )
}

function rankCards(ratings: Map<number, number>) {
  const cards = db
    .prepare(
      `SELECT c.id, c.key, c.title, c.area_slug, c.type, c.source_kind,
              (SELECT a.attr_value FROM card_attributes a
               WHERE a.card_id = c.id AND a.attr_key = 'angle' LIMIT 1) AS angle
       FROM cards c`,
    )
    .all() as {
    id: number
    key: string
    title: string
    area_slug: string
    type: string
    source_kind: string
    angle: string | null
  }[]
  return cards
    .map((c) => ({ ...c, rating: ratings.get(c.id) ?? 1500 }))
    .sort((a, b) => b.rating - a.rating)
}

/**
 * @deprecated Superseded by the pairwise part-worth estimator in
 * `ranking/partworths.ts`. Marginal win-rates count wins/losses per attribute
 * value *ignoring the opponent*, so correlated attributes (topic/angle/format)
 * are confounded and the rates are near-symmetric by construction. The
 * conditional-logit estimator uses each vote as a choice between two known
 * attribute bundles and recovers the independent "pull" of each attribute.
 * Kept only so any external consumer still calling it keeps working; the
 * dashboard + JSON API no longer surface it.
 *
 * Attribute win-rates. For each value of an attribute, how often did cards with
 * that value win the comparisons they took part in? Optionally scoped to a role.
 *
 * `angle` is stored in the `card_attributes` EAV table (attr_key='angle'), not
 * as a column on `cards`, so it's read via a join; the plain-column attributes
 * (`area_slug` / `type` / `source_kind`) are read directly. Cards with no angle
 * row simply don't contribute to the `angle` breakdown.
 */
export function attributeWinRates(
  attribute: 'area_slug' | 'type' | 'source_kind' | 'angle',
  role?: string,
) {
  const roleClause = role ? 'AND c.role = ?' : ''
  const params = role ? [role] : []

  // Expression + join for the attribute on the winner (`w`) and loser (`l`)
  // side. Angle joins the EAV table; other attributes are card columns.
  const winExpr =
    attribute === 'angle' ? 'aw.attr_value' : `w.${attribute}`
  const loseExpr =
    attribute === 'angle' ? 'al.attr_value' : `l.${attribute}`
  const winJoin =
    attribute === 'angle'
      ? `JOIN card_attributes aw ON aw.card_id = v.winner_card_id AND aw.attr_key = 'angle'`
      : `JOIN cards w ON w.id = v.winner_card_id`
  const loseJoin =
    attribute === 'angle'
      ? `JOIN card_attributes al ON al.card_id = v.loser_card_id AND al.attr_key = 'angle'`
      : `JOIN cards l ON l.id = v.loser_card_id`

  const rows = db
    .prepare(
      `WITH outcomes AS (
         SELECT ${winExpr} AS attr, 1 AS win, 0 AS loss
         FROM votes v
         JOIN curators c ON c.id = v.curator_id
         ${winJoin}
         WHERE 1=1 ${roleClause}
         UNION ALL
         SELECT ${loseExpr} AS attr, 0 AS win, 1 AS loss
         FROM votes v
         JOIN curators c ON c.id = v.curator_id
         ${loseJoin}
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
