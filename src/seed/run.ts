/** `npm run seed` — load the sample cards into the DB (idempotent by key). */
import { upsertCard } from '../db/repo.js'
import { SAMPLE_CARDS } from './cards.js'

let n = 0
for (const card of SAMPLE_CARDS) {
  upsertCard(card)
  n++
}
console.log(`Seeded ${n} cards.`)
