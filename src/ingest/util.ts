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
  /** Header image, if the feed carries one (RSS <enclosure>/<media:content>). */
  image?: string
  /** Full post body (<content:encoded>), when present — lets a source mine
   *  embedded identifiers (e.g. YouTube ids) for dedup / images. */
  content?: string
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

/** Pull the `url` attribute off the first matching self-closing-ish tag. */
function attrUrl(block: string, tagName: string): string | undefined {
  const m = block.match(new RegExp(`<${tagName}\\b[^>]*\\burl="([^"]+)"`, 'i'))
  return m ? m[1] : undefined
}

/** Parse an RSS 2.0 feed into items. Good enough for well-formed feeds.
 *  Also lifts a header image from <enclosure> or <media:content> when present. */
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
      image: attrUrl(b, 'enclosure') || attrUrl(b, 'media:content'),
      content: tag(b, 'content:encoded') || undefined,
    })
  }
  return items
}

/**
 * Clean a feed description into plain, display-ready text: strip HTML tags,
 * decode entities (named + numeric), remove the WordPress “The post … appeared
 * first on …” boilerplate, collapse whitespace, and cap the length. Feeds like
 * plneuro.xyz ship full HTML in <description>, which otherwise renders as raw
 * `<p>…&#8217;…</p>` markup on the cards.
 */
export function sanitizeText(input: string | null | undefined, maxLen = 300): string {
  if (!input) return ''
  let s = String(input)
  // Drop the WP “The post <a>…</a> appeared first on <a>…</a>.” trailer (HTML form).
  s = s.replace(/<p>\s*The post[\s\S]*?appeared first on[\s\S]*?<\/p>\s*$/i, ' ')
  s = s.replace(/<[^>]+>/g, ' ') // strip tags
  s = s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  // Plain-text fallback for the same boilerplate once tags are gone.
  s = s.replace(/\s*The post\b[\s\S]*?\bappeared first on\b[\s\S]*$/i, '')
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/\s+\S*$/, '').trim() + '…'
  }
  return s
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
//  A trailing '*' makes a keyword a PREFIX/stem match (e.g. 'neuro*' catches
//  neuron / neurons / neuroscience); otherwise it's a whole-word match.
const AREA_KEYWORDS: Record<string, string[]> = {
  neurotech: ['brain*', 'neuro*', 'neural', 'bci', 'connectome', 'cortex', 'cortical', 'paralysis', 'synap*', 'stentrode', 'implant*'],
  'economies-governance': ['funding', 'govern*', 'quadratic', 'public good*', 'economic*', 'economy', 'market*', 'token*', 'filecoin', 'storage', 'retroactive', 'capital', 'mechanism design', 'auction*', 'stablecoin', 'philanthrop*', 'incentive*'],
  'ai-robotics': ['robot*', 'agent*', 'ai', 'artificial intelligence', 'llm*', 'model*', 'machine learning', 'ml', 'compute', 'gpu*', 'manipulation', 'benchmark*', 'autonom*'],
  'digital-human-rights': ['privacy', 'rights', 'encrypt*', 'surveillance', 'location data', 'censorship', 'human rights', 'freedom', 'spyware', 'fourth amendment', 'geofenc*'],
}

/** Boundary-aware keyword test. Hyphens, spaces and punctuation all count as
 *  word edges, so "ai" matches "AI-driven" / "AI." but not "said" or "brain".
 *  A trailing '*' switches to a prefix/stem match ("neuro*" → neuron, neurons,
 *  neuroscience) so we catch inflections without matching unrelated words like
 *  "brainstorm". Multi-word phrases are matched literally with the same edges. */
function hasKeyword(haystack: string, word: string): boolean {
  const prefix = word.endsWith('*')
  const bare = (prefix ? word.slice(0, -1) : word).toLowerCase()
  const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tail = prefix ? '' : '(?![a-z0-9])'
  return new RegExp(`(?:^|[^a-z0-9])${esc}${tail}`, 'i').test(haystack)
}

/** Keywords that mark genuine Protocol Labs org/ecosystem news (as opposed to
 *  "couldn't classify it"). These keep real PL announcements in the catch-all
 *  `protocol-labs` bucket instead of being dropped as off-mission. */
const PROTOCOL_LABS_KEYWORDS = [
  'protocol labs', 'filecoin', 'ipfs', 'libp2p', 'drand', 'ipld', 'fil+',
  'fvm', 'pln', 'pl network', 'juan benet', 'web3.storage', 'nft.storage',
]

/** Best-effort focus area from free text, or `null` when nothing matches any
 *  research area or the Protocol Labs bucket — i.e. the text looks off-mission.
 *  Callers that need a concrete slug should use `inferArea` (which falls back to
 *  `protocol-labs`); ingestion uses this to DROP off-mission external items. */
export function inferAreaOrNull(text: string): string | null {
  const t = ` ${text.toLowerCase()} `
  let best = ''
  let bestScore = 0
  for (const [slug, words] of Object.entries(AREA_KEYWORDS)) {
    const score = words.reduce((n, w) => n + (hasKeyword(t, w) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = slug
    }
  }
  if (best) return best
  if (PROTOCOL_LABS_KEYWORDS.some((w) => hasKeyword(t, w))) return 'protocol-labs'
  return null
}

/** Best-effort focus area from free text. Falls back to the general
 *  `protocol-labs` bucket when nothing matches a research area cleanly. */
export function inferArea(text: string): string {
  return inferAreaOrNull(text) ?? 'protocol-labs'
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
