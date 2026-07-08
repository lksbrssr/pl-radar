/**
 * Data-access layer. All SQL lives here so the bot/HTTP code reads cleanly and
 * a future maintainer has one place to understand persistence.
 */
import db from './index.js'
import type { Card, Curator } from '../types.js'
import { currentEdition, activeEdition } from '../config.js'
import { sourceRank, canonicalUrl } from '../ingest/identity.js'

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
// Web curators (people voting in the browser rather than Telegram)
// ---------------------------------------------------------------------------

export function getCuratorByToken(token: string): Curator | undefined {
  return db
    .prepare('SELECT * FROM curators WHERE web_token = ?')
    .get(token) as Curator | undefined
}

/**
 * Register (or update) a browser voter identified by a client-generated token.
 * Web curators get negative ids so they never collide with real Telegram user
 * ids (which are positive). Reuses the same role + focus profile machinery, so
 * their votes flow into the exact same Elo + segment analysis.
 */
export const registerWebCurator = db.transaction(
  (input: { token: string; role?: string; focus?: string[]; name?: string }) => {
    const existing = getCuratorByToken(input.token)
    let id: number
    if (existing) {
      id = existing.id
    } else {
      const min = (db.prepare('SELECT MIN(id) AS m FROM curators').get() as {
        m: number | null
      }).m
      id = Math.min(-1, (min ?? 0) - 1) // next id below the current minimum
      db.prepare(
        `INSERT INTO curators (id, first_name, web_token, onboarded_at)
         VALUES (?, ?, ?, datetime('now'))`,
      ).run(id, input.name ?? 'Web voter', input.token)
    }
    if (input.role) setCuratorRole(id, input.role)
    if (input.focus) setFocusAreas(id, input.focus)
    completeOnboarding(id)
    touchCurator(id)
    return id
  },
)

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

/**
 * Card columns + the primary `angle` pulled from the `card_attributes` EAV
 * table (attr_key='angle'). Reads select through this so a Card always carries
 * its angle without a schema column on `cards`.
 */
const CARD_COLUMNS = `c.*, (
  SELECT a.attr_value FROM card_attributes a
  WHERE a.card_id = c.id AND a.attr_key = 'angle'
  LIMIT 1
) AS angle`

export function getCard(id: number): Card | undefined {
  return db
    .prepare(`SELECT ${CARD_COLUMNS} FROM cards c WHERE c.id = ?`)
    .get(id) as Card | undefined
}

/** Cards open for voting: active AND in the current monthly edition. Old
 *  editions "expire" out of the voting pool automatically. */
export function getActiveCards(): Card[] {
  return db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM cards c
       WHERE c.active = 1 AND c.edition = ? ORDER BY c.id`,
    )
    .all(activeEdition()) as Card[]
}

/** Every card (active and retired), highest-rated first — for the dashboard. */
export function getAllCards(): Card[] {
  return db
    .prepare(`SELECT ${CARD_COLUMNS} FROM cards c ORDER BY c.rating DESC`)
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
      `SELECT ${CARD_COLUMNS} FROM cards c
       WHERE c.active = 1
         AND c.edition = ?
         AND c.id != COALESCE(?, -1)
       ORDER BY c.matches ASC, RANDOM()
       LIMIT 1`,
    )
    .get(activeEdition(), excludeId) as Card | undefined
}

/** Pick a fresh current-edition card excluding a set of ids (least-seen first). */
export function pickChallengerExcluding(excludeIds: number[]): Card | undefined {
  const ph = excludeIds.map(() => '?').join(',')
  const notIn = excludeIds.length ? `AND id NOT IN (${ph})` : ''
  return db
    .prepare(
      `SELECT * FROM cards WHERE active = 1 AND edition = ? ${notIn}
       ORDER BY matches ASC, RANDOM() LIMIT 1`,
    )
    .get(activeEdition(), ...excludeIds) as Card | undefined
}

/** Distinct editions present, newest first, with counts. */
export function listEditions() {
  return db
    .prepare(
      `SELECT edition,
              COUNT(*) AS cards,
              SUM(matches) AS votes
       FROM cards
       WHERE edition IS NOT NULL
       GROUP BY edition
       ORDER BY edition DESC`,
    )
    .all() as { edition: string; cards: number; votes: number }[]
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
  edition?: string
  image?: string | null
  external?: boolean
  /** Primary rhetorical hook (see ANGLES in types.ts). */
  angle?: string | null
  /** Optional secondary hook. */
  angle_secondary?: string | null
}): void {
  const tx = db.transaction(() => {
  db.prepare(
    `INSERT INTO cards
       (key, title, description, href, source, source_kind, type,
        area_slug, area_label, edition, image, external)
     VALUES
       (@key, @title, @description, @href, @source, @source_kind, @type,
        @area_slug, @area_label, @edition, @image, @external)
     ON CONFLICT(key) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       href = excluded.href,
       source = excluded.source,
       source_kind = excluded.source_kind,
       type = excluded.type,
       area_slug = excluded.area_slug,
       area_label = excluded.area_label,
       edition = excluded.edition,
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
    edition: card.edition ?? currentEdition(),
    image: card.image ?? null,
    external: card.external ? 1 : 0,
  })

  // Persist angle(s) into the card_attributes EAV table. We resolve the card
  // id from its stable key (works for both insert and update paths) and
  // replace any existing angle rows so re-seeding is idempotent.
  if (card.angle !== undefined || card.angle_secondary !== undefined) {
    const id = (
      db.prepare('SELECT id FROM cards WHERE key = ?').get(card.key) as {
        id: number
      }
    ).id
    setCardAngles(id, {
      angle: card.angle ?? null,
      angle_secondary: card.angle_secondary ?? null,
    })
  }
  })
  tx()
}

