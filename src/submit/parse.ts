/**
 * Server-side URL parsing for the submit flow.
 *
 * The AI drafting is bring-your-own-key and runs in the USER'S browser (their
 * Anthropic key, their tokens — the server never holds a key). So the server
 * only does the parts that must be server-side:
 *
 *   extractCardDraft(url)  → fetch the page + a heuristic draft (title/area/type
 *                            from OG tags + keyword inference). The browser then
 *                            optionally refines this with the user's LLM.
 *   discoverSource(url)    → find the RSS/Atom feed + a few preview cards.
 *
 * Deterministic, no API keys, SSRF-guarded (see fetch.ts).
 */
import { FOCUS_AREAS } from '../types.js'
import { areaLabel, inferArea, inferType, sanitizeText, slugify, parseRss } from '../ingest/util.js'
import { fetchPageMeta, safeFetch, type PageMeta } from './fetch.js'

const AREA_SLUGS = FOCUS_AREAS.map((a) => a.slug)

export type CardDraft = {
  title: string
  description: string
  href: string
  areaSlug: string
  areaLabel: string
  type: string
  angle: string | null
  source: string
  image: string | null
  rationale?: string
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return 'Community'
  }
}

/** Fetch a URL and build a best-effort heuristic draft from its metadata. The
 *  browser refines this with the user's LLM when one is connected; on its own
 *  it's already a decent prefill for the manual form. */
export async function extractCardDraft(url: string): Promise<{ meta: PageMeta; draft: CardDraft }> {
  const meta = await fetchPageMeta(url)
  const title = sanitizeText(meta.title, 120) || meta.title || meta.finalUrl
  const areaSlug = inferArea(`${title} ${meta.description} ${meta.text}`)
  const draft: CardDraft = {
    title,
    description: sanitizeText(meta.description, 240),
    href: meta.finalUrl,
    areaSlug,
    areaLabel: areaLabel(areaSlug),
    type: inferType(meta.finalUrl, title),
    angle: null,
    source: sanitizeText(meta.siteName || '', 40) || hostOf(meta.finalUrl),
    image: meta.image,
  }
  return { meta, draft }
}

/** Clamp an LLM-suggested area slug to a valid one (used by the browser via a
 *  server round-trip? no — kept here so both sides share the allowlist). */
export function isAreaSlug(slug: string): boolean {
  return AREA_SLUGS.includes(slug as never)
}

// ---------------------------------------------------------------------------
// Recurring source discovery
// ---------------------------------------------------------------------------

export type SourceDraft = {
  key: string
  name: string
  description: string
  feedUrl: string
  homepage: string | null
  sample: {
    title: string
    href: string
    areaSlug: string
    areaLabel: string
    type: string
  }[]
}

export class NoFeedError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'NoFeedError'
  }
}

/** Discover an RSS/Atom feed URL from a page (either the URL already IS a feed,
 *  or its HTML advertises one via <link rel="alternate">). SSRF-guarded. */
export async function discoverFeedUrl(url: string): Promise<string> {
  const res = await safeFetch(url, {
    headers: { 'user-agent': 'plrd-radar-curator/1.0', accept: '*/*' },
  })
  if (!res.ok) throw new NoFeedError(`The site returned HTTP ${res.status}.`)
  const ctype = (res.headers.get('content-type') || '').toLowerCase()
  const body = await res.text()
  const finalUrl = res.url || url

  if (/(xml|rss|atom)/.test(ctype) || /<rss\b|<feed\b/i.test(body.slice(0, 500))) {
    return finalUrl
  }
  const links = body.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/gi) || []
  for (const tag of links) {
    if (/application\/(rss|atom)\+xml/i.test(tag)) {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
      if (href) return new URL(href, finalUrl).toString()
    }
  }
  throw new NoFeedError(
    'No RSS/Atom feed found at that URL. Paste a direct feed link (often /feed, /rss, or /feed.xml).',
  )
}

/** Parse a URL into a recurring-source scaffold + sample cards. Naming comes
 *  from the feed's own title (the browser can refine it with the user's LLM);
 *  no server-side API key needed. Throws `NoFeedError` if there's no feed. */
export async function discoverSource(url: string): Promise<SourceDraft> {
  const feedUrl = await discoverFeedUrl(url)
  const xml = await (
    await safeFetch(feedUrl, { headers: { 'user-agent': 'plrd-radar-curator/1.0' } })
  ).text()
  const items = parseRss(xml).slice(0, 6)
  if (!items.length) throw new NoFeedError('That feed has no readable items yet.')

  const feedTitle =
    xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || ''
  let homepage: string | null = null
  try {
    homepage = new URL(feedUrl).origin
  } catch {
    homepage = null
  }

  const name = sanitizeText(feedTitle, 40) || 'New source'
  const sample = items.slice(0, 4).map((i) => {
    const areaSlug = inferArea(`${i.title} ${i.description}`)
    return {
      title: sanitizeText(i.title, 120),
      href: i.link,
      areaSlug,
      areaLabel: areaLabel(areaSlug),
      type: inferType(i.link, i.title),
    }
  })

  return {
    key: slugify(name || feedTitle || 'source') || 'source',
    name,
    description: `Candidate cards pulled from ${homepage || feedUrl}.`,
    feedUrl,
    homepage,
    sample,
  }
}
