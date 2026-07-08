/**
 * Runnable dedup check (no formal test runner in this repo).
 *
 *   DATABASE_PATH=/tmp/dedup.sqlite npx tsx src/dev/checkDedup.ts
 *
 * Fabricates the "same YouTube video, two sources, different title/url" case and
 * asserts acceptance criteria 1 & 2: one content, one card, two provenances, the
 * card links to the primary (plrd) URL, and re-ingest is idempotent.
 *
 * Uses a throwaway DB file (removed on start) so it never touches real data.
 */
import { rmSync } from 'node:fs'

const DB = process.env.DATABASE_PATH ?? `/tmp/plrd-dedup-check-${Date.now()}.sqlite`
process.env.DATABASE_PATH = DB
for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(DB + suffix)
  } catch {
    /* fresh file */
  }
}

// Import after DATABASE_PATH is set so the connection opens on the throwaway DB.
const { contentIdentity } = await import('../ingest/identity.js')
const repo = await import('../db/repo.js')
const { upsertContent, upsertCardForContent } = repo
const db = (await import('../db/index.js')).default

let failures = 0
function assert(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS ✅' : 'FAIL ❌'}  ${msg}`)
  if (!cond) failures++
}

const VIDEO = 'ABCDEFGHIJK' // 11 chars
const thumb = `https://i.ytimg.com/vi/${VIDEO}/maxresdefault.jpg`

// Same talk, two sources, different url + title + description length.
const plrd = {
  sourceKey: 'plrd-insights',
  href: 'https://www.plrd.org/talks/foo-bar/',
  image: thumb,
  title: 'Foo Bar — The Complete, Canonical Title',
  description: 'A thorough description from the primary publisher, clearly longer.',
  areaSlug: 'neurotech',
  areaLabel: 'Neurotech',
  type: 'Podcast',
  source: 'PL R&D',
  sourceKind: 'internal' as const,
  edition: '2026-06',
}
const plneuro = {
  sourceKey: 'plneuro',
  href: 'https://plneuro.xyz/foo-bar-cross-post/',
  image: thumb,
  title: 'Foo Bar (short)',
  description: 'Short blurb.',
  areaSlug: 'neurotech',
  areaLabel: 'Neurotech',
  type: 'Talk',
  source: 'PL Neuro',
  sourceKind: 'internal' as const,
  edition: '2026-06',
}

function ingest(c: typeof plrd, key: string) {
  const idn = contentIdentity(c)
  const cid = upsertContent({
    identityKey: idn.key,
    identityKind: idn.kind,
    sourceKey: c.sourceKey,
    title: c.title,
    url: c.href,
    description: c.description,
    image: c.image,
    areaSlug: c.areaSlug,
    areaLabel: c.areaLabel,
    type: c.type,
    source: c.source,
    sourceKind: c.sourceKind,
    edition: c.edition,
  })
  return upsertCardForContent(cid, key)
}

// Both resolve to the same YouTube identity.
assert(contentIdentity(plrd).key === `yt:${VIDEO}`, 'plrd resolves to yt identity')
assert(contentIdentity(plneuro).key === contentIdentity(plrd).key, 'both sources share one identity')

// Ingest primary then cross-post.
const r1 = ingest(plrd, 'plrd-foo-bar')
const r2 = ingest(plneuro, 'plneuro-foo-bar-cross-post')

const contentCount = (db.prepare('SELECT COUNT(*) n FROM content').get() as { n: number }).n
const cardCount = (db.prepare('SELECT COUNT(*) n FROM cards').get() as { n: number }).n
const provCount = (db.prepare('SELECT COUNT(*) n FROM content_sources').get() as { n: number }).n
const card = db.prepare('SELECT key, href, description FROM cards LIMIT 1').get() as {
  key: string; href: string; description: string
}

console.log('---')
assert(r1.created === true, 'first source creates a card')
assert(r2.created === false, 'cross-post does NOT create a second card')
assert(contentCount === 1, `exactly one content (got ${contentCount})`)
assert(cardCount === 1, `exactly one card (got ${cardCount})`)
assert(provCount === 2, `two source provenances (got ${provCount})`)
assert(card.href === plrd.href, 'card.href = primary (plrd) canonical url')
assert(card.description === plrd.description, 'description = longest (primary) blurb')

// Idempotency: re-ingest both, pool must not grow.
ingest(plrd, 'plrd-foo-bar')
ingest(plneuro, 'plneuro-foo-bar-cross-post')
const cardCount2 = (db.prepare('SELECT COUNT(*) n FROM cards').get() as { n: number }).n
const provCount2 = (db.prepare('SELECT COUNT(*) n FROM content_sources').get() as { n: number }).n
assert(cardCount2 === 1, `re-ingest adds no card (got ${cardCount2})`)
assert(provCount2 === 2, `re-ingest adds no provenance (got ${provCount2})`)