/**
 * Replace a card's angle rows in `card_attributes`. `angle` is the primary hook
 * (attr_key='angle'); `angle_secondary` is optional (attr_key='angle_secondary').
 * Passing `null` clears that slot. Only the keys provided are touched.
 */
export function setCardAngles(
  cardId: number,
  angles: { angle?: string | null; angle_secondary?: string | null },
): void {
  const del = db.prepare(
    'DELETE FROM card_attributes WHERE card_id = ? AND attr_key = ?',
  )
  const ins = db.prepare(
    'INSERT OR IGNORE INTO card_attributes (card_id, attr_key, attr_value) VALUES (?, ?, ?)',
  )
  const tx = db.transaction(() => {
    if (angles.angle !== undefined) {
      del.run(cardId, 'angle')
      if (angles.angle) ins.run(cardId, 'angle', angles.angle)
    }
    if (angles.angle_secondary !== undefined) {
      del.run(cardId, 'angle_secondary')
      if (angles.angle_secondary)
        ins.run(cardId, 'angle_secondary', angles.angle_secondary)
    }
  })
  tx()
}

// ---------------------------------------------------------------------------
// Content layer (deterministic dedup)
// ---------------------------------------------------------------------------

export type ContentUpsert = {
  identityKey: string
  identityKind: 'youtube' | 'url'
  sourceKey: string
  title: string
  url: string
  description?: string | null
  image?: string | null
  areaSlug: string
  areaLabel: string
  type: string
  source?: string | null
  sourceKind?: 'internal' | 'field'
  publishedAt?: string | null
  edition: string
}

/**
 * Upsert a content by `identity_key` and record source provenance. Applies
 * source precedence (the highest-precedence source owns the canonical scalar
 * fields) and best-of merges (longest description; the primary's image, else any
 * non-null). Idempotent. Returns the content id.
 */
/**
 * Merge the `loserId` content into `winnerId`: migrate the loser card's votes to
 * the winner's card (or re-link the loser card if the winner has none yet), carry
 * over provenance + match counts, then delete the loser content. Used to heal a
 * card that gained a STRONGER identity later (e.g. a URL-keyed content superseded
 * by the same asset's YouTube id) — so cross-posts that slipped in before the id
 * was known collapse on the next ingest. Votes (source of truth) are preserved.
 */
