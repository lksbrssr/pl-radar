/**
 * Ingestion CLI: `npm run ingest [-- flags]`.
 *
 * Thin wrapper over `ingestSources()` (see ingest.ts) — the same engine the
 * scheduled background ingest uses. Fetches every source and upserts candidates
 * into the edition matching their publication month, deduplicating cross-posts
 * via the content layer. Idempotent; safe to run repeatedly / on a cron.
 *
 * Flags:
 *   --dry                     Show what would be ingested; write nothing.
 *   --source=<key>            Only run one source (e.g. --source=plrd-insights).
 *   --editions=<m1,m2,...>    Editions to accept, as YYYY-MM (default June/July 2026).
 *                             Pass --editions=all to ingest every month.
 */
import { ingestSources, DEFAULT_EDITIONS } from './ingest.js'

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  const eq = hit.indexOf('=')
  return eq === -1 ? '' : hit.slice(eq + 1)
}

const editionsFlag = flag('editions')
const editions: string[] | 'all' =
  editionsFlag === 'all'
    ? 'all'
    : editionsFlag
      ? editionsFlag.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_EDITIONS

ingestSources({
  dry: flag('dry') !== undefined,
  sourceKey: flag('source') || undefined,
  editions,
  log: (line) => console.log(line),
}).catch((err) => {
  console.error('ingest fatal:', err)
  process.exit(1)
})
