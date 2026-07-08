/**
 * Read-only HTTP surface.
 *
 *  GET /health                  — liveness probe (PLN/Fly require this).
 *  GET /                        — tiny human landing page.
 *  GET /api/leaderboard.json    — global Elo ranking of the card pool.
 *  GET /api/radar-candidates.json — top cards in plrd.org's RadarItem shape,
 *                                   so the public Radar can ingest winners.
 *  GET /api/segments.json       — per-role leaderboards + attribute win-rates
 *                                   (the "who values what" / conjoint view).
 *
 * These endpoints are the ONLY thing other systems consume. Secrets (bot token,
 * DB) never leave this process; the public JSON is derived + safe to cache.
 */
import express from 'express'
import { config } from '../config.js'
import * as repo from '../db/repo.js'
import { getCard } from '../db/repo.js'
import { updateRatings } from '../ranking/elo.js'
import {
  globalLeaderboard,
  leaderboardForRole,
  attributeWinRates,
  rankEditionByProfile,
  countCuratorsMatching,
  type Profile,
} from '../ranking/segments.js'
import { ROLES, FOCUS_AREAS, type Card } from '../types.js'
import { renderDashboard } from './dashboard.js'
import { currentEdition, editionLabel } from '../config.js'

function formatDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Shape a card as plrd.org's RadarItem (+ derived rating). */
function toRadarItem(card: Card, rating: number) {
  return {
    key: card.key,
    title: card.title,
    description: card.description ?? undefined,
    href: card.href,
    external: !!card.external,
    type: card.type,
    areaLabel: card.area_label,
    areaSlug: card.area_slug,
    date: card.edition ? editionLabel(card.edition) : formatDate(card.created_at),
    image: card.image ?? undefined,
    _rating: Math.round(rating),
  }
}

/**
 * Parse the Radar profile from the query: `role=capital` and/or
 * `focus=ai-robotics,neurotech` (comma-separated). Also accepts the legacy
 * `lens=role:x` / `lens=focus:y` form for backward compatibility.
 */
function parseProfile(q: Record<string, unknown>): Profile {
  const p: Profile = {}
  if (typeof q.role === 'string' && q.role) p.role = q.role
  if (typeof q.focus === 'string' && q.focus)
    p.focus = q.focus.split(',').map((s) => s.trim()).filter(Boolean)
  // Legacy single lens fallback.
  if (!p.role && !p.focus && typeof q.lens === 'string') {
    if (q.lens.startsWith('role:')) p.role = q.lens.slice(5)
    else if (q.lens.startsWith('focus:')) p.focus = [q.lens.slice(6)]
  }
  return p
}

/** Minimum ms between two votes from the same voter (anti-spam guard). */
const MIN_VOTE_MS = 900
/** In-memory last-vote timestamps (process-local; fine for a single machine). */
const lastVoteAt = new Map<number, number>()

/** Minimal card shape for the in-browser voting UI. */
function toVoteCard(c: Card) {
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? undefined,
    type: c.type,
    areaSlug: c.area_slug,
    areaLabel: c.area_label,
    source: c.source ?? undefined,
    sourceKind: c.source_kind,
    image: c.image ?? undefined,
    href: c.href,
  }
}

