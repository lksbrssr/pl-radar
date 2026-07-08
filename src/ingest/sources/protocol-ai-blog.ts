/**
 * Source: protocol.ai Blog.
 *
 * Pulls posts from the Protocol Labs blog RSS feed (protocol.ai/rss.xml). The
 * feed is rich — title / link / date / description plus an <enclosure> header
 * image (the post's OG image) — so cards get a real image out of the box.
 *
 * These are Protocol Labs' own announcements and essays, so source_kind is
 * "internal". `type` is Blog unless the title clearly signals otherwise, and
 * `areaSlug` is inferred from the text (see ../util).
 */
import type { Source, Candidate } from '../types.js'
import { parseRss, slugify, inferArea, inferType, areaLabel } from '../util.js'

const FEED_URL = 'https://www.protocol.ai/rss.xml'

export const protocolAiBlog: Source = {
  key: 'protocol-ai-blog',
  name: 'protocol.ai Blog',
  description: 'Announcements & essays from the Protocol Labs blog (protocol.ai/blog).',
  homepage: 'https://www.protocol.ai/blog/',
  keyPrefix: 'protocol-',
  external: false,

  async fetch(): Promise<Candidate[]> {
    const res = await fetch(FEED_URL, {
      headers: { 'user-agent': 'plrd-radar-curator/ingest' },
    })
    if (!res.ok) throw new Error(`protocol.ai feed ${res.status}`)
    const xml = await res.text()

    return parseRss(xml).map((item) => {
      const text = `${item.title} ${item.description}`
      const areaSlug = inferArea(text)
      const seg = item.link.replace(/\/+$/, '').split('/').filter(Boolean).pop() || item.title
      // Feed items are blog posts; only override when the title clearly signals
      // another format (e.g. a podcast announcement).
      const type = /podcast/i.test(item.title) ? 'Podcast' : inferType(item.link, item.title)
      const candidate: Candidate = {
        key: `protocol-${slugify(seg)}`,
        title: item.title,
        description: item.description || undefined,
        href: item.link,
        source: 'Protocol Labs',
        sourceKind: 'internal',
        type: type === 'Signal' ? 'Blog' : type,
        areaSlug,
        areaLabel: areaLabel(areaSlug),
        image: item.image,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      }
      return candidate
    })
  },
}
