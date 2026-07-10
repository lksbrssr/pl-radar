/**
 * Pairwise part-worths — conditional logit / Bradley-Terry with covariates.
 *
 * WHY (over `attributeWinRates`): a raw win-rate counts how often cards with an
 * attribute value win, *ignoring what they were up against*. Because a card's
 * topic, angle and format are correlated (e.g. "field" signals are often
 * "early-signal" angle), those marginal rates are confounded — you can't tell
 * whether "field" wins because it's field or because it tends to carry a
 * compelling angle. They're also near-symmetric by construction (every win is
 * someone else's loss).
 *
 * The fix uses the one thing a marginal rate throws away: each vote is a *choice
 * between two fully-known attribute bundles*. We model
 *
 *     P(A beats B) = sigmoid( Σ_k β_k · (x_{A,k} − x_{B,k}) )
 *
 * where x is a one-hot encoding over angle / focus area / content type /
 * source-kind. Fitting β by penalized maximum likelihood (Bradley-Terry with
 * covariates == conditional logit on the attribute *differences*) gives the
 * independent "pull" of each attribute value, holding the others constant — a
 * lightweight conjoint / part-worth analysis.
 *
 * Implementation notes:
 *  • Hand-rolled Newton–Raphson (IRLS); no new dependencies.
 *  • L2 ridge (λ) keeps the fit identifiable. In a difference design each
 *    categorical group is collinear (the group's dummies always sum to zero in
 *    x_A − x_B), so only *contrasts within a group* are identified. Ridge picks
 *    the minimum-norm solution; we then re-center each group to sum to zero, so
 *    a part-worth reads as "pull relative to this group's average level."
 *  • Ridge also tames separation (a level that always wins) — its estimate is
 *    shrunk and its CI stays finite — which matters for the honesty layer.
 *  • Covariance ≈ inverse penalized Hessian; standard errors + 95% CIs come
 *    from its diagonal (after the same centering transform). Every level also
 *    reports n (the comparisons it appeared in); below PARTWORTH_MIN_N we flag
 *    it low-confidence so the UI can gray it out.
 */
import db from '../db/index.js'
import { ANGLES, FOCUS_AREAS, ROLES } from '../types.js'
import { votesForProfile, votesForCurator, type Profile } from './segments.js'

/** Below this many informing comparisons, an estimate is flagged low-confidence. */
export const PARTWORTH_MIN_N = 30
/** Ridge strength (penalty λ·‖β‖²). Light relative to a few hundred votes. */
const RIDGE_LAMBDA = 1.0
/** 95% CI multiplier. */
const Z95 = 1.959964

export type Vote = { winner_card_id: number; loser_card_id: number }
/** A card's attribute values, keyed by group ('angle' | 'area' | 'type' | 'source_kind'). */
export type CardFeatures = Record<string, string>
export type GroupSpec = { key: string; levels: string[] }

export type PartWorth = {
  group: string
  value: string
  /** Centered part-worth in log-odds; 0 = this group's average level. */
  beta: number
  se: number
  ciLo: number
  ciHi: number
  /** Comparisons this level appeared in (either side). */
  n: number
  /** True when n < PARTWORTH_MIN_N (estimate is unreliable). */
  gated: boolean
}

export type FitResult = {
  nVotes: number
  converged: boolean
  levels: PartWorth[]
  byGroup: Record<string, PartWorth[]>
}

// ---------------------------------------------------------------------------
// Tiny linear algebra (dense, K ≈ 18 — correctness over speed)
// ---------------------------------------------------------------------------

/** Solve A x = b for symmetric positive-definite A (Gaussian elimination). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]!])
  for (let col = 0; col < n; col++) {
    // partial pivot
    let piv = col
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r
    ;[M[col], M[piv]] = [M[piv]!, M[col]!]
    const d = M[col]![col]! || 1e-12
    for (let j = col; j <= n; j++) M[col]![j]! /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r]![col]!
      if (f === 0) continue
      for (let j = col; j <= n; j++) M[r]![j]! -= f * M[col]![j]!
    }
  }
  return M.map((row) => row[n]!)
}

/** Invert A (SPD) by solving against each unit column. */
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

