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
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { config } from '../config.js'
import * as repo from '../db/repo.js'
import { getCard } from '../db/repo.js'
import { updateRatings } from '../ranking/elo.js'
import {
  globalLeaderboard,
  leaderboardForRole,
  rankEditionByProfile,
  countCuratorsMatching,
  type Profile,
} from '../ranking/segments.js'
import {
  cardFeatureMap,
  globalPartWorths,
  partWorthsForProfile,
  computeDeviations,
  consensusContested,
  supplyDemandGap,
  PARTWORTH_MIN_N,
  type RoleFit,
} from '../ranking/partworths.js'
import { ROLES, FOCUS_AREAS, ANGLES, type Card } from '../types.js'
import {
  editionStrengthRanking,
  cutConfidence,
  coverageGaps,
} from '../ranking/strength.js'
import { renderDashboard } from './dashboard.js'
import { currentEdition, editionLabel } from '../config.js'
import { SOURCES } from '../ingest/sources/index.js'
import { activeCardCountByKeyPrefix } from '../ingest/stats.js'

const REPO_URL = 'https://github.com/lksbrssr/plrd-radar-curator'

function formatDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Shape a card as plrd.org's RadarItem (+ derived rating and, optionally, the
 *  confidence-aware SE/score used for the published cut). */
function toRadarItem(
  card: Card,
  rating: number,
  extra?: { rd?: number; score?: number },
) {
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
    ...(extra?.rd != null ? { _rd: Math.round(extra.rd) } : {}),
    ...(extra?.score != null ? { _score: Math.round(extra.score) } : {}),
  }
}