// ---------------------------------------------------------------------------
// Scenario 2: self-heal a legacy cross-post that entered under a URL identity
// BEFORE its YouTube id was known — and preserve its votes on merge.
// ---------------------------------------------------------------------------
console.log('\n--- self-heal + vote migration ---')

const VIDEO2 = 'KLMNOPQRSTU'
const thumb2 = `https://i.ytimg.com/vi/${VIDEO2}/maxresdefault.jpg`
const primaryHref = 'https://www.plrd.org/talks/baz-qux/'
const crossHref = 'https://plneuro.xyz/baz-qux-recap/'

// Primary (plrd) with the YouTube identity → creates the surviving card.
const primaryCid = upsertContent({
  identityKey: `yt:${VIDEO2}`, identityKind: 'youtube', sourceKey: 'plrd-insights',
  title: 'Baz Qux — Primary', url: primaryHref, description: 'primary', image: thumb2,
  areaSlug: 'neurotech', areaLabel: 'Neurotech', type: 'Podcast', source: 'PL R&D',
  sourceKind: 'internal', edition: '2026-06',
})
const primaryCard = upsertCardForContent(primaryCid, 'plrd-baz-qux').cardId

// Legacy cross-post: entered under a URL identity (no video id known yet).
const legacyIdentity = contentIdentity({ href: crossHref, image: null }) // url:plneuro.xyz/baz-qux-recap
const legacyCid = upsertContent({
  identityKey: legacyIdentity.key, identityKind: 'url', sourceKey: 'plneuro',
  title: 'Baz Qux (recap)', url: crossHref, description: 'recap', image: null,
  areaSlug: 'neurotech', areaLabel: 'Neurotech', type: 'Talk', source: 'PL Neuro',
  sourceKind: 'internal', edition: '2026-06',
})
const legacyCard = upsertCardForContent(legacyCid, 'plneuro-baz-qux-recap').cardId

// A third, unrelated card so the vote is between DISTINCT assets (a vote of the
// legacy card against its own twin would legitimately vanish as a self-match).
const thirdCid = upsertContent({
  identityKey: 'url:example.com/other', identityKind: 'url', sourceKey: 'plrd-insights',
  title: 'Unrelated', url: 'https://example.com/other', description: 'other', image: null,
  areaSlug: 'ai-robotics', areaLabel: 'AI & Robotics', type: 'Blog', source: 'PL R&D',
  sourceKind: 'internal', edition: '2026-06',
})
const thirdCard = upsertCardForContent(thirdCid, 'plrd-other').cardId

// Cast a vote on the legacy card (vs the third) so we can prove it survives.
const curatorId = repo.registerWebCurator({ token: 'heal-check-token-123', role: 'researcher' })
repo.recordVote({
  curatorId, winnerId: legacyCard, loserId: thirdCard, roundId: null,
  newWinnerRating: 1510, newLoserRating: 1490,
})
const votesBefore = (db.prepare('SELECT COUNT(*) n FROM votes').get() as { n: number }).n
assert(votesBefore === 1, 'one vote recorded on the legacy card')
assert((db.prepare('SELECT COUNT(*) n FROM cards').get() as { n: number }).n === 4, 'four cards before heal')

// Re-ingest the cross-post, now WITH the YouTube thumbnail → identity yt:VIDEO2.
// upsertContent should detect the stale url:baz content and merge it in.
const healId = upsertContent({
  identityKey: `yt:${VIDEO2}`, identityKind: 'youtube', sourceKey: 'plneuro',
  title: 'Baz Qux (recap)', url: crossHref, description: 'recap', image: thumb2,
  areaSlug: 'neurotech', areaLabel: 'Neurotech', type: 'Talk', source: 'PL Neuro',
  sourceKind: 'internal', edition: '2026-06',
})
upsertCardForContent(healId, 'plneuro-baz-qux-recap')

assert(healId === primaryCid, 'cross-post resolves to the primary content')
assert(db.prepare('SELECT id FROM cards WHERE id = ?').get(legacyCard) === undefined, 'legacy card removed')
assert((db.prepare('SELECT COUNT(*) n FROM cards').get() as { n: number }).n === 3, 'legacy card gone (3 cards after heal)')
assert((db.prepare('SELECT id FROM content WHERE identity_key = ?').get(legacyIdentity.key)) === undefined, 'stale url content deleted')
const votesAfter = (db.prepare('SELECT COUNT(*) n FROM votes').get() as { n: number }).n
assert(votesAfter === 1, 'vote preserved through the merge')
const migrated = db.prepare('SELECT winner_card_id FROM votes LIMIT 1').get() as { winner_card_id: number }
assert(migrated.winner_card_id === primaryCard, 'vote migrated onto the surviving card')
const provs = (db.prepare('SELECT COUNT(*) n FROM content_sources WHERE content_id = ?').get(primaryCid) as { n: number }).n
assert(provs === 2, `merged content keeps both provenances (got ${provs})`)

console.log('---')
if (failures) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll dedup checks passed ✅')
