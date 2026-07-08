/**
 * Dev/demo harness (no Telegram needed): `npx tsx src/dev/simulate.ts`.
 *
 * Fabricates a realistic-looking dataset so the dashboard can be understood at
 * a glance BEFORE real curators arrive:
 *   • ~40 curators across all role segments, each with focus-area tags.
 *   • Votes on the CURRENT edition (open for voting) with segment-specific
 *     tastes, so the "who values what" breakdown shows real signal.
 *   • A PAST edition (previous month) fully voted, so "Published Radars" shows
 *     a shipped Radar with click-through provenance.
 *
 * Curator ids are deterministic (900000+i) so re-running updates rows instead
 * of multiplying them. Safe to wipe: these are the only rows with id >= 900000.
 */
import * as repo from '../db/repo.js'
import { updateRatings } from '../ranking/elo.js'
import { globalLeaderboard } from '../ranking/segments.js'
import {
  fitPartWorths,
  type CardFeatures,
  type Vote,
} from '../ranking/partworths.js'
import { fitStrengths } from '../ranking/strength.js'
import { currentEdition } from '../config.js'
import { SAMPLE_CARDS } from '../seed/cards.js'
import { ROLES, FOCUS_AREAS, type Card } from '../types.js'

// ---------------------------------------------------------------------------
// Estimator validation on synthetic ground truth (no DB).
//
// Fabricate cards with KNOWN part-worths, generate pairwise votes straight from
// the Bradley-Terry model, refit, and confirm we recover the truth. This is the
// contract test for ranking/partworths.ts: if the estimator is wrong, this
// prints FAIL before any hand-wavy dashboard interpretation.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function validateEstimator(): boolean {
  const rnd = mulberry32(1234)
  const groups = [
    { key: 'angle', levels: ['a', 'b', 'c', 'd'] },
    { key: 'area', levels: ['x', 'y', 'z'] },
  ]
  // Ground-truth part-worths (already zero-sum per group, as the fit centers to).
  const truth: Record<string, number> = {
    'angle\u0000a': 0.8, 'angle\u0000b': 0.2, 'angle\u0000c': -0.3, 'angle\u0000d': -0.7,
    'area\u0000x': 0.5, 'area\u0000y': 0.0, 'area\u0000z': -0.5,
  }

  // 40 cards, each a random bundle of one angle + one area.
  const feats = new Map<number, CardFeatures>()
  for (let id = 1; id <= 40; id++) {
    feats.set(id, {
      angle: groups[0]!.levels[Math.floor(rnd() * 4)]!,
      area: groups[1]!.levels[Math.floor(rnd() * 3)]!,
    })
  }
  const util = (f: CardFeatures) =>
    truth['angle\u0000' + f.angle]! + truth['area\u0000' + f.area]!
  const sig = (z: number) => 1 / (1 + Math.exp(-z))

  // 8000 synthetic votes sampled from P(A>B)=sigmoid(util_A - util_B).
  const votes: Vote[] = []
  for (let i = 0; i < 8000; i++) {
    let a = 1 + Math.floor(rnd() * 40)
    let b = 1 + Math.floor(rnd() * 40)
    while (b === a) b = 1 + Math.floor(rnd() * 40)
    const aWins = rnd() < sig(util(feats.get(a)!) - util(feats.get(b)!))
    votes.push({ winner_card_id: aWins ? a : b, loser_card_id: aWins ? b : a })
  }

  const fit = fitPartWorths(groups, feats, votes, 0.1)
  let maxErr = 0
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, k = 0
  for (const l of fit.levels) {
    const t = truth[l.group + '\u0000' + l.value]!
    maxErr = Math.max(maxErr, Math.abs(l.beta - t))
    sx += t; sy += l.beta; sxy += t * l.beta; sxx += t * t; syy += l.beta * l.beta; k++
  }
  const r = (k * sxy - sx * sy) / Math.sqrt((k * sxx - sx * sx) * (k * syy - sy * sy))
  const pass = fit.converged && r > 0.98 && maxErr < 0.15
  console.log(
    `[validate] estimator recovery: r=${r.toFixed(4)} maxErr=${maxErr.toFixed(3)} ` +
      `converged=${fit.converged} \u2192 ${pass ? 'PASS \u2705' : 'FAIL \u274c'}`,
  )
  for (const l of fit.levels) {
    const t = truth[l.group + '\u0000' + l.value]!
    console.log(
      `           ${l.group}=${l.value}: true ${t.toFixed(2)}  est ${l.beta.toFixed(2)}` +
        ` \u00b1${(1.96 * l.se).toFixed(2)}`,
    )
  }
  return pass
}

