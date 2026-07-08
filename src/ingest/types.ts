/**
 * Source-ingestion contract.
 *
 * A "source" is anything that can produce candidate cards for the Radar pool:
 * an RSS feed, a JSON API, a crawler like Doro, a portfolio export, etc. Each
 * source is a small self-contained module that implements `Source`. Adding a
 * new source is meant to be a one-file pull request (see src/ingest/README.md).
 */

/** A normalized candidate card, ready to upsert into the pool. */
export type Candidate = {
  /** Stable, unique slug (used for idempotent upserts). */
  key: string
  title: string
  description?: string
  /** Canonical URL to the primary source. */
  href: string
  /** Human source attribution shown on the card, e.g. "PL R&D", "Doro". */
  source: string
  /** internal = our own output; field = an external "field signal". */
  sourceKind: 'internal' | 'field'
  /** Talk | Podcast | Publication | Blog | Signal */
  type: string
  /** One of the four focus-area slugs (see src/types.ts FOCUS_AREAS). */
  areaSlug: string
  areaLabel: string
  image?: string
  /** ISO date the item was published (used for recency filtering). */
  publishedAt?: string
}

/** A pluggable ingestion source. Implement this and register it. */
export type Source = {
  /** Stable identifier, e.g. "plrd-insights". */
  key: string
  /** Human name shown in logs / admin. */
  name: string
  /** One line describing what this pulls in. */
  description: string
  /** Where the source lives (docs/homepage), optional. */
  homepage?: string
  /**
   * Whether this source is external field signals (true) or our own output.
   * Purely informational; each Candidate also carries its own `sourceKind`.
   */
  external?: boolean
  /** Fetch the current candidates. Should be side-effect free (no DB writes). */
  fetch: () => Promise<Candidate[]>
}
