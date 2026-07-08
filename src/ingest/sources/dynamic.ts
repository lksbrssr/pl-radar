/**
 * Dynamic sources — the recurring feeds people add through the web app (stored
 * in the `feed_sources` table) surfaced as first-class `Source`s.
 *
 * Each DB row becomes a generic RSS/Atom reader that behaves exactly like a
 * code-defined source: its `fetch()` is read-only (returns Candidate[]), it
 * carries a `keyPrefix` so the Sources view can count its cards, and the normal
 * background ingest + dedup treats it identically. This is what makes "add a
 * source" a real runtime feature instead of a code PR.
 */
import type { Source, Candidate } from '../types.js'
import { parseRss, slugify, inferArea, inferType, areaLabel, sanitizeText } from '../util.js'
import { listFeedSources, type FeedSource } from '../../db/repo.js'

function makeSource(f: FeedSource): Source {
  return {
    key: f.key,
    name: f.name,
    description: f.description || `Candidate cards from ${f.feed_url}.`,
    homepage: f.homepage || undefined,
    keyPrefix: f.key + '-',
    external: true,
    async fetch(): Promise<Candidate[]> {
      const res = await fetch(f.feed_url, {
        headers: { 'user-agent': 'plrd-radar-curator/ingest' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      return parseRss(xml).map((it): Candidate => {
        const area = f.area_slug || inferArea(`${it.title} ${it.description}`)
        let publishedAt: string | undefined
        if (it.pubDate) {
          const d = new Date(it.pubDate)
          if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString()
        }
        return {
          key: `${f.key}-${slugify(it.title)}`,
          title: it.title,
          description: sanitizeText(it.description) || undefined,
          href: it.link,
          source: f.name,
          sourceKind: 'field',
          type: inferType(it.link, it.title),
          areaSlug: area,
          areaLabel: areaLabel(area),
          image: it.image,
          publishedAt,
        }
      })
    },
  }
}

/** All active user-added feeds, as Sources (re-read from the DB each call so
 *  newly added feeds are picked up on the next ingest without a restart). */
export function dynamicSources(): Source[] {
  return listFeedSources(true).map(makeSource)
}
