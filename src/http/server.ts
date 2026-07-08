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
import {
  globalLeaderboard,
  leaderboardForRole,
  attributeWinRates,
  rankEdition,
  type Lens,
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

/** Parse a lens query string: "general" | "role:capital" | "focus:ai-robotics". */
function parseLens(raw: unknown): Lens {
  const s = typeof raw === 'string' ? raw : 'general'
  if (s.startsWith('role:')) return { type: 'role', key: s.slice(5) }
  if (s.startsWith('focus:')) return { type: 'focus', slug: s.slice(6) }
  return { type: 'general' }
}

export function createServer() {
  const app = express()

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

  // The Radar for an edition, ranked through a lens (general / role / focus).
  // Returns top `limit` cards in plrd.org's RadarItem shape.
  app.get('/api/radar.json', (req, res) => {
    const edition = (req.query.edition as string) || currentEdition()
    const lens = parseLens(req.query.lens)
    const limit = Math.min(Number(req.query.limit) || 5, 12)
    const ranked = rankEdition(edition, lens)
    const items = ranked
      .slice(0, limit)
      .map((row) => toRadarItem(getCard(row.id)!, row.rating))
    res.json({
      edition,
      label: editionLabel(edition),
      lens: req.query.lens || 'general',
      poolSize: ranked.length,
      items,
    })
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
