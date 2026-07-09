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
import { allSources } from './sources/index.js'
import type { Candidate } from './types.js'
import { upsertContent, upsertCardForContent, getActiveCards } from '../db/repo.js'
import { contentIdentity } from './identity.js'
import { sanitizeText, inferAreaOrNull } from './util.js'
import { resolveCardImage } from './image.js'
import { config } from '../config.js'

/** Editions ingested by default. June & July 2026 for the initial rollout. */
export const DEFAULT_EDITIONS = ['2026-06', '2026-07']

export type IngestOptions = {
  /** Editions (YYYY-MM) to accept, or 'all' to ignore the allowlist. */
  editions?: string[] | 'all'
  /** Restrict to a single source key. */
  sourceKey?: string
  /** Preview only — write nothing. */
  dry?: boolean
  /** Validate each card's image and fall back to the page's hero when broken.
   *  Defaults to true for a real ingest; always skipped on a --dry run (keeps
   *  previews fast and offline-friendly). */
  resolveImages?: boolean
  /** Line sink for human-readable progress (defaults to no-op). */
  log?: (line: string) => void
}

export type IngestResult = {
  sources: number
  ingested: number
  deduped: number
  skippedEdition: number
  undated: number
  /** External items dropped for matching no focus area / PL signal. */
  offTopic: number
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
  const resolveImages = (opts.resolveImages ?? true) && !dry
  const allEditions = opts.editions === 'all'
  const allowed = new Set(allEditions ? [] : opts.editions ?? DEFAULT_EDITIONS)

  const sources = allSources().filter((s) => !opts.sourceKey || s.key === opts.sourceKey)
  if (!sources.length) {
    throw new Error(opts.sourceKey ? `No source "${opts.sourceKey}".` : 'No sources registered.')
  }

  const scope = allEditions ? 'all editions' : `editions ${[...allowed].join(', ')}`
  log(`Ingesting ${sources.length} source(s) → ${scope}${dry ? ' [DRY RUN]' : ''}`)

  let ingested = 0
  let deduped = 0
  let skippedEdition = 0
  let undated = 0
  let offTopic = 0
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
      // On-mission gate: drop EXTERNAL items that only landed in the generic
      // catch-all bucket AND whose text carries no focus-area / PL signal.
      // Explicitly-tagged cards (a real research area, or a feed area override)
      // and all internal PL sources are never dropped. See config.dropOffMission.
      if (
        config.dropOffMission &&
        source.external &&
        c.areaSlug === 'protocol-labs' &&
        inferAreaOrNull(`${c.title} ${c.description ?? ''}`) === null
      ) {
        offTopic++
        log(`    ⊘ off-mission ${c.title.slice(0, 52)}`)
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
      let image = c.image ?? null
      if (resolveImages) {
        const resolved = await resolveCardImage({ image: c.image, href: c.href })
        if (resolved !== image) {
          if (resolved) log(`      ↳ image ${image ? 'repaired' : 'found'}: ${resolved.slice(0, 64)}`)
          else if (image) log(`      ↳ image dropped (broken): ${image.slice(0, 64)}`)
        }
        image = resolved
      }
      const contentId = upsertContent({
        identityKey: identity.key,
        identityKind: identity.kind,
        sourceKey: source.key,
        title: sanitizeText(c.title, 200) || c.title,
        url: c.href,
        description: sanitizeText(c.description) || null,
        image,
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
      `. ${deduped} cross-posted (deduped), ${skippedEdition} out-of-scope, ${undated} undated, ${offTopic} off-mission.` +
      (dry ? '' : ` Pool now: ${getActiveCards().length} active (active edition).`),
  )

  return {
    sources: sources.length,
    ingested,
    deduped,
    skippedEdition,
    undated,
    offTopic,
    perEdition: Object.fromEntries(perEdition),
  }
}
