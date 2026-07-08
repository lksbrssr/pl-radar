/**
 * Source: PL Neuro (plneuro.xyz).
 *
 * Protocol Labs' neurotech program site. Pulls talks, interviews and posts from
 * its WordPress RSS feed (plneuro.xyz/feed/). The feed carries
 * title / link / date / description; its media is YouTube embeds inside the post
 * body rather than a feed image, so cards ship without a header image for now
 * (header images + cross-source dedup are handled separately).
 *
 * These are our own outputs → source_kind "internal". `areaSlug` is inferred
 * from the text but this is a neurotech-focused source, so it will almost always
 * resolve to `neurotech`.
 *
 * NOTE: plneuro cross-posts some talks that also appear via plrd-insights, so
 * this source can produce duplicates of those cards until dedup lands.
 */
import type { Source, Candidate } from '../types.js'
import { parseRss, slugify, inferArea, inferType, areaLabel } from '../util.js'

const FEED_URL = 'https://plneuro.xyz/feed/'

export const plNeuro: Source = {
  key: 'plneuro',
  name: 'PL Neuro',
  description: 'Talks, interviews & posts from the PL neurotech program (plneuro.xyz).',
  homepage: 'https://plneuro.xyz/',
  keyPrefix: 'plneuro-',
  external: false,

  async fetch(): Promise<Candidate[]> {
    const res = await fetch(FEED_URL, {
      headers: { 'user-agent': 'plrd-radar-curator/ingest' },
    })
    if (!res.ok) throw new Error(`plneuro feed ${res.status}`)
    const xml = await res.text()

    return parseRss(xml).map((item) => {
      const text = `${item.title} ${item.description}`
      const areaSlug = inferArea(text)
      const seg = item.link.replace(/\/+$/, '').split('/').filter(Boolean).pop() || item.title
      // Talks/interviews site: default an unclassified item to Talk (Podcast when
      // the title says so) rather than the generic Signal.
      const inferred = inferType(item.link, item.title)
      const type = /podcast/i.test(item.title) ? 'Podcast' : inferred === 'Signal' ? 'Talk' : inferred
      const candidate: Candidate = {
        key: `plneuro-${slugify(seg)}`,
        title: item.title,
        description: item.description || undefined,
        href: item.link,
        source: 'PL Neuro',
        sourceKind: 'internal',
        type,
        areaSlug,
        areaLabel: areaLabel(areaSlug),
        image: item.image,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      }
      return candidate
    })
  },
}