function mergeContentInto(loserId: number, winnerId: number): void {
  if (loserId === winnerId) return
  const winnerCard = db.prepare('SELECT id, matches FROM cards WHERE content_id = ?').get(winnerId) as
    | { id: number; matches: number }
    | undefined
  const loserCard = db.prepare('SELECT id, matches FROM cards WHERE content_id = ?').get(loserId) as
    | { id: number; matches: number }
    | undefined
  if (loserCard) {
    if (winnerCard && winnerCard.id !== loserCard.id) {
      db.prepare('UPDATE votes SET winner_card_id = ? WHERE winner_card_id = ?').run(winnerCard.id, loserCard.id)
      db.prepare('UPDATE votes SET loser_card_id = ? WHERE loser_card_id = ?').run(winnerCard.id, loserCard.id)
      // Drop any now-degenerate self-match (a vote between the two duplicates).
      db.prepare('DELETE FROM votes WHERE winner_card_id = loser_card_id').run()
      db.prepare('UPDATE cards SET matches = matches + ? WHERE id = ?').run(loserCard.matches, winnerCard.id)
      db.prepare('DELETE FROM cards WHERE id = ?').run(loserCard.id)
    } else if (!winnerCard) {
      // Winner content has no card yet — keep the loser card, re-point it.
      db.prepare('UPDATE cards SET content_id = ? WHERE id = ?').run(winnerId, loserCard.id)
    }
  }
  // Carry over provenance (skip rows that would collide), then cascade-delete the
  // loser content (removing any leftover content_sources).
  db.prepare('UPDATE OR IGNORE content_sources SET content_id = ? WHERE content_id = ?').run(winnerId, loserId)
  db.prepare('DELETE FROM content WHERE id = ?').run(loserId)
}

export const upsertContent = db.transaction((c: ContentUpsert): number => {
  const existing = db
    .prepare(
      `SELECT id, canonical_source_key, description, image FROM content WHERE identity_key = ?`,
    )
    .get(c.identityKey) as
    | { id: number; canonical_source_key: string | null; description: string | null; image: string | null }
    | undefined

  let contentId: number
  if (!existing) {
    contentId = Number(
      db
        .prepare(
          `INSERT INTO content
             (identity_key, identity_kind, canonical_source_key, canonical_title,
              canonical_url, description, image, area_slug, area_label, type,
              source, source_kind, published_at, edition)
           VALUES (@identity_key,@identity_kind,@canonical_source_key,@canonical_title,
              @canonical_url,@description,@image,@area_slug,@area_label,@type,
              @source,@source_kind,@published_at,@edition)`,
        )
        .run({
          identity_key: c.identityKey,
          identity_kind: c.identityKind,
          canonical_source_key: c.sourceKey,
          canonical_title: c.title,
          canonical_url: c.url,
          description: c.description ?? null,
          image: c.image ?? null,
          area_slug: c.areaSlug,
          area_label: c.areaLabel,
          type: c.type,
          source: c.source ?? null,
          source_kind: c.sourceKind ?? 'internal',
          published_at: c.publishedAt ?? null,
          edition: c.edition,
        }).lastInsertRowid,
    )
  } else {
    contentId = existing.id
    // This source owns the canonical scalar fields iff its rank is <= the
    // current owner's (<= so re-ingesting the same source refreshes fields).
    const wins = sourceRank(c.sourceKey) <= sourceRank(existing.canonical_source_key ?? '')
    // Best-of description = longest non-empty.
    const desc =
      (c.description?.length ?? 0) > (existing.description?.length ?? 0)
        ? c.description ?? existing.description
        : existing.description
    // Image: the primary's if present; else fill a missing image from any source.
    let image = existing.image
    if (wins && c.image) image = c.image
    else if (!image && c.image) image = c.image ?? null

    if (wins) {
      db.prepare(
        `UPDATE content SET
           canonical_source_key=@sk, canonical_title=@title, canonical_url=@url,
           area_slug=@area, area_label=@areaLabel, type=@type, source=@source,
           source_kind=@sourceKind, published_at=@pub, edition=@edition,
           description=@desc, image=@image
         WHERE id=@id`,
      ).run({
        sk: c.sourceKey, title: c.title, url: c.url, area: c.areaSlug,
        areaLabel: c.areaLabel, type: c.type, source: c.source ?? null,
        sourceKind: c.sourceKind ?? 'internal', pub: c.publishedAt ?? null,
        edition: c.edition, desc, image, id: contentId,
      })
    } else {
      db.prepare(`UPDATE content SET description=@desc, image=@image WHERE id=@id`).run({
        desc, image, id: contentId,
      })
    }
  }

  // Self-heal: if this asset now resolves to a YouTube identity but a separate
  // URL-keyed content still exists for the same link (a cross-post that entered
  // before we knew the video id), merge that stale content into this one.
  if (c.identityKind === 'youtube') {
    const urlKey = 'url:' + canonicalUrl(c.url)
    const dupe = db
      .prepare('SELECT id FROM content WHERE identity_key = ? AND id != ?')
      .get(urlKey, contentId) as { id: number } | undefined
    if (dupe) mergeContentInto(dupe.id, contentId)
  }

  db.prepare(
    `INSERT INTO content_sources
       (content_id, source_key, source_url, source_title, source_description, source_image)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_key, source_url) DO UPDATE SET
       source_title=excluded.source_title,
       source_description=excluded.source_description,
       source_image=excluded.source_image`,
  ).run(contentId, c.sourceKey, c.url, c.title, c.description ?? null, c.image ?? null)

  return contentId
})

