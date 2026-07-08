/**
 * Diverse composition of the monthly digest.
 *
 * The published cut ranked purely by conservative score can be monotonous (five
 * cards from one focus area / one angle). This selects a set that is strong AND
 * balanced — a spread across focus areas and angles — WITHOUT generating any new
 * cards or touching the ranking math. It is pure selection over the existing
 * ranked pool.
 *
 * Greedy max-marginal-relevance: at each step pick the candidate maximizing
 *   score − λ_area·(#selected same area) − λ_angle·(#selected same angle)
 * considering only the top 2·limit cards by score, so composition rebalances
 * near the top and never promotes a weak card for the sake of diversity.
 */
import db from '../db/index.js'
import { config } from '../config.js'
import { editionStrengthRanking, type StrengthRow } from './strength.js'
import { currentEdition } from '../config.js'

export type ComposedRow = StrengthRow & {
  area_slug: string
  type: string
  angle: string | null
}

export type ComposeOptions = {
  lambdaArea?: number
  lambdaAngle?: number
  /** Candidate window as a multiple of `limit` (default 2). */
  windowFactor?: number
}

export type ComposeResult = {
  /** The diversity-balanced selection (length ≤ limit). */
  composed: ComposedRow[]
  /** The raw top-N by conservative score, for side-by-side display. */
  top: ComposedRow[]
  /** The full ranked pool (with joined attributes). */
  ranking: ComposedRow[]
}

/** Join area_slug / type / angle onto a strength ranking. */
function withAttributes(ranking: StrengthRow[]): ComposedRow[] {
  if (!ranking.length) return []
  const ids = ranking.map((r) => r.id)
  const ph = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT c.id, c.area_slug, c.type,
              (SELECT a.attr_value FROM card_attributes a
               WHERE a.card_id = c.id AND a.attr_key = 'angle' LIMIT 1) AS angle
       FROM cards c WHERE c.id IN (${ph})`,
    )
    .all(...ids) as { id: number; area_slug: string; type: string; angle: string | null }[]
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ranking.map((r) => {
    const m = byId.get(r.id)
    return {
      ...r,
      area_slug: m?.area_slug ?? '',
      type: m?.type ?? '',
      angle: m?.angle ?? null,
    }
  })
}

/**
 * Compose a balanced cut for an edition. Returns the balanced selection, the raw
 * top-N by score, and the full attributed ranking.
 */
export function composeCut(
  edition: string = currentEdition(),
  limit = 5,
  opts: ComposeOptions = {},
): ComposeResult {
  const lambdaArea = opts.lambdaArea ?? config.composeLambdaArea
  const lambdaAngle = opts.lambdaAngle ?? config.composeLambdaAngle
  const windowFactor = opts.windowFactor ?? 2

  const ranking = withAttributes(editionStrengthRanking(edition))
  const top = ranking.slice(0, limit)
  if (ranking.length <= limit) {
    return { composed: ranking.slice(), top, ranking }
  }

  // Only rebalance within the strong window — never promote a weak card.
  const window = ranking.slice(0, Math.min(ranking.length, windowFactor * limit))
  const chosen: ComposedRow[] = []
  const areaCount = new Map<string, number>()
  const angleCount = new Map<string, number>()
  const taken = new Set<number>()

  while (chosen.length < limit && chosen.length < window.length) {
    let best: ComposedRow | null = null
    let bestVal = -Infinity
    for (const r of window) {
      if (taken.has(r.id)) continue
      const penalty =
        lambdaArea * (areaCount.get(r.area_slug) ?? 0) +
        lambdaAngle * (r.angle ? angleCount.get(r.angle) ?? 0 : 0)
      const val = r.score - penalty
      if (val > bestVal) {
        bestVal = val
        best = r
      }
    }
    if (!best) break
    chosen.push(best)
    taken.add(best.id)
    areaCount.set(best.area_slug, (areaCount.get(best.area_slug) ?? 0) + 1)
    if (best.angle) angleCount.set(best.angle, (angleCount.get(best.angle) ?? 0) + 1)
  }

  return { composed: chosen, top, ranking }
}
