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
const { upsertContent, upsertCardForContent } = await import('../db/repo.js')
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

console.log('---')
if (failures) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll dedup checks passed ✅')