/**
 * Ensure exactly ONE card exists for a content, keyed by `preferredKey` on first
 * creation. Syncs the card's display fields from the content's canonical values;
 * never changes an existing card's key (keeps upserts idempotent + vote FKs
 * intact). Returns whether it created a new card.
 */
export const upsertCardForContent = db.transaction(
  (contentId: number, preferredKey: string): { created: boolean; cardId: number } => {
    const content = db.prepare(`SELECT * FROM content WHERE id = ?`).get(contentId) as {
      canonical_title: string; canonical_url: string; description: string | null
      image: string | null; area_slug: string; area_label: string; type: string
      source: string | null; source_kind: string | null; edition: string | null
    }
    const external = content.source_kind === 'field' ? 1 : 0
    const fields = {
      title: content.canonical_title,
      description: content.description,
      href: content.canonical_url,
      source: content.source,
      source_kind: content.source_kind ?? 'internal',
      type: content.type,
      area_slug: content.area_slug,
      area_label: content.area_label,
      edition: content.edition,
      image: content.image,
      external,
    }
    const existing = db
      .prepare('SELECT id FROM cards WHERE content_id = ?')
      .get(contentId) as { id: number } | undefined
    if (existing) {
      db.prepare(
        `UPDATE cards SET title=@title, description=@description, href=@href,
           source=@source, source_kind=@source_kind, type=@type, area_slug=@area_slug,
           area_label=@area_label, edition=@edition, image=@image, external=@external
         WHERE id=@id`,
      ).run({ ...fields, id: existing.id })
      return { created: false, cardId: existing.id }
    }
    const cardId = Number(
      db
        .prepare(
          `INSERT INTO cards
             (key, title, description, href, source, source_kind, type,
              area_slug, area_label, edition, image, external, content_id)
           VALUES (@key,@title,@description,@href,@source,@source_kind,@type,
              @area_slug,@area_label,@edition,@image,@external,@content_id)`,
        )
        .run({ ...fields, key: preferredKey, content_id: contentId }).lastInsertRowid,
    )
    return { created: true, cardId }
  },
)

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
    roundId: number | null
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

/** wins keyed by card id (a card's Elo comes from these pairwise wins). */
export function cardWinCounts(): Map<number, number> {
  const rows = db
    .prepare(
      'SELECT winner_card_id AS id, COUNT(*) AS wins FROM votes GROUP BY winner_card_id',
    )
    .all() as { id: number; wins: number }[]
  return new Map(rows.map((r) => [r.id, r.wins]))
}

export function totalVotes(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM votes').get() as { n: number })
    .n
}

/**
 * A voter's standing among all curators, for the "top curator" progress bar:
 * their vote count, rank (1 = most votes), the field size, and the leader's
 * count (the bar's 100%).
 */
export function voterStats(curatorId: number) {
  const votes = (
    db
      .prepare('SELECT COUNT(*) AS n FROM votes WHERE curator_id = ?')
      .get(curatorId) as { n: number }
  ).n
  const topVotes = (
    db
      .prepare(
        'SELECT COALESCE(MAX(c),0) AS m FROM (SELECT COUNT(*) c FROM votes GROUP BY curator_id)',
      )
      .get() as { m: number }
  ).m
  const higher = (
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM (SELECT curator_id, COUNT(*) c FROM votes GROUP BY curator_id) WHERE c > ?',
      )
      .get(votes) as { n: number }
  ).n
  return { votes, rank: higher + 1, of: countCurators(), topVotes }
}