/**
 * Contract test for the confidence-aware card strength (ranking/strength.ts):
 * fabricate cards with KNOWN strengths, sample pairwise votes from the
 * Bradley–Terry model, refit, and confirm (a) we recover the ranking and (b)
 * the SE shrinks for cards with more games than for a deliberately thin one.
 */
function validateStrength(): boolean {
  const rnd = mulberry32(99)
  const N = 24
  // True latent strength in logits, spread across the pool.
  const trueTheta = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * 0.18)
  const sig = (z: number) => 1 / (1 + Math.exp(-z))
  const ids = Array.from({ length: N }, (_, i) => i + 1)
  const votes: { winner_card_id: number; loser_card_id: number }[] = []
  // Card #N (id N) is deliberately starved of games to test the SE signal.
  const thin = N
  for (let i = 0; i < 9000; i++) {
    let a = 1 + Math.floor(rnd() * N)
    let b = 1 + Math.floor(rnd() * N)
    while (b === a) b = 1 + Math.floor(rnd() * N)
    if ((a === thin || b === thin) && rnd() > 0.12) continue // starve the thin card
    const aWins = rnd() < sig(trueTheta[a - 1]! - trueTheta[b - 1]!)
    votes.push({ winner_card_id: aWins ? a : b, loser_card_id: aWins ? b : a })
  }
  const fit = fitStrengths(ids, votes)
  // Spearman-ish: since trueTheta is monotonic in id, check rating increases in id.
  const ratings = ids.map((id) => fit.get(id)!.rating)
  let concordant = 0, pairs = 0
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      pairs++
      if (ratings[j]! > ratings[i]!) concordant++
    }
  const rankAcc = concordant / pairs
  const thinSe = fit.get(thin)!.se
  const medianSe = ids.map((id) => fit.get(id)!.se).sort((a, b) => a - b)[Math.floor(N / 2)]!
  const pass = rankAcc > 0.9 && thinSe > medianSe * 1.5
  console.log(
    `[validate] strength: rankAccuracy=${rankAcc.toFixed(3)} ` +
      `thinSE=${thinSe.toFixed(1)}pts medianSE=${medianSe.toFixed(1)}pts ` +
      `games(thin)=${fit.get(thin)!.games} \u2192 ${pass ? 'PASS \u2705' : 'FAIL \u274c'}`,
  )
  return pass
}

// Run the estimator contract tests up front (pure, no DB writes).
validateEstimator()
validateStrength()

function prevEdition(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 7)
}

// A past edition's candidate cards (last month's Radar).
const PAST_CARDS = [
  ['past-quadratic', 'Can Quadratic Funding Go Mainstream?', 'Kevin Owocki, Ma Earth & Hypercerts on a $1M QF round for public goods.', 'Podcast', 'economies-governance', 'Economies & Governance', 'GreenPill', 'internal'],
  ['past-fvm', 'Programmable storage lands on the FVM', 'A deep dive on smart-contract-controlled storage deals going live.', 'Publication', 'economies-governance', 'Economies & Governance', 'PL R&D', 'internal'],
  ['past-eu-chatcontrol', 'The EU’s “chat control” vote, explained', 'Field signal: a proposed mandate to scan private messages faces a decisive vote.', 'Signal', 'digital-human-rights', 'Digital Human Rights', 'EDRi', 'field'],
  ['past-humanoid', 'Humanoid robots hit the factory floor', 'Field signal: first at-scale deployments and what they reveal about generalist policies.', 'Signal', 'ai-robotics', 'AI & Robotics', 'IEEE Spectrum', 'field'],
  ['past-bci-consent', 'Consent frameworks for implanted BCIs', 'A talk on informed consent when the device writes to the brain, not just reads.', 'Talk', 'neurotech', 'Neurotech', 'PL R&D', 'internal'],
  ['past-zk-id', 'Zero-knowledge identity without the surveillance', 'A post on selective-disclosure credentials for a rights-respecting web.', 'Blog', 'digital-human-rights', 'Digital Human Rights', 'PL R&D', 'internal'],
]

