/**
 * Shared helpers for ingestion sources: a tiny dependency-free RSS/Atom parser,
 * plus best-effort inference of a card's focus area and type when the source
 * doesn't provide them explicitly.
 */
import { FOCUS_AREAS } from '../types.js'

export type FeedItem = {
  title: string
  link: string
  description: string
  pubDate?: string
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  if (!m) return ''
  return m[1]!
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

/** Parse an RSS 2.0 feed into items. Good enough for well-formed feeds. */
export function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = []
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []
  for (const b of blocks) {
    const link = tag(b, 'link')
    const title = tag(b, 'title')
    if (!link || !title) continue
    items.push({
      title,
      link,
      description: tag(b, 'description'),
      pubDate: tag(b, 'pubDate') || undefined,
    })
  }
  return items
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function areaLabel(slug: string): string {
  return FOCUS_AREAS.find((a) => a.slug === slug)?.label ?? slug
}

// Keyword banks for best-effort area inference. This is intentionally simple;
// once cards carry explicit tags (worked on separately) that becomes the
// source of truth and this is just a fallback.
const AREA_KEYWORDS: Record<string, string[]> = {
  neurotech: ['brain', 'neuro', 'bci', 'connectome', 'neural', 'cortex', 'paralysis', 'synap', 'stentrode', 'implant'],
  'economies-governance': ['funding', 'governance', 'quadratic', 'public good', 'economic', 'market', 'token', 'filecoin', 'storage', 'retro', 'capital', 'mechanism', 'auction', 'stablecoin'],
  'ai-robotics': ['robot', 'agent', 'model', 'machine learning', ' ml ', 'compute', 'gpu', 'manipulation', 'benchmark', 'world model', 'autonomous', ' ai '],
  'digital-human-rights': ['privacy', 'rights', 'encryption', 'surveillance', 'location data', 'censorship', 'human rights', 'freedom', 'spyware', 'fourth amendment', 'geofence'],
}

/** Best-effort focus area from free text; falls back to economies-governance. */
export function inferArea(text: string): string {
  const t = ` ${text.toLowerCase()} `
  let best = ''
  let bestScore = 0
  for (const [slug, words] of Object.entries(AREA_KEYWORDS)) {
    const score = words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = slug
    }
  }
  return best || 'economies-governance'
}

/** Best-effort content type from a plrd.org-style URL + title. */
export function inferType(url: string, title = ''): string {
  const u = url.toLowerCase()
  if (u.includes('/publications/')) return 'Publication'
  if (u.includes('/talks/')) {
    return /jbp-|podcast|greenpill/.test(u) ? 'Podcast' : 'Talk'
  }
  if (u.includes('/blog/') || u.includes('/posts/')) return 'Blog'
  if (/podcast/.test(title.toLowerCase())) return 'Podcast'
  return 'Signal'
}