// ---------------------------------------------------------------------------
// Core estimator (pure — no DB; unit-testable / validatable on synthetic data)
// ---------------------------------------------------------------------------

/**
 * Fit part-worths from pairwise comparisons. `cardFeatures` maps a card id to
 * its attribute values; `votes` are (winner, loser) pairs. Returns per-level
 * centered part-worths with standard errors, 95% CIs and sample counts.
 */
export function fitPartWorths(
  groups: GroupSpec[],
  cardFeatures: Map<number, CardFeatures>,
  votes: Vote[],
  lambda: number = RIDGE_LAMBDA,
): FitResult {
  // Column layout: one column per (group, level).
  const cols: { group: string; value: string }[] = []
  const index = new Map<string, number>()
  const groupCols: Record<string, number[]> = {}
  for (const g of groups) {
    groupCols[g.key] = []
    for (const v of g.levels) {
      const key = g.key + '\u0000' + v
      index.set(key, cols.length)
      groupCols[g.key]!.push(cols.length)
      cols.push({ group: g.key, value: v })
    }
  }
  const K = cols.length
  const empty: FitResult = { nVotes: votes.length, converged: false, levels: [], byGroup: {} }
  if (K === 0) return empty

  // Difference design rows d = x_winner − x_loser, plus per-level appearances.
  const rows: number[][] = []
  const appear = new Array<number>(K).fill(0)
  for (const vote of votes) {
    const fw = cardFeatures.get(vote.winner_card_id)
    const fl = cardFeatures.get(vote.loser_card_id)
    if (!fw || !fl) continue
    const d = new Array<number>(K).fill(0)
    for (const g of groups) {
      const wv = fw[g.key]
      const lv = fl[g.key]
      if (wv != null) {
        const ci = index.get(g.key + '\u0000' + wv)
        if (ci != null) { d[ci]! += 1; appear[ci]! += 1 }
      }
      if (lv != null) {
        const ci = index.get(g.key + '\u0000' + lv)
        if (ci != null) { d[ci]! -= 1; appear[ci]! += 1 }
      }
    }
    rows.push(d)
  }
  if (rows.length === 0) return empty

  // Newton–Raphson on penalized log-likelihood (all labels = 1: the winner was
  // chosen). g = Σ(1−p)d − 2λβ ; H = Σ p(1−p) d dᵀ + 2λI (SPD).
  let beta = new Array<number>(K).fill(0)
  let converged = false
  let H: number[][] = []
  for (let it = 0; it < 60; it++) {
    const grad = new Array<number>(K).fill(0)
    H = Array.from({ length: K }, () => new Array<number>(K).fill(0))
    for (const d of rows) {
      let z = 0
      for (let k = 0; k < K; k++) z += beta[k]! * d[k]!
      const p = sigmoid(z)
      const w = p * (1 - p)
      const r = 1 - p
      // only iterate non-zero entries of the sparse diff vector
      const nz: number[] = []
      for (let k = 0; k < K; k++) if (d[k] !== 0) nz.push(k)
      for (const k of nz) {
        grad[k]! += r * d[k]!
        for (const j of nz) H[k]![j]! += w * d[k]! * d[j]!
      }
    }
    for (let k = 0; k < K; k++) {
      grad[k]! -= 2 * lambda * beta[k]!
      H[k]![k]! += 2 * lambda
    }
    const step = solve(H, grad)
    let maxStep = 0
    for (let k = 0; k < K; k++) {
      beta[k]! += step[k]!
      maxStep = Math.max(maxStep, Math.abs(step[k]!))
    }
    if (maxStep < 1e-9) { converged = true; break }
  }

  // Covariance ≈ H⁻¹ at the optimum.
  const cov = invert(H)

  // Center each group to sum-zero via C = block(I − 11ᵀ/m); transform β and cov.
  const C: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (_, j) => (i === j ? 1 : 0)),
  )
  for (const key of Object.keys(groupCols)) {
    const idx = groupCols[key]!
    const m = idx.length
    for (const i of idx) for (const j of idx) C[i]![j]! -= 1 / m
  }
  const betaC = C.map((row) => row.reduce((s, cij, j) => s + cij * beta[j]!, 0))
  // cov_c = C cov Cᵀ ; we only need its diagonal for SEs.
  const covC_diag = new Array<number>(K).fill(0)
  for (let i = 0; i < K; i++) {
    // row_i = C_i · cov  (length K)
    const row = new Array<number>(K).fill(0)
    for (let a = 0; a < K; a++) {
      const cia = C[i]![a]!
      if (cia === 0) continue
      for (let b = 0; b < K; b++) row[b]! += cia * cov[a]![b]!
    }
    let d = 0
    for (let b = 0; b < K; b++) d += row[b]! * C[i]![b]!
    covC_diag[i] = d
  }

  const levels: PartWorth[] = cols.map((c, k) => {
    const se = Math.sqrt(Math.max(covC_diag[k]!, 0))
    const b = betaC[k]!
    const n = appear[k]!
    return {
      group: c.group,
      value: c.value,
      beta: b,
      se,
      ciLo: b - Z95 * se,
      ciHi: b + Z95 * se,
      n,
      gated: n < PARTWORTH_MIN_N,
    }
  })

  const byGroup: Record<string, PartWorth[]> = {}
  for (const g of groups)
    byGroup[g.key] = levels
      .filter((l) => l.group === g.key)
      .sort((a, b) => b.beta - a.beta)

  return { nVotes: rows.length, converged, levels, byGroup }
}