const NAMES = [
  'Ada', 'Bruno', 'Chidi', 'Dara', 'Elif', 'Farah', 'Gio', 'Hana', 'Ivan',
  'Juno', 'Kai', 'Lena', 'Milo', 'Nadia', 'Omar', 'Priya', 'Quinn', 'Rosa',
  'Sami', 'Tariq', 'Uma', 'Vera', 'Wei', 'Xan', 'Yara', 'Zeke', 'Aria',
  'Bo', 'Cleo', 'Deniz', 'Enzo', 'Fauzia', 'Gabe', 'Ines', 'Jonas', 'Keiko',
  'Liam', 'Mara', 'Noor', 'Otto',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

// Segment taste: multiplier a role gives a card (higher = prefers it).
function taste(role: string, c: Card): number {
  let w = 1
  if (role === 'capital' && c.area_slug === 'economies-governance') w *= 2.2
  if (role === 'researcher' && c.type === 'Publication') w *= 2.0
  if (role === 'comms' && c.source_kind === 'field') w *= 1.8
  if (role === 'engineer' && c.area_slug === 'ai-robotics') w *= 1.9
  if (role === 'founder' && c.type === 'Talk') w *= 1.6
  if (role === 'platform' && c.type === 'Blog') w *= 1.5
  return w
}

function runVotes(curatorId: number, role: string, cards: Card[], n: number, edition: string) {
  const roundId = repo.startRound(curatorId, n)
  const live = cards.map((c) => ({ ...c })) // local rating copies
  for (let i = 0; i < n; i++) {
    const a = pick(live)
    let b = pick(live)
    while (b.id === a.id) b = pick(live)
    const wa = taste(role, a)
    const wb = taste(role, b)
    const aWins = Math.random() < wa / (wa + wb)
    const winner = aWins ? a : b
    const loser = aWins ? b : a
    const next = updateRatings(winner.rating, loser.rating)
    repo.recordVote({
      curatorId,
      winnerId: winner.id,
      loserId: loser.id,
      roundId,
      newWinnerRating: next.winner,
      newLoserRating: next.loser,
    })
    winner.rating = next.winner
    loser.rating = next.loser
  }
  repo.completeRound(roundId)
  void edition
}

// --- Seed cards for both editions ---
for (const c of SAMPLE_CARDS) repo.upsertCard({ ...c, edition: currentEdition() })
for (const p of PAST_CARDS) {
  repo.upsertCard({
    key: p[0]!, title: p[1]!, description: p[2]!, href: 'https://plrd.org/',
    type: p[3]!, area_slug: p[4]!, area_label: p[5]!, source: p[6]!,
    source_kind: p[7] as 'internal' | 'field', edition: prevEdition(),
  })
}

const currentCards = repo.getActiveCards()
const pastCards = repo
  .getAllCards()
  .filter((c) => c.edition === prevEdition())

// --- Create ~40 curators and cast votes ---
NAMES.forEach((name, i) => {
  const id = 900000 + i
  const role = ROLES[i % ROLES.length]!.key
  repo.upsertCurator({ id, first_name: name, username: name.toLowerCase() })
  repo.setCuratorRole(id, role)
  // 1–3 focus areas.
  const nFocus = 1 + (i % 3)
  const focus = [...FOCUS_AREAS].sort(() => Math.random() - 0.5).slice(0, nFocus).map((f) => f.slug)
  repo.setFocusAreas(id, focus)
  repo.setCuratorCadence(id, [2, 3, 5, 0][i % 4]!)
  repo.completeOnboarding(id)
  if (i % 7 === 0) repo.setCuratorStatus(id, 'paused')
  repo.touchCurator(id)

  // Most curators voted this month; ~70% also weighed in last month.
  runVotes(id, role, currentCards, 6 + Math.floor(Math.random() * 14), currentEdition())
  if (Math.random() < 0.7 && pastCards.length >= 2) {
    runVotes(id, role, pastCards, 4 + Math.floor(Math.random() * 8), prevEdition())
  }
})

console.log('Simulated', NAMES.length, 'curators.')
console.log('Current edition top:', globalLeaderboard().filter((c) => currentCards.some((cc) => cc.id === c.id)).slice(0, 3).map((c) => c.title))
