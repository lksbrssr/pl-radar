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
import { currentEdition } from '../config.js'
import { SAMPLE_CARDS } from '../seed/cards.js'
import { ROLES, FOCUS_AREAS, type Card } from '../types.js'

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
