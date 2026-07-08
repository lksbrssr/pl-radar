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
} from '../ranking/segments.js'
import { ROLES } from '../types.js'
import { renderDashboard } from './dashboard.js'
import { currentEdition } from '../config.js'

function formatDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function createServer() {
  const app = express()

  // NOTE: no X-Frame-Options / restrictive CSP — keeps the results dashboard
  // embeddable from *.plnetwork.io (see the PL app-store rules).

  app.get('/health', (_req, res) => res.json({ ok: true }))

  // The dashboard IS the landing page (so the PL app store shows it at `/`).
  app.get(['/', '/dashboard'], (_req, res) => {
    res.type('html').send(renderDashboard())
  })

  app.get('/api/leaderboard.json', (_req, res) => {
    res.json({ generatedAt: new Date().toISOString(), cards: globalLeaderboard() })
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
