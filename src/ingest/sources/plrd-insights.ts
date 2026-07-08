/**
 * Source: plrd.org Insights.
 *
 * Pulls the newest talks, podcasts, publications and posts from the public
 * plrd.org RSS feed and turns them into candidate cards. The feed carries only
 * title / link / date / description, so `type` is inferred from the URL and
 * `areaSlug` from keywords (see ../util). These are our own outputs, so they're
 * marked source_kind = "internal".
 */
import type { Source, Candidate } from '../types.js'
import { parseRss, slugify, inferArea, inferType, areaLabel } from '../util.js'

const FEED_URL = 'https://www.plrd.org/feed.xml'

export const plrdInsights: Source = {
  key: 'plrd-insights',
  name: 'plrd.org Insights',
  description: 'Talks, podcasts, publications & posts from the PL R&D site RSS feed.',
  homepage: 'https://www.plrd.org/insights',
  keyPrefix: 'plrd-',
  external: false,

  async fetch(): Promise<Candidate[]> {
    const res = await fetch(FEED_URL, {
      headers: { 'user-agent': 'plrd-radar-curator/ingest' },
    })
    if (!res.ok) throw new Error(`plrd feed ${res.status}`)
    const xml = await res.text()

    return parseRss(xml).map((item) => {
      const text = `${item.title} ${item.description}`
      const areaSlug = inferArea(text)
      // Prefer a stable key from the URL's last path segment.
      const seg = item.link.replace(/\/+$/, '').split('/').filter(Boolean).pop() || item.title
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
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      }
      return candidate
    })
  },
}
