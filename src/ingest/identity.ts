/**
 * Content identity — deterministic dedup keys (layer 1, no AI).
 *
 * The same underlying asset (a talk, a post) is often cross-posted by several
 * sources with different URLs and titles. To collapse those to ONE content we
 * resolve each candidate to a strong, deterministic identity:
 *
 *   1. YouTube video id (talks/podcasts) — the strongest cross-source signal.
 *   2. Normalized canonical URL — for everything else.
 *
 * This is intentionally identifier-only: no embeddings, no fuzzy/LLM matching.
 * Semantic dedup of genuinely non-1:1 cross-posts is a later, separate phase.
 * See docs/card-presentation.md §11.
 */

export type Identity = { kind: 'youtube' | 'url'; key: string }

const YT_PATTERNS = [
  /youtube\.com\/watch\?[^#]*\bv=([A-Za-z0-9_-]{11})/i,
  /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  // Thumbnail URLs (e.g. plrd.org card images point at i.ytimg.com/vi/<id>/…).
  /ytimg\.com\/vi\/([A-Za-z0-9_-]{11})/i,
]

/** The 11-char YouTube video id in a URL/string, or null. */
export function youtubeId(input: string | null | undefined): string | null {
  if (!input) return null
  for (const re of YT_PATTERNS) {
    const m = input.match(re)
    if (m) return m[1]!
  }
  return null
}

/** All distinct YouTube ids in a blob of text/HTML, in first-seen order. */
export function youtubeIds(text: string | null | undefined): string[] {
  if (!text) return []
  const re = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|ytimg\.com\/vi\/)([A-Za-z0-9_-]{11})/gi
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) seen.add(m[1]!)
  return [...seen]
}

const TRACKING_PARAMS = new Set(['ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'])
function isTracking(key: string): boolean {
  const k = key.toLowerCase()
  return k.startsWith('utm_') || TRACKING_PARAMS.has(k)
}

/**
 * Normalize a URL to a stable identity: lowercase host, strip leading `www.`,
 * drop the fragment, remove tracking params (`utm_*`, ref, fbclid, gclid,
 * mc_cid, mc_eid), sort the remaining params, and strip the trailing slash.
 */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.host.toLowerCase().replace(/^www\./, '')
    const kept = [...u.searchParams.entries()]
      .filter(([k]) => !isTracking(k))
      .sort((a, b) => a[0].localeCompare(b[0]))
    const qs = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : ''
    const path = u.pathname.replace(/\/+$/, '')
    return `${host}${path}${qs}`
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/#.*$/, '').replace(/\/+$/, '')
  }
}

/**
 * The canonical identity of a candidate/card. Prefers a YouTube id found in the
 * link or the image (plrd thumbnails carry it), else falls back to the
 * normalized URL.
 *
 * TODO(dedup): before the URL fallback, add DOI / arXiv id extraction for
 * papers (a strong identifier we don't yet mine).
 */
export function contentIdentity(input: {
  href: string
  image?: string | null
}): Identity {
  const yt = youtubeId(input.href) ?? youtubeId(input.image)
  if (yt) return { kind: 'youtube', key: `yt:${yt}` }
  return { kind: 'url', key: `url:${canonicalUrl(input.href)}` }
}

/**
 * Source precedence for merging cross-posts. The highest-precedence source
 * (lowest index) supplies the canonical title/url/area/type/edition, so a card
 * links to the primary publisher's page when available. `plrd-insights` is
 * primary. Unknown sources rank last.
 */
export const SOURCE_PRECEDENCE = [
  'plrd-insights',
  'protocol-ai-blog',
  'plneuro',
] as const

export function sourceRank(sourceKey: string): number {
  const i = (SOURCE_PRECEDENCE as readonly string[]).indexOf(sourceKey)
  return i === -1 ? SOURCE_PRECEDENCE.length : i
}
