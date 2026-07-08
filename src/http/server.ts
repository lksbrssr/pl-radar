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

  app.get('/', (_req, res) => {
    res.type('html').send(
      `<!doctype html><meta charset="utf-8">
       <title>PL R&D Radar — Curation API</title>
       <body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px">
       <h1>PL R&D Radar — Curation backend</h1>
       <p>Crowd-curation service. The Telegram bot collects pairwise votes;
       these read-only endpoints publish the aggregated signal.</p>
       <ul>
         <li><a href="/api/leaderboard.json">/api/leaderboard.json</a></li>
         <li><a href="/api/radar-candidates.json">/api/radar-candidates.json</a></li>
         <li><a href="/api/segments.json">/api/segments.json</a></li>
       </ul></body>`,
    )
  })

  app.get('/api/leaderboard.json', (_req, res) => {
    res.json({ generatedAt: new Date().toISOString(), cards: globalLeaderboard() })
  })

  // Top N winners, shaped exactly like plrd.org's `RadarItem`.
  app.get('/api/radar-candidates.json', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 6, 24)
    const items = globalLeaderboard()
      .slice(0, limit)
      .map((row) => {
        const card = getCard(row.id)!
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
    res.json({ generatedAt: new Date().toISOString(), items })
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
