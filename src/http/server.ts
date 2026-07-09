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
import { composeCut } from '../ranking/compose.js'
import { renderDashboard } from './dashboard.js'
import {
  currentEdition,
  activeEdition,
  editionLabel,
  submitEnabled,
  aiAvailable,
} from '../config.js'
import { allSources } from '../ingest/sources/index.js'
import { activeCardCountByKeyPrefix } from '../ingest/stats.js'
import { parseCardDraft } from '../submit/parse.js'
import { parseSourceDraft, NoFeedError } from '../submit/parse.js'
import { FetchFailedError } from '../submit/fetch.js'
import { LlmUnavailableError } from '../submit/llm.js'
import { findDuplicate } from '../submit/dedup.js'

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
      // Compose once: gives us the raw score order (top), the diversity-balanced
      // selection (composed), and the full ranking for the cut-confidence note.
      const comp = composeCut(edition, limit)
      const toItems = (rows: typeof comp.ranking) =>
        rows.map((r) => toRadarItem(getCard(r.id)!, r.rating, { rd: r.se, score: r.score }))
      const scoreItems = toItems(comp.top)
      const balancedItems = toItems(comp.composed)
      return res.json({
        edition,
        label: editionLabel(edition),
        profile,
        rankedBy: config.radarCompose ? 'balanced' : 'confidence',
        cut: cutConfidence(comp.ranking, limit),
        peers: countCuratorsMatching(profile),
        poolSize: comp.ranking.length,
        // `items` respects RADAR_COMPOSE; both cuts are always returned so the UI
        // can offer a toggle.
        items: config.radarCompose ? balancedItems : scoreItems,
        scoreItems,
        balancedItems,
        composed: config.radarCompose,
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

  // The full candidate pool for an edition (for the Cards view), ranked by the
  // same confidence-aware score as the published cut, with per-card provenance
  // (Elo rating, comparisons, win rate) for the detail modal.
  app.get('/api/cards.json', (req, res) => {
    const edition = (req.query.edition as string) || currentEdition()
    const cutSize = Math.min(Number(req.query.cut) || 5, 12)
    const ranking = editionStrengthRanking(edition)
    const wins = repo.cardWinCounts()
    const items = ranking.map((r, idx) => {
      const card = getCard(r.id)!
      const w = wins.get(r.id) ?? 0
      return {
        key: card.key,
        title: card.title,
        description: card.description ?? undefined,
        href: card.href,
        external: !!card.external,
        type: card.type,
        source: card.source ?? undefined,
        areaLabel: card.area_label,
        areaSlug: card.area_slug,
        date: card.edition
          ? editionLabel(card.edition)
          : formatDate(card.created_at),
        image: card.image ?? undefined,
        rank: idx + 1,
        inCut: idx < cutSize,
        rating: Math.round(r.rating),
        votes: r.games,
        winrate: r.games > 0 ? Math.round((w / r.games) * 100) : null,
      }
    })
    res.json({
      generatedAt: new Date().toISOString(),
      edition,
      label: editionLabel(edition),
      cutSize,
      total: items.length,
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

  // Claim a personal magic-link token (sent by the bot) → resolve it to the real
  // Telegram curator so browser votes count under their identity + segment. The
  // token is a bearer credential (whoever has the link can vote as them) — fine
  // for this low-stakes crowd-curation flow, and the same trust model as the
  // anonymous web-voter token.
  app.post('/api/web/claim', (req, res) => {
    const token = String((req.body ?? {}).token || '')
    const curator = token ? repo.getCuratorByToken(token) : undefined
    if (!curator) return res.status(404).json({ ok: false })
    res.json({
      ok: true,
      id: curator.id,
      role: curator.role ?? '',
      focus: repo.getFocusAreas(curator.id),
      name: curator.first_name ?? null,
      linked: curator.id > 0, // a real Telegram curator (vs. anonymous web voter)
    })
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
    const cur = activeEdition()
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
      sources: allSources().map((s) => ({
        key: s.key,
        name: s.name,
        description: s.description,
        homepage: s.homepage ?? null,
        external: !!s.external,
        cards: s.keyPrefix ? activeCardCountByKeyPrefix(s.keyPrefix) : 0,
      })),
    })
  })

  // --- AI card/source submission (SUBMIT_KEY-gated) -----------------------
  // Whether the submit surface is on, and whether an LLM is wired up (so the UI
  // knows to offer the "paste a URL" flow vs. only the manual/agent path). Safe
  // to call unauthenticated — it never reveals the key.
  app.get('/api/submit/status', (_req, res) => {
    res.json({ enabled: submitEnabled(), ai: aiAvailable() })
  })

  // Shared gate: every token-burning / write endpoint below requires the
  // x-submit-key header to match SUBMIT_KEY. Returns false + a response when it
  // fails so callers can early-return.
  function guard(req: express.Request, res: express.Response): boolean {
    if (!submitEnabled()) {
      res.status(503).json({ ok: false, reason: 'disabled' })
      return false
    }
    const key = req.get('x-submit-key') || ''
    if (key !== config.submitKey) {
      res.status(401).json({ ok: false, reason: 'unauthorized' })
      return false
    }
    return true
  }

  function dupPayload(hit: NonNullable<ReturnType<typeof findDuplicate>>) {
    const c = hit.card
    return {
      reason: hit.reason,
      card: {
        key: c.key,
        title: c.title,
        href: c.href,
        edition: c.edition,
        editionLabel: c.edition ? editionLabel(c.edition) : null,
        image: c.image ?? null,
        areaLabel: c.area_label,
      },
    }
  }

  // Paste a URL → fetch it → have the LLM turn it into a review-ready card
  // draft, and run the dedup check up front so the UI can warn before the user
  // bothers reviewing. Distinct `reason`s let the client fall back to the manual
  // path only when appropriate (fetch/ai failures), not on a duplicate.
  app.post('/api/submit/parse', async (req, res) => {
    if (!guard(req, res)) return
    const url = String((req.body ?? {}).url || '').trim()
    if (!/^https?:\/\/\S+$/i.test(url)) {
      return res.status(400).json({ ok: false, reason: 'bad-url' })
    }
    try {
      const draft = await parseCardDraft(url)
      const hit = findDuplicate({ href: draft.href, image: draft.image, title: draft.title })
      res.json({ ok: true, draft, duplicate: hit ? dupPayload(hit) : null })
    } catch (err) {
      if (err instanceof LlmUnavailableError) {
        return res.json({ ok: false, reason: 'ai-unavailable' })
      }
      if (err instanceof FetchFailedError) {
        return res.json({ ok: false, reason: 'fetch', message: err.message })
      }
      console.error('[submit] parse failed:', err)
      res.json({ ok: false, reason: 'parse', message: 'Could not read that page.' })
    }
  })

  // Commit a reviewed/edited card draft. Re-runs dedup at write time (the pool
  // may have changed since parse) and refuses duplicates with the existing card
  // so the UI can link to it. Otherwise files it into the open edition.
  app.post('/api/submit/card', (req, res) => {
    if (!guard(req, res)) return
    const b = req.body ?? {}
    const title = String(b.title || '').trim()
    const href = String(b.href || '').trim()
    const areaSlug = String(b.areaSlug || '').trim()
    if (!title || !/^https?:\/\/\S+$/i.test(href) || !areaSlug) {
      return res.status(400).json({ ok: false, reason: 'incomplete' })
    }
    const area = FOCUS_AREAS.find((a) => a.slug === areaSlug)
    if (!area) return res.status(400).json({ ok: false, reason: 'bad-area' })

    const hit = findDuplicate({ href, image: b.image ?? null, title })
    if (hit) return res.status(409).json({ ok: false, reason: 'duplicate', duplicate: dupPayload(hit) })

    const { card } = repo.submitCommunityCard({
      title,
      description: typeof b.description === 'string' ? b.description : null,
      href,
      source: typeof b.source === 'string' && b.source ? b.source : 'Community',
      areaSlug,
      areaLabel: area.label,
      type: typeof b.type === 'string' && b.type ? b.type : 'Signal',
      image: typeof b.image === 'string' && b.image ? b.image : null,
      angle: typeof b.angle === 'string' && b.angle ? b.angle : null,
    })
    res.json({
      ok: true,
      card: {
        key: card.key,
        title: card.title,
        href: card.href,
        edition: card.edition,
        editionLabel: card.edition ? editionLabel(card.edition) : null,
        areaLabel: card.area_label,
      },
    })
  })

  // Paste a site/feed URL → discover its RSS feed, preview the cards it would
  // produce, and dedup against feeds we already poll. There is NO manual
  // fallback here (by design): if we can't find a usable feed we just say so.
  app.post('/api/submit/source/parse', async (req, res) => {
    if (!guard(req, res)) return
    const url = String((req.body ?? {}).url || '').trim()
    if (!/^https?:\/\/\S+$/i.test(url)) {
      return res.status(400).json({ ok: false, reason: 'bad-url' })
    }
    try {
      const draft = await parseSourceDraft(url)
      const existing = repo.getFeedSourceByUrl(draft.feedUrl)
      const inPool = draft.sample.filter((s) => findDuplicate({ href: s.href })).length
      res.json({
        ok: true,
        draft,
        duplicate: existing
          ? { name: existing.name, feedUrl: existing.feed_url }
          : null,
        samplesAlreadyInPool: inPool,
      })
    } catch (err) {
      if (err instanceof NoFeedError) {
        return res.json({ ok: false, reason: 'no-feed', message: err.message })
      }
      console.error('[submit] source parse failed:', err)
      res.json({ ok: false, reason: 'error', message: 'Could not read that URL.' })
    }
  })

  // Persist a reviewed recurring source. From here the normal background ingest
  // polls it on schedule (see scheduler.ts) — no code PR, no restart.
  app.post('/api/submit/source', (req, res) => {
    if (!guard(req, res)) return
    const b = req.body ?? {}
    const name = String(b.name || '').trim()
    const feedUrl = String(b.feedUrl || '').trim()
    if (!name || !/^https?:\/\/\S+$/i.test(feedUrl)) {
      return res.status(400).json({ ok: false, reason: 'incomplete' })
    }
    const existing = repo.getFeedSourceByUrl(feedUrl)
    if (existing) {
      return res.status(409).json({
        ok: false,
        reason: 'duplicate',
        duplicate: { name: existing.name, feedUrl: existing.feed_url },
      })
    }
    const areaSlug =
      typeof b.areaSlug === 'string' && FOCUS_AREAS.some((a) => a.slug === b.areaSlug)
        ? b.areaSlug
        : null
    const src = repo.addFeedSource({
      name,
      description: typeof b.description === 'string' ? b.description : null,
      feedUrl,
      homepage: typeof b.homepage === 'string' && b.homepage ? b.homepage : null,
      areaSlug,
    })
    res.json({ ok: true, source: { key: src.key, name: src.name, feedUrl: src.feed_url } })
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