// ---------------------------------------------------------------------------
// DB-backed wrappers
// ---------------------------------------------------------------------------

const GROUP_KEYS = ['angle', 'area', 'type', 'source_kind'] as const

/** Card attribute values by id (angle pulled from the card_attributes EAV table). */
export function cardFeatureMap(): Map<number, CardFeatures> {
  const rows = db
    .prepare(
      `SELECT c.id, c.area_slug, c.type, c.source_kind,
              (SELECT a.attr_value FROM card_attributes a
               WHERE a.card_id = c.id AND a.attr_key = 'angle' LIMIT 1) AS angle
       FROM cards c`,
    )
    .all() as {
    id: number
    area_slug: string
    type: string
    source_kind: string
    angle: string | null
  }[]
  const m = new Map<number, CardFeatures>()
  for (const r of rows) {
    const f: CardFeatures = { area: r.area_slug, type: r.type, source_kind: r.source_kind }
    if (r.angle) f.angle = r.angle
    m.set(r.id, f)
  }
  return m
}

/** Build the feature groups actually present in a vote set (≥2 levels to matter). */
function groupsFor(votes: Vote[], feats: Map<number, CardFeatures>): GroupSpec[] {
  const seen: Record<string, Set<string>> = {
    angle: new Set(), area: new Set(), type: new Set(), source_kind: new Set(),
  }
  for (const v of votes) {
    for (const id of [v.winner_card_id, v.loser_card_id]) {
      const f = feats.get(id)
      if (!f) continue
      for (const k of GROUP_KEYS) if (f[k]) seen[k]!.add(f[k]!)
    }
  }
  const angleOrder = ANGLES.map((a) => a.key)
  const areaOrder = FOCUS_AREAS.map((a) => a.slug)
  return [
    { key: 'angle', levels: angleOrder.filter((x) => seen.angle!.has(x)) },
    { key: 'area', levels: areaOrder.filter((x) => seen.area!.has(x)) },
    { key: 'type', levels: [...seen.type!].sort() },
    { key: 'source_kind', levels: [...seen.source_kind!].sort() },
  ].filter((g) => g.levels.length >= 2)
}

