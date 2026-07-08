/**
 * Ingestion runner: `npm run ingest [-- flags]`.
 *
 * Fetches every registered source, filters to recent items, and upserts them
 * into the current edition's candidate pool (idempotent by card key, so it's
 * safe to run repeatedly — e.g. on a daily cron).
 *
 * Flags:
 *   --dry               Show what would be ingested; write nothing.
 *   --source=<key>      Only run one source (e.g. --source=plrd-insights).
 *   --since-days=<n>    Only items published within N days (default 60; 0 = all).
 *
 * Design note: this writes cards via the existing repo.upsertCard, using only
 * columns that already exist — no schema changes — so it composes cleanly with
 * other work (e.g. card tags) happening in parallel.
 */
import { SOURCES } from './sources/index.js'
import type { Candidate } from './types.js'
import { upsertCard, getActiveCards } from '../db/repo.js'
import { currentEdition } from '../config.js'

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  const eq = hit.indexOf('=')
  return eq === -1 ? '' : hit.slice(eq + 1)
}

const DRY = flag('dry') !== undefined
const ONLY = flag('source')
const sinceDays = flag('since-days') !== undefined ? Number(flag('since-days')) : 60

function isRecent(c: Candidate): boolean {
  if (sinceDays === 0 || !c.publishedAt) return true
  const ageDays = (Date.now() - new Date(c.publishedAt).getTime()) / 86_400_000
  return ageDays <= sinceDays
}

async function main() {
  const edition = currentEdition()
  const sources = SOURCES.filter((s) => !ONLY || s.key === ONLY)
  if (!sources.length) {
    console.error(ONLY ? `No source "${ONLY}".` : 'No sources registered.')
    process.exit(1)
  }

  console.log(
    `Ingesting ${sources.length} source(s) into edition ${edition}` +
      (DRY ? ' [DRY RUN]' : '') +
      (sinceDays ? ` · last ${sinceDays}d` : ' · all time'),
  )

  let total = 0
  for (const source of sources) {
    process.stdout.write(`\n• ${source.name} (${source.key})… `)
    let candidates: Candidate[]
    try {
      candidates = await source.fetch()
    } catch (err) {
      console.log(`FAILED: ${String(err)}`)
      continue
    }
    const fresh = candidates.filter(isRecent)
    console.log(`${candidates.length} found, ${fresh.length} recent`)

    for (const c of fresh) {
      console.log(`    [${c.type}·${c.areaSlug}] ${c.title.slice(0, 70)}`)
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
      total++
    }
  }

  console.log(
    `\n${DRY ? 'Would ingest' : 'Ingested'} ${total} card(s). ` +
      `Pool now: ${DRY ? '(dry run)' : getActiveCards().length} active in ${edition}.`,
  )
}

main().catch((err) => {
  console.error('ingest fatal:', err)
  process.exit(1)
})