/** True when a profile actually filters (an active lens), vs the General Radar. */
function hasLens(p: Profile): boolean {
  return !!(p.role || p.focus?.length || p.traits?.length)
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

  // Focus-area icons (self-hosted, matching plrd.org/about): 3 masked PNG logos
  // + a neurotech SVG, served at /icons/<slug>.(png|svg).
  app.use(
    '/icons',
    express.static(resolve(dirname(fileURLToPath(import.meta.url)), 'icons'), {
      maxAge: '7d',
    }),
  )

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

  // The Radar for an edition. The GENERAL radar (no lens) is the PUBLISHED cut:
  // ranked by the confidence-aware Bradley–Terry score (rating − z·SE), so it's
  // fair to late-added / thinly-voted cards regardless of when they entered.
  // A LENS (role/focus profile) is exploratory — kept on the fast per-profile
  // Elo recompute ("what people like you ranked"), which is lower-sample by
  // nature and not the official cut.
  app.get('/api/radar.json', (req, res) => {
    const edition = (req.query.edition as string) || currentEdition()
    const profile = parseProfile(req.query as Record<string, unknown>)
    const limit = Math.min(Number(req.query.limit) || 5, 12)

    if (!hasLens(profile)) {
      const ranking = editionStrengthRanking(edition)
      const items = ranking
        .slice(0, limit)
        .map((r) => toRadarItem(getCard(r.id)!, r.rating, { rd: r.se, score: r.score }))
      return res.json({
        edition,
        label: editionLabel(edition),
        profile,
        rankedBy: 'confidence',
        cut: cutConfidence(ranking, limit),
        peers: countCuratorsMatching(profile),
        poolSize: ranking.length,
        items,
      })
    }

    const ranked = rankEditionByProfile(edition, profile)
    const items = ranked
      .slice(0, limit)
      .map((row) => toRadarItem(getCard(row.id)!, row.rating))
    res.json({
      edition,
      label: editionLabel(edition),
      profile,
      rankedBy: 'lens',
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

  // The registered ingestion sources (for the Sources view). Adding a source is
  // a one-file PR; this reflects the registry + how many cards each source
  // currently contributes to the pool.
  app.get('/api/sources.json', (_req, res) => {
    res.json({
      repoUrl: REPO_URL,
      sourcesDir: `${REPO_URL}/tree/main/src/ingest/sources`,
      guideUrl: `${REPO_URL}/blob/main/src/ingest/README.md`,
      sources: SOURCES.map((s) => ({
        key: s.key,
        name: s.name,
        description: s.description,
        homepage: s.homepage ?? null,
        external: !!s.external,
        cards: s.keyPrefix ? activeCardCountByKeyPrefix(s.keyPrefix) : 0,
      })),
    })
  })

  // Everything the Data view needs, in one call. Preference is decomposed with
  // the pairwise part-worth estimator (see ranking/partworths.ts), not marginal
  // win-rates. We compute each fit once and reuse it across the four views.
  app.get('/api/overview.json', (_req, res) => {
    const feats = cardFeatureMap()
    const baseline = globalPartWorths(feats)
    const roleFits: RoleFit[] = ROLES.map((r) => ({
      role: r.key,
      fit: partWorthsForProfile({ role: r.key }, feats),
    }))

    res.json({
      generatedAt: new Date().toISOString(),
      curators: repo.countCurators(),
      totalVotes: repo.totalVotes(),
      lenses: {
        roles: ROLES.map((r) => ({ key: r.key, label: r.label, emoji: r.emoji })),
        areas: FOCUS_AREAS.map((a) => ({ slug: a.slug, label: a.label, emoji: a.emoji })),
        angles: ANGLES.map((a) => ({ key: a.key, label: a.label, emoji: a.emoji, hint: a.hint })),
      },
      partWorths: {
        threshold: PARTWORTH_MIN_N,
        groups: [
          { key: 'angle', label: 'Angle' },
          { key: 'area', label: 'Focus area' },
          { key: 'type', label: 'Content type' },
          { key: 'source_kind', label: 'Source' },
        ],
        // View 1 — part-worths by segment (All + each role).
        global: { nVotes: baseline.nVotes, byGroup: baseline.byGroup },
        byRole: ROLES.map((r, i) => {
          const fit = roleFits[i]!.fit
          return {
            key: r.key,
            label: r.label,
            emoji: r.emoji,
            nVotes: fit.nVotes,
            byGroup: fit.byGroup,
            // View 2 — deviation from the all-curator baseline.
            deviations: computeDeviations(fit, baseline),
          }
        }),
      },
      // View 3 — consensus vs contested cards.
      consensus: consensusContested(roleFits, feats),
      // View 4 — supply/demand gap (a sourcing instruction for ingestion).
      supplyDemand: supplyDemandGap(baseline, feats),
      curatorList: repo.listCuratorsWithStats(),
    })
  })

  // Top N winners for an edition (default: current month), shaped exactly like
  // plrd.org's `RadarItem` so the public Radar can ingest them directly.
  app.get('/api/radar-candidates.json', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 6, 24)
    const edition = (req.query.edition as string) || currentEdition()
    // Confidence-aware cut (rating − z·SE), not the sequential Elo cache, so the
    // winners the public Radar ingests aren't skewed by how long a card has
    // been in the pool.
    const ranking = editionStrengthRanking(edition)
    const items = ranking.slice(0, limit).map((r) => {
      const card = getCard(r.id)!
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
        _rating: Math.round(r.rating),
        _rd: Math.round(r.se),
        _score: Math.round(r.score),
      }
    })
    res.json({
      generatedAt: new Date().toISOString(),
      edition,
      cut: cutConfidence(ranking, limit),
      items,
    })
  })

  // What still needs votes to lock this edition's Radar (drives the targeted
  // Telegram nudge, and the "confidence in the cut" note in the web app).
  app.get('/api/coverage.json', (req, res) => {
    const edition = (req.query.edition as string) || currentEdition()
    const limit = Math.min(Number(req.query.limit) || 5, 12)
    res.json({ generatedAt: new Date().toISOString(), ...coverageGaps(edition, limit) })
  })

  // Machine-readable segment analysis: per-role Elo leaderboards + the pairwise
  // part-worth decomposition (global baseline + per-segment fits + deviations).
  // Supersedes the old marginal attributeWinRates block.
  app.get('/api/segments.json', (_req, res) => {
    const feats = cardFeatureMap()
    const baseline = globalPartWorths(feats)
    const byRole = ROLES.map((r) => {
      const fit = partWorthsForProfile({ role: r.key }, feats)
      return {
        role: r.key,
        label: r.label,
        top: leaderboardForRole(r.key).slice(0, 5),
        partWorths: { nVotes: fit.nVotes, byGroup: fit.byGroup },
        deviations: computeDeviations(fit, baseline),
      }
    })
    res.json({
      generatedAt: new Date().toISOString(),
      curators: repo.countCurators(),
      totalVotes: repo.totalVotes(),
      partWorthThreshold: PARTWORTH_MIN_N,
      partWorths: { global: { nVotes: baseline.nVotes, byGroup: baseline.byGroup } },
      byRole,
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