/** Fit part-worths for a curator profile ({} = the General baseline). */
export function partWorthsForProfile(
  p: Profile,
  feats: Map<number, CardFeatures> = cardFeatureMap(),
  edition?: string,
): FitResult {
  const votes = votesForProfile(p, edition)
  return fitPartWorths(groupsFor(votes, feats), feats, votes)
}

export function globalPartWorths(
  feats?: Map<number, CardFeatures>,
  edition?: string,
): FitResult {
  return partWorthsForProfile({}, feats, edition)
}

/** Part-worths fit on a SINGLE curator's votes (admin per-curator lens). Often
 *  thin, so the same PARTWORTH_MIN_N gating applies and the UI shows a caveat. */
export function partWorthsForCurator(
  curatorId: number,
  feats: Map<number, CardFeatures> = cardFeatureMap(),
): FitResult {
  const votes = votesForCurator(curatorId)
  return fitPartWorths(groupsFor(votes, feats), feats, votes)
}

// ---------------------------------------------------------------------------
// View 2 — deviation from baseline
// ---------------------------------------------------------------------------

export type Deviation = {
  group: string
  value: string
  /** Segment part-worth minus the all-curator baseline. */
  deviation: number
  segBeta: number
  baseBeta: number
  se: number
  ciLo: number
  ciHi: number
  z: number
  n: number
  gated: boolean
}

/**
 * A segment's part-worths minus the all-curator average, ranked by |deviation|.
 * Suppresses the obvious (what everyone likes) and surfaces the segment's own
 * tilt — "capital penalizes hype", "comms over-reward clarity". Gated when
 * either the segment or the baseline lacks samples for that level.
 */
export function computeDeviations(seg: FitResult, base: FitResult): Deviation[] {
  const baseMap = new Map(base.levels.map((l) => [l.group + '\u0000' + l.value, l]))
  const out: Deviation[] = []
  for (const s of seg.levels) {
    const b = baseMap.get(s.group + '\u0000' + s.value)
    if (!b) continue
    const deviation = s.beta - b.beta
    const se = Math.sqrt(s.se * s.se + b.se * b.se)
    const z = se > 0 ? deviation / se : 0
    out.push({
      group: s.group,
      value: s.value,
      deviation,
      segBeta: s.beta,
      baseBeta: b.beta,
      se,
      ciLo: deviation - Z95 * se,
      ciHi: deviation + Z95 * se,
      z,
      n: Math.min(s.n, b.n),
      gated: s.n < PARTWORTH_MIN_N || b.n < PARTWORTH_MIN_N,
    })
  }
  return out.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
}

// ---------------------------------------------------------------------------
// View 3 — consensus vs contested
// ---------------------------------------------------------------------------

export type RoleFit = { role: string; fit: FitResult }

export type CardDispersion = {
  id: number
  key: string
  title: string
  area_slug: string
  angle: string | null
  /** Mean predicted utility across segments (log-odds, relative). */
  mean: number
  /** Std-dev of predicted utility across segments — the "contestedness". */
  sd: number
  segments: number
}

/** Predicted utility of a card under a fit = Σ centered part-worths of its levels. */
function utility(fit: FitResult, f: CardFeatures): number {
  let u = 0
  for (const key of GROUP_KEYS) {
    const v = f[key]
    if (!v) continue
    const lvl = fit.byGroup[key]?.find((l) => l.value === v)
    if (lvl) u += lvl.beta
  }
  return u
}

/**
 * How much a card's appeal depends on WHO is looking. For each current-edition
 * card we predict its utility under every segment with enough votes, then take
 * the spread (std-dev) across segments:
 *   • low spread  → a safe general pick (everyone agrees).
 *   • high spread → a lens-specific pick (feeds the composite-lens feature).
 * Uses part-worth utilities (smoother than per-segment Elo on small samples).
 */
