/**
 * Source: plrd.org Insights.
 *
 * Pulls the newest talks, podcasts, publications and posts from the public
 * plrd.org RSS feed and turns them into candidate cards. The feed carries
 * title / link / date / description but no images, so we enrich each item with
 * its header image (usually a YouTube thumbnail) scraped from the /insights
 * listing page, joined by title. `type` is inferred from the URL and `areaSlug`
 * from keywords (see ../util). These are our own outputs → source_kind
 * "internal".
 */
import type { Source, Candidate } from '../types.js'
import { parseRss, slugify, inferArea, inferType, areaLabel } from '../util.js'

const SITE = 'https://www.plrd.org'
const FEED_URL = `${SITE}/feed.xml`
const INSIGHTS_URL = `${SITE}/insights/`

/** Absolutize a possibly-relative image URL against the plrd.org origin. */
function absolutize(src: string): string {
  if (/^https?:\/\//i.test(src)) return src
  return SITE + (src.startsWith('/') ? src : '/' + src)
}

/** Decode the HTML entities that appear in `alt` text, so it joins cleanly
 *  against the entity-decoded RSS titles. Must cover NUMERIC entities too:
 *  plrd.org encodes apostrophes as the hex entity `&#x27;` (e.g. "Don&#x27;t"),
 *  so a titles-only match on named entities silently fails and the card loses
 *  its YouTube thumbnail (falling back to the generic share card). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

/**
 * Scrape a `title → header image` map from the /insights listing HTML. Each
 * card renders an `<img src alt>` whose `alt` equals the item title, so we join
 * on that. Best-effort: on any failure we return an empty map and cards simply
 * ship without an image.
 */
async function fetchImageMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const res = await fetch(INSIGHTS_URL, {
      headers: { 'user-agent': 'plrd-radar-curator/ingest' },
    })
    if (!res.ok) return map
    const html = await res.text()
    // Match both attribute orders: src-then-alt and alt-then-src.
    const re = /<img\b[^>]*?(?:src="([^"]+)"[^>]*?alt="([^"]*)"|alt="([^"]*)"[^>]*?src="([^"]+)")/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const src = m[1] ?? m[4]
      const alt = decodeEntities(m[2] ?? m[3] ?? '')
      if (!src || !alt || map.has(alt)) continue
      map.set(alt, absolutize(src))
    }
  } catch {
    /* best-effort: no images is fine */
  }
  return map
}

export const plrdInsights: Source = {
  key: 'plrd-insights',
  name: 'plrd.org Insights',
  description: 'Talks, podcasts, publications & posts from the PL R&D site (plrd.org/insights).',
  homepage: 'https://www.plrd.org/insights',
  keyPrefix: 'plrd-',
  external: false,

  async fetch(): Promise<Candidate[]> {
    const [feedRes, images] = await Promise.all([
      fetch(FEED_URL, { headers: { 'user-agent': 'plrd-radar-curator/ingest' } }),
      fetchImageMap(),
    ])
    if (!feedRes.ok) throw new Error(`plrd feed ${feedRes.status}`)
    const xml = await feedRes.text()

    return parseRss(xml).map((item) => {
      const text = `${item.title} ${item.description}`
      const areaSlug = inferArea(text)
      // Prefer a stable key from the URL's last path segment.
      const seg = item.link.replace(/\/+$/, '').split('/').filter(Boolean).pop() || item.title
      const image = images.get(item.title.trim()) || item.image
      const candidate: Candidate = {
        key: `plrd-${slugify(seg)}`,
        title: item.title,
        description: item.description || undefined,
        href: item.link,
        source: 'PL R&D',
        sourceKind: 'internal',
        type: inferType(item.link, item.title),
        areaSlug,
        areaLabel: areaLabel(areaSlug),
        image,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      }
      return candidate
    })
  },
}