export function createServer() {
  const app = express()
  app.use(express.json())

  // NOTE: no X-Frame-Options / restrictive CSP — keeps the results dashboard
  // embeddable from *.plnetwork.io (see the PL app-store rules).

  app.get('/health', (_req, res) => res.json({ ok: true }))

  // The single-page app shell (sidebar: Radar / Vote / Data) is the landing
  // page, so the PL app store shows it at `/`.
  app.get(['/', '/dashboard'], (_req, res) => {
    res.type('html').send(renderDashboard())
  })

  app.get('/api/leaderboard.json', (_req, res) => {
    res.json({ generatedAt: new Date().toISOString(), cards: globalLeaderboard() })
  })

  // Editions available, newest first, with labels + a `current` flag.
  app.get('/api/editions.json', (_req, res) => {
    const cur = currentEdition()
    const editions = repo.listEditions().map((e) => ({
      edition: e.edition,
      label: editionLabel(e.edition),
      cards: e.cards,
      votes: e.votes ?? 0,
      current: e.edition === cur,
    }))
    res.json({ current: cur, editions })
  })

  // The Radar for an edition, ranked through a composite profile (role AND
  // focus areas AND future traits). Returns top `limit` cards as RadarItems.
  app.get('/api/radar.json', (req, res) => {
    const edition = (req.query.edition as string) || currentEdition()
    const profile = parseProfile(req.query as Record<string, unknown>)
    const limit = Math.min(Number(req.query.limit) || 5, 12)
    const ranked = rankEditionByProfile(edition, profile)
    const items = ranked
      .slice(0, limit)
      .map((row) => toRadarItem(getCard(row.id)!, row.rating))
    res.json({
      edition,
      label: editionLabel(edition),
      profile,
      peers: countCuratorsMatching(profile),
      poolSize: ranked.length,
      items,
    })
  })

  // --- In-browser voting (for people who don't want to vote in Telegram) ---

  // Register/refresh a browser voter from a client-generated token + profile.
  app.post('/api/web/register', (req, res) => {
    const { token, role, focus, name } = req.body ?? {}
    if (typeof token !== 'string' || token.length < 8) {
      return res.status(400).json({ error: 'missing token' })
    }
    const id = repo.registerWebCurator({
      token,
      role: typeof role === 'string' ? role : undefined,
      focus: Array.isArray(focus) ? focus.map(String) : undefined,
      name: typeof name === 'string' ? name : undefined,
    })
    res.json({ id })
  })

  // Pick a fresh challenger for the current edition, excluding the cards already
  // on screen (comma-separated ids). Least-seen first, so votes spread evenly.
  app.get('/api/vote/challenger', (req, res) => {
    const ids = String(req.query.exclude || '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n))
    const card = repo.pickChallengerExcluding(ids)
    if (!card) return res.status(404).json({ error: 'no cards' })
    res.json({ card: toVoteCard(card) })
  })

  // A voter's standing (for the "top curator" progress bar).
  app.get('/api/vote/me', (req, res) => {
    const token = req.query.token
    const curator = typeof token === 'string' ? repo.getCuratorByToken(token) : undefined
    if (!curator) return res.json({ stats: { votes: 0, rank: 0, of: repo.countCurators(), topVotes: 0 } })
    res.json({ stats: repo.voterStats(curator.id) })
  })

  // Record one pairwise web vote (winner beat loser) + update Elo.
  // A too-fast vote (< MIN_VOTE_MS since this voter's previous one) is rejected
  // as "tooFast" and NOT counted — a server-side guard so the client-side
  // slow-down nudge can't be bypassed by scripting.
  app.post('/api/vote', (req, res) => {
    const { token, winnerId, loserId } = req.body ?? {}
    const curator = typeof token === 'string' ? repo.getCuratorByToken(token) : undefined
    if (!curator) return res.status(401).json({ error: 'unknown voter' })

    const now = Date.now()
    const last = lastVoteAt.get(curator.id)
    if (last && now - last < MIN_VOTE_MS) {
      return res.json({ ok: false, tooFast: true, stats: repo.voterStats(curator.id) })
    }

    const winner = getCard(Number(winnerId))
    const loser = getCard(Number(loserId))
    if (!winner || !loser || winner.id === loser.id) {
      return res.status(400).json({ error: 'bad pair' })
    }
    const cur = currentEdition()
    if (winner.edition !== cur || loser.edition !== cur || !winner.active || !loser.active) {
      return res.status(400).json({ error: 'not votable this edition' })
    }
    const rated = updateRatings(winner.rating, loser.rating)
    repo.recordVote({
      curatorId: curator.id,
      winnerId: winner.id,
      loserId: loser.id,
      roundId: null,
      newWinnerRating: rated.winner,
      newLoserRating: rated.loser,
    })
    repo.touchCurator(curator.id)
    lastVoteAt.set(curator.id, now)
    res.json({ ok: true, stats: repo.voterStats(curator.id) })
  })

  // Everything the Data view needs, in one call.
  app.get('/api/overview.json', (_req, res) => {
    res.json({
      generatedAt: new Date().toISOString(),
      curators: repo.countCurators(),
      totalVotes: repo.totalVotes(),
      lenses: {
        roles: ROLES.map((r) => ({ key: r.key, label: r.label, emoji: r.emoji })),
        areas: FOCUS_AREAS.map((a) => ({ slug: a.slug, label: a.label, emoji: a.emoji })),
      },
      attributeWinRates: {
        area: attributeWinRates('area_slug'),
        type: attributeWinRates('type'),
        sourceKind: attributeWinRates('source_kind'),
      },
      byRole: ROLES.map((r) => ({
        key: r.key,
        label: r.label,
        emoji: r.emoji,
        areaRates: attributeWinRates('area_slug', r.key),
      })),
      curatorList: repo.listCuratorsWithStats(),
    })
  })

  // Top N winners for an edition (default: current month), shaped exactly like
  // plrd.org's `RadarItem` so the public Radar can ingest them directly.
  app.get('/api/radar-candidates.json', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 6, 24)
    const edition = (req.query.edition as string) || currentEdition()
    const items = globalLeaderboard()
      .map((row) => ({ row, card: getCard(row.id)! }))
      .filter(({ card }) => card.edition === edition && card.active)
      .slice(0, limit)
      .map(({ row, card }) => {
        return {
          key: card.key,
          title: card.title,
          description: card.description ?? undefined,
          href: card.href,
          external: !!card.external,
          type: card.type,
          areaLabel: card.area_label,
          areaSlug: card.area_slug,
          date: formatDate(card.created_at),
          image: card.image ?? undefined,
          // Extra signal for downstream use (ignored by the current Radar):
          _rating: Math.round(row.rating),
        }
      })
    res.json({ generatedAt: new Date().toISOString(), edition, items })
  })

  app.get('/api/segments.json', (_req, res) => {
    const byRole = ROLES.map((r) => ({
      role: r.key,
      label: r.label,
      top: leaderboardForRole(r.key).slice(0, 5),
    }))
    res.json({
      generatedAt: new Date().toISOString(),
      curators: repo.countCurators(),
      totalVotes: repo.totalVotes(),
      byRole,
      attributeWinRates: {
        area: attributeWinRates('area_slug'),
        type: attributeWinRates('type'),
        sourceKind: attributeWinRates('source_kind'),
      },
    })
  })

  return app
}

export function startServer() {
  const app = createServer()
  return app.listen(config.port, '0.0.0.0', () =>
    console.log(`[http] listening on :${config.port}`),
  )
}
