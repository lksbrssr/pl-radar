/**
 * Confidence-aware card strength — batch Bradley–Terry (logistic) MLE with SEs.
 *
 * WHY (over the live Elo cache): Elo is updated sequentially, so a card that's
 * been in the pool longer has a more-converged rating, and two cards of equal
 * true strength can land at different Elo purely from *when* and *against whom*
 * they were compared. Picking the monthly Radar off that cache bakes in a
 * recency/exposure artifact.
 *
 * This fits every card's strength jointly from the whole vote history
 *
 *     P(i beats j) = sigmoid( θ_i − θ_j )
 *
 * which is order-independent and sample-aware. The inverse Hessian gives a
 * per-card standard error = an explicit *confidence*: a card with few (or
 * lopsided) comparisons has a wide SE. We publish the Radar by a CONSERVATIVE
 * score (rating − z·SE), so a late-added / thinly-voted card only makes the cut
 * if it's *confidently* good — not just luckily high — while it stays votable
 * all month and rises as votes accumulate. (The live Elo cache is kept for the
 * instant in-UI leaderboard; this is only for the published cut + confidence.)
 *
 * Hand-rolled ridge Newton–Raphson, no new deps (same family as
 * ranking/partworths.ts).
 */
import db from '../db/index.js'
import { currentEdition } from '../config.js'

/** Logit→Elo-points scale (same 400/ln(10) convention as chess Elo). */
const SCALE = 400 / Math.LN10 // ≈ 173.72
/** Ridge strength (keeps the additive-constant-degenerate fit identifiable). */
const RIDGE_LAMBDA = 0.5
/** Conservative-score / CI multiplier (≈1 SE — strict but not brutal). */
export const CONSERVATIVE_Z = 1.0
/** Below this many comparisons a card is treated as under-sampled. */
export const MIN_GAMES = 8

export type Strength = {
  id: number
  /** Elo-like points, mean 1500 across the fitted pool. */
  rating: number
  /** Standard error in the same points (confidence; smaller = surer). */
  se: number
  /** Comparisons this card took part in. */
  games: number
  /** Conservative score used for the cut = rating − z·se. */
  score: number
}

type Vote = { winner_card_id: number; loser_card_id: number }

// --- tiny dense linear algebra (K ≈ pool size; correctness over speed) ------

function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]!])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++)
      if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r
    ;[M[c], M[piv]] = [M[piv]!, M[c]!]
    const d = M[c]![c]! || 1e-12
    for (let j = c; j <= n; j++) M[c]![j]! /= d
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r]![c]!
      if (f === 0) continue
      for (let j = c; j <= n; j++) M[r]![j]! -= f * M[c]![j]!
    }
  }
  return M.map((row) => row[n]!)
}

function invert(A: number[][]): number[][] {
  const n = A.length
  const inv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let c = 0; c < n; c++) {
    const e = new Array(n).fill(0)
    e[c] = 1
    const x = solve(A, e)
    for (let r = 0; r < n; r++) inv[r]![c] = x[r]!
  }
  return inv
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z))
  const e = Math.exp(z)
  return e / (1 + e)
}

/**
 * Fit per-card Bradley–Terry strengths (pure). Returns rating (Elo points,
 * mean 1500), SE (points) and game count per id. Cards with no games come back
 * at 1500 with a wide SE.
 */
export function fitStrengths(
  cardIds: number[],
  votes: Vote[],
  lambda: number = RIDGE_LAMBDA,
): Map<number, Strength> {
  const K = cardIds.length
  const out = new Map<number, Strength>()
  if (K === 0) return out
  const col = new Map<number, number>()
  cardIds.forEach((id, i) => col.set(id, i))

  const games = new Array<number>(K).fill(0)
  const pairs: [number, number][] = [] // [winnerCol, loserCol]
  for (const v of votes) {
    const wi = col.get(v.winner_card_id)
    const li = col.get(v.loser_card_id)
    if (wi == null || li == null) continue
    pairs.push([wi, li])
    games[wi]! += 1
    games[li]! += 1
  }

  // Newton–Raphson on penalized log-likelihood. For a win (wi beats li) the
  // difference vector is e_wi − e_li; gradient = Σ(1−p)d − 2λθ, Hessian
  // = Σ p(1−p) d dᵀ + 2λI (SPD). d has exactly two non-zeros (+1, −1).
  let theta = new Array<number>(K).fill(0)
  let H: number[][] = []
  for (let it = 0; it < 60; it++) {
    const grad = new Array<number>(K).fill(0)
    H = Array.from({ length: K }, () => new Array<number>(K).fill(0))
    for (const [wi, li] of pairs) {
      const z = theta[wi]! - theta[li]!
      const p = sigmoid(z)
      const w = p * (1 - p)
      const r = 1 - p
      grad[wi]! += r
      grad[li]! -= r
      H[wi]![wi]! += w
      H[li]![li]! += w
      H[wi]![li]! -= w
      H[li]![wi]! -= w
    }
    for (let k = 0; k < K; k++) {
      grad[k]! -= 2 * lambda * theta[k]!
      H[k]![k]! += 2 * lambda
    }
    const step = solve(H, grad)
    let maxStep = 0
    for (let k = 0; k < K; k++) {
      theta[k]! += step[k]!
      maxStep = Math.max(maxStep, Math.abs(step[k]!))
    }
    if (maxStep < 1e-9) break
  }

  // Center to mean 0 (strengths are identified only up to an additive const).
  const mean = theta.reduce((s, t) => s + t, 0) / K
  for (let k = 0; k < K; k++) theta[k]! -= mean

  // SE from the diagonal of the inverse penalized Hessian.
  const cov = invert(H)

  cardIds.forEach((id, i) => {
    const rating = 1500 + SCALE * theta[i]!
    const se = SCALE * Math.sqrt(Math.max(cov[i]![i]!, 0))
    out.set(id, {
      id,
      rating,
      se,
      games: games[i]!,
      score: rating - CONSERVATIVE_Z * se,
    })
  })
  return out
}

