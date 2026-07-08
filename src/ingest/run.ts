/**
 * Ingestion runner: `npm run ingest [-- flags]`.
 *
 * Fetches every registered source and upserts its candidates into the edition
 * (YYYY-MM) matching each item's *publication month* — so a talk published in
 * June lands in the June Radar, a July post in July, etc. Ingestion is
 * idempotent (upsert by card key), so it's safe to run repeatedly / on a cron.
 *
 * By default we only ingest a fixed allowlist of editions (June & July 2026);
 * older content is out of scope for the Radar. Override with --editions.
 *
 * Flags:
 *   --dry                     Show what would be ingested; write nothing.
 *   --source=<key>            Only run one source (e.g. --source=plrd-insights).
 *   --editions=<m1,m2,...>    Editions to accept, as YYYY-MM (default 2026-06,2026-07).
 *                             Pass --editions=all to ingest every month.
 *
 * Items with no publication date can't be placed in a month, so they're skipped
 * (reported as "undated").
 */
import { SOURCES } from './sources/index.js'
import type { Candidate } from './types.js'
import { upsertCard, getActiveCards } from '../db/repo.js'

/** Editions we ingest by default. June & July 2026 for the initial rollout. */
const DEFAULT_EDITIONS = ['2026-06', '2026-07']

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  const eq = hit.indexOf('=')
  return eq === -1 ? '' : hit.slice(eq + 1)
}

const DRY = flag('dry') !== undefined
const ONLY = flag('source')
const editionsFlag = flag('editions')
const ALL_EDITIONS = editionsFlag === 'all'
const ALLOWED = new Set(
  editionsFlag && !ALL_EDITIONS
    ? editionsFlag.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_EDITIONS,
)

/** The edition (YYYY-MM) an item belongs to, from its publication date. */
function editionOf(c: Candidate): string | undefined {
  if (!c.publishedAt) return undefined
  const d = new Date(c.publishedAt)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 7)
}

async function main() {
  const sources = SOURCES.filter((s) => !ONLY || s.key === ONLY)
  if (!sources.length) {
    console.error(ONLY ? `No source "${ONLY}".` : 'No sources registered.')
    process.exit(1)
  }

  const scope = ALL_EDITIONS ? 'all editions' : `editions ${[...ALLOWED].join(', ')}`
  console.log(
    `Ingesting ${sources.length} source(s) → ${scope}` + (DRY ? ' [DRY RUN]' : ''),
  )

  let total = 0
  let skippedEdition = 0
  let undated = 0
  const perEdition = new Map<string, number>()

  for (const source of sources) {
    process.stdout.write(`\n• ${source.name} (${source.key})… `)
    let candidates: Candidate[]
    try {
      candidates = await source.fetch()
    } catch (err) {
      console.log(`FAILED: ${String(err)}`)
      continue
    }

    const kept: { c: Candidate; edition: string }[] = []
    for (const c of candidates) {
      const edition = editionOf(c)
      if (!edition) {
        undated++
        continue
      }
      if (!ALL_EDITIONS && !ALLOWED.has(edition)) {
        skippedEdition++
        continue
      }
      kept.push({ c, edition })
    }
    console.log(`${candidates.length} found, ${kept.length} in scope`)

    for (const { c, edition } of kept) {
      const img = c.image ? ' 🖼' : ''
      console.log(`    ${edition} [${c.type}·${c.areaSlug}]${img} ${c.title.slice(0, 66)}`)
      if (!DRY) {
        upsertCard({
          key: c.key,
          title: c.title,
          description: c.description ?? null,
          href: c.href,
          source: c.source,
          source_kind: c.sourceKind,
          type: c.type,
          area_slug: c.areaSlug,
          area_label: c.areaLabel,
          edition,
          image: c.image ?? null,
          external: c.sourceKind === 'field',
        })
      }
      perEdition.set(edition, (perEdition.get(edition) ?? 0) + 1)
      total++
    }
  }

  const byEdition = [...perEdition.entries()]
    .sort()
    .map(([e, n]) => `${e}: ${n}`)
    .join(', ')
  console.log(
    `\n${DRY ? 'Would ingest' : 'Ingested'} ${total} card(s)` +
      (byEdition ? ` (${byEdition})` : '') +
      `. Skipped ${skippedEdition} out-of-scope, ${undated} undated.` +
      (DRY ? '' : ` Pool now: ${getActiveCards().length} active (current edition).`),
  )
}

main().catch((err) => {
  console.error('ingest fatal:', err)
  process.exit(1)
})
