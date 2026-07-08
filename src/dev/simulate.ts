/**
 * Dev harness (no Telegram needed): `npx tsx src/dev/simulate.ts`.
 *
 * Fabricates a few curators across segments and casts synthetic votes with
 * segment-specific tastes (e.g. "capital" folks favour governance, researchers
 * favour publications), then prints the global leaderboard and the segment /
 * attribute breakdown. Lets you sanity-check the ranking maths without a bot.
 */
import * as repo from '../db/repo.js'
import { updateRatings } from '../ranking/elo.js'
import {
  globalLeaderboard,
  leaderboardForRole,
  attributeWinRates,
} from '../ranking/segments.js'
import { SAMPLE_CARDS } from '../seed/cards.js'

// Ensure cards exist.
for (const c of SAMPLE_CARDS) repo.upsertCard(c)
const cards = repo.getActiveCards()

// Segment tastes: which attribute a role tends to reward.
const tastes: Record<string, (a: (typeof cards)[number]) => number> = {
  capital: (c) => (c.area_slug === 'economies-governance' ? 2 : 1),
  researcher: (c) => (c.type === 'Publication' ? 2 : 1),
  comms: (c) => (c.source_kind === 'field' ? 1.8 : 1),
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

for (const role of Object.keys(tastes)) {
  for (let curator = 0; curator < 8; curator++) {
    const id = Number(`9${role.length}${curator}${Date.now() % 1000}`)
    repo.upsertCurator({ id, first_name: `${role}-${curator}` })
    repo.setCuratorRole(id, role)
    repo.completeOnboarding(id)
    const roundId = repo.startRound(id, 20)
    for (let i = 0; i < 20; i++) {
      const a = pick(cards)
      let b = pick(cards)
      while (b.id === a.id) b = pick(cards)
      // Weighted coin flip based on this role's taste.
      const wa = tastes[role]!(a)
      const wb = tastes[role]!(b)
      const aWins = Math.random() < wa / (wa + wb)
      const winner = aWins ? a : b
      const loser = aWins ? b : a
      const next = updateRatings(winner.rating, loser.rating)
      repo.recordVote({
        curatorId: id,
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
  }
}

console.log('\n=== GLOBAL LEADERBOARD ===')
for (const c of globalLeaderboard())
  console.log(`  ${Math.round(c.rating)}  ${c.title}`)

console.log('\n=== TOP CARD PER ROLE ===')
for (const role of Object.keys(tastes)) {
  const top = leaderboardForRole(role)[0]
  console.log(`  ${role.padEnd(12)} → ${top?.title}`)
}

console.log('\n=== WIN-RATE BY FOCUS AREA (all curators) ===')
for (const a of attributeWinRates('area_slug'))
  console.log(`  ${a.value.padEnd(22)} ${(a.winRate * 100).toFixed(0)}%`)

console.log('\n=== WIN-RATE BY TYPE, researcher segment ===')
for (const a of attributeWinRates('type', 'researcher'))
  console.log(`  ${a.value.padEnd(14)} ${(a.winRate * 100).toFixed(0)}%`)