// --- DB-backed edition ranking ---------------------------------------------

/** Active card ids in an edition. */
function editionCardIds(edition: string): number[] {
  return (
    db
      .prepare('SELECT id FROM cards WHERE edition = ? AND active = 1 ORDER BY id')
      .all(edition) as { id: number }[]
  ).map((r) => r.id)
}

/** All pairwise votes among an edition's cards (matchups are same-edition). */
function votesInEdition(edition: string): Vote[] {
  return db
    .prepare(
      `SELECT v.winner_card_id, v.loser_card_id FROM votes v
       JOIN cards w ON w.id = v.winner_card_id
       WHERE w.edition = ? ORDER BY v.id`,
    )
    .all(edition) as Vote[]
}

export type StrengthRow = Strength & { title: string; key: string }

/**
 * Confidence-aware ranking of an edition's pool, best conservative score first.
 * This is the ordering the PUBLISHED Radar cut uses.
 */
export function editionStrengthRanking(
  edition: string = currentEdition(),
): StrengthRow[] {
  const ids = editionCardIds(edition)
  const strengths = fitStrengths(ids, votesInEdition(edition))
  const meta = db
    .prepare(
      `SELECT id, key, title FROM cards WHERE edition = ? AND active = 1`,
    )
    .all(edition) as { id: number; key: string; title: string }[]
  const byId = new Map(meta.map((m) => [m.id, m]))
  return ids
    .map((id) => {
      const s = strengths.get(id)!
      const m = byId.get(id)!
      return { ...s, title: m.title, key: m.key }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Is the top-`limit` cut statistically resolved? Compares the #limit and
 * #limit+1 cards: the cut is "confident" only if their rating CIs (±z·SE) don't
 * overlap — i.e. we're sure #limit really beats #limit+1.
 */
export function cutConfidence(ranking: StrengthRow[], limit: number) {
  const inCut = ranking[limit - 1]
  const nextUp = ranking[limit]
  if (!inCut) return { resolved: true, margin: 0, boundaryLo: null, boundaryHi: null }
  if (!nextUp)
    return { resolved: true, margin: Infinity, boundaryLo: inCut.key, boundaryHi: null }
  const lo = inCut.rating - CONSERVATIVE_Z * inCut.se
  const hi = nextUp.rating + CONSERVATIVE_Z * nextUp.se
  return {
    resolved: lo > hi, // #limit's lower bound clears #limit+1's upper bound
    margin: Math.round(inCut.rating - nextUp.rating),
    boundaryLo: inCut.key,
    boundaryHi: nextUp.key,
  }
}

/**
 * What still needs votes to lock this edition's Radar — the input to a targeted
 * curator nudge. Counts under-sampled cards and whether the cut is unresolved.
 */
export function coverageGaps(
  edition: string = currentEdition(),
  limit = 5,
) {
  const ranking = editionStrengthRanking(edition)
  const underSampled = ranking.filter((r) => r.games < MIN_GAMES)
  const cut = cutConfidence(ranking, limit)
  return {
    edition,
    pool: ranking.length,
    underSampled: underSampled.length,
    underSampledKeys: underSampled.map((r) => r.key),
    cutResolved: cut.resolved,
    cutMargin: cut.margin,
    // Something to push curators about if either the boundary is fuzzy or
    // cards are still thin on comparisons.
    needsVotes: !cut.resolved || underSampled.length > 0,
  }
}