export function consensusContested(
  roleFits?: RoleFit[],
  feats: Map<number, CardFeatures> = cardFeatureMap(),
  minVotes = PARTWORTH_MIN_N,
  edition?: string,
): { segments: number; cards: CardDispersion[] } {
  const fits = (roleFits ?? ROLES.map((r) => ({ role: r.key, fit: partWorthsForProfile({ role: r.key }, feats, edition) })))
    .filter((rf) => rf.fit.nVotes >= minVotes)
  if (fits.length < 2) return { segments: fits.length, cards: [] }

  const cards = db
    .prepare(
      `SELECT c.id, c.key, c.title, c.area_slug,
              (SELECT a.attr_value FROM card_attributes a
               WHERE a.card_id = c.id AND a.attr_key = 'angle' LIMIT 1) AS angle
       FROM cards c WHERE c.active = 1${edition ? ' AND c.edition = ?' : ''}`,
    )
    .all(...(edition ? [edition] : [])) as {
    id: number; key: string; title: string; area_slug: string; angle: string | null
  }[]

  const out: CardDispersion[] = cards.map((c) => {
    const f = feats.get(c.id) ?? {}
    const us = fits.map((rf) => utility(rf.fit, f))
    const mean = us.reduce((s, u) => s + u, 0) / us.length
    const variance = us.reduce((s, u) => s + (u - mean) ** 2, 0) / (us.length - 1)
    return {
      id: c.id, key: c.key, title: c.title, area_slug: c.area_slug, angle: c.angle,
      mean, sd: Math.sqrt(Math.max(variance, 0)), segments: fits.length,
    }
  })
  out.sort((a, b) => b.sd - a.sd)
  return { segments: fits.length, cards: out }
}

// ---------------------------------------------------------------------------
// View 4 — supply / demand gap
// ---------------------------------------------------------------------------

export type SupplyDemand = {
  group: string
  value: string
  /** Share of the current-edition pool carrying this level (per-group, sums≈1). */
  supplyShare: number
  /** If supply were even across the group's levels. */
  expectedShare: number
  /** Demand = the global part-worth for this level (how much the crowd rewards it). */
  demand: number
  demandSe: number
  n: number
  gated: boolean
}

/**
 * Where the crowd's demand (part-worths) outruns the pool's supply (attribute
 * composition). "The crowd rewards external-field proof cards, but they're 8%
 * of the pool" → a concrete sourcing instruction. Compares each level's pool
 * share against its global part-worth.
 */
export function supplyDemandGap(
  baseline?: FitResult,
  feats: Map<number, CardFeatures> = cardFeatureMap(),
  edition?: string,
): SupplyDemand[] {
  const base = baseline ?? globalPartWorths(feats, edition)
  const pool = db
    .prepare(`SELECT id FROM cards WHERE active = 1${edition ? ' AND edition = ?' : ''}`)
    .all(...(edition ? [edition] : [])) as { id: number }[]
  const total = pool.length || 1

  // Pool composition per (group, value).
  const counts = new Map<string, number>()
  for (const { id } of pool) {
    const f = feats.get(id)
    if (!f) continue
    for (const key of GROUP_KEYS) {
      const v = f[key]
      if (!v) continue
      const k = key + '\u0000' + v
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  const levelsPerGroup: Record<string, number> = {}
  for (const l of base.levels) levelsPerGroup[l.group] = (levelsPerGroup[l.group] ?? 0) + 1

  return base.levels
    .map((l) => {
      const cnt = counts.get(l.group + '\u0000' + l.value) ?? 0
      return {
        group: l.group,
        value: l.value,
        supplyShare: cnt / total,
        expectedShare: 1 / (levelsPerGroup[l.group] ?? 1),
        demand: l.beta,
        demandSe: l.se,
        n: l.n,
        gated: l.gated,
      }
    })
    // biggest opportunities first: highly-demanded but under-supplied.
    .sort((a, b) => b.demand - b.supplyShare - (a.demand - a.supplyShare))
}
