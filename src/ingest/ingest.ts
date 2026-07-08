/**
 * Ingestion core — fetch every registered source and upsert its candidates into
 * the edition (YYYY-MM) matching each item's publication month, deduplicating
 * cross-posts via the content layer (see identity.ts + db/repo.ts).
 *
 * This is the callable engine behind both the CLI (`npm run ingest`, see run.ts)
 * and the scheduled background ingest (see scheduler.ts). It is idempotent and
 * self-healing: re-running merges any cross-post that entered before its stronger
 * identity was known.
 */
import { SOURCES } from './sources/index.js'
import type { Candidate } from './types.js'
import { upsertContent, upsertCardForContent, getActiveCards } from '../db/repo.js'
import { contentIdentity } from './identity.js'
import { sanitizeText } from './util.js'

/** Editions ingested by default. June & July 2026 for the initial rollout. */
export const DEFAULT_EDITIONS = ['2026-06', '2026-07']

export type IngestOptions = {
  /** Editions (YYYY-MM) to accept, or 'all' to ignore the allowlist. */
  editions?: string[] | 'all'
  /** Restrict to a single source key. */
  sourceKey?: string
  /** Preview only — write nothing. */
  dry?: boolean
  /** Line sink for human-readable progress (defaults to no-op). */
  log?: (line: string) => void
}

export type IngestResult = {
  sources: number
  ingested: number
  deduped: number
  skippedEdition: number
  undated: number
  perEdition: Record<string, number>
}

/** The edition (YYYY-MM) an item belongs to, from its publication date. */
function editionOf(c: Candidate): string | undefined {
  if (!c.publishedAt) return undefined
  const d = new Date(c.publishedAt)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 7)
}

export async function ingestSources(opts: IngestOptions = {}): Promise<IngestResult> {
  const log = opts.log ?? (() => {})
  const dry = !!opts.dry
  const allEditions = opts.editions === 'all'
  const allowed = new Set(allEditions ? [] : opts.editions ?? DEFAULT_EDITIONS)

  const sources = SOURCES.filter((s) => !opts.sourceKey || s.key === opts.sourceKey)
  if (!sources.length) {
    throw new Error(opts.sourceKey ? `No source "${opts.sourceKey}".` : 'No sources registered.')
  }

  const scope = allEditions ? 'all editions' : `editions ${[...allowed].join(', ')}`
  log(`Ingesting ${sources.length} source(s) → ${scope}${dry ? ' [DRY RUN]' : ''}`)

  let ingested = 0
  let deduped = 0
  let skippedEdition = 0
  let undated = 0
  const perEdition = new Map<string, number>()
  // For --dry, track identities across the run so cross-posts show in the counts
  // (real ingest dedups via the DB content layer).
  const seenIdentities = new Set<string>()

  for (const source of sources) {
    let candidates: Candidate[]
    try {
      candidates = await source.fetch()
    } catch (err) {
      log(`• ${source.name} (${source.key})… FAILED: ${String(err)}`)
      continue
    }

    const kept: { c: Candidate; edition: string }[] = []
    for (const c of candidates) {
      const edition = editionOf(c)
      if (!edition) {
        undated++
        continue
      }
      if (!allEditions && !allowed.has(edition)) {
        skippedEdition++
        continue
      }
      kept.push({ c, edition })
    }
    log(`• ${source.name} (${source.key})… ${candidates.length} found, ${kept.length} in scope`)

    for (const { c, edition } of kept) {
      const identity = contentIdentity(c)
      const img = c.image ? ' 🖼' : ''
      if (dry) {
        const dup = seenIdentities.has(identity.key)
        if (!dup) seenIdentities.add(identity.key)
        log(`    ${edition} [${c.type}·${c.areaSlug}]${img}${dup ? ' ↻ dedup' : ''} ${c.title.slice(0, 52)}`)
        if (dup) deduped++
        else {
          perEdition.set(edition, (perEdition.get(edition) ?? 0) + 1)
          ingested++
        }
        continue
      }
      const contentId = upsertContent({
        identityKey: identity.key,
        identityKind: identity.kind,
        sourceKey: source.key,
        title: sanitizeText(c.title, 200) || c.title,
        url: c.href,
        description: sanitizeText(c.description) || null,
        image: c.image ?? null,
        areaSlug: c.areaSlug,
        areaLabel: c.areaLabel,
        type: c.type,
        source: c.source,
        sourceKind: c.sourceKind,
        publishedAt: c.publishedAt ?? null,
        edition,
      })
      const { created } = upsertCardForContent(contentId, c.key)
      log(`    ${edition} [${c.type}·${c.areaSlug}]${img}${created ? '' : ' ↻ dedup'} ${c.title.slice(0, 52)}`)
      if (created) {
        perEdition.set(edition, (perEdition.get(edition) ?? 0) + 1)
        ingested++
      } else {
        deduped++
      }
    }
  }

  const byEdition = [...perEdition.entries()].sort().map(([e, n]) => `${e}: ${n}`).join(', ')
  log(
    `${dry ? 'Would ingest' : 'Ingested'} ${ingested} card(s)` +
      (byEdition ? ` (${byEdition})` : '') +
      `. ${deduped} cross-posted (deduped), ${skippedEdition} out-of-scope, ${undated} undated.` +
      (dry ? '' : ` Pool now: ${getActiveCards().length} active (active edition).`),
  )

  return {
    sources: sources.length,
    ingested,
    deduped,
    skippedEdition,
    undated,
    perEdition: Object.fromEntries(perEdition),
  }
}
