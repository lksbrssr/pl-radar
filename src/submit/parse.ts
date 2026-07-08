/**
 * Turn a pasted URL into a review-ready draft — the heart of "paste anything,
 * get a card."
 *
 *   parseCardDraft(url)   → one candidate card (LLM classifies area/type/angle)
 *   parseSourceDraft(url) → a recurring-feed scaffold + a few sample cards
 *
 * Both fetch the page first (see fetch.ts), then ask the configured LLM to fill
 * in the editorial fields (see llm.ts). If no LLM is configured the caller gets
 * an `LlmUnavailableError` and the UI falls back to the manual path (cards) or
 * simply reports it (sources — no manual fallback there, by design).
 */
import { FOCUS_AREAS, ANGLES } from '../types.js'
import { areaLabel, inferArea, inferType, sanitizeText, slugify } from '../ingest/util.js'
import { fetchPageMeta, type PageMeta } from './fetch.js'
import { askJson } from './llm.js'

const AREA_SLUGS = FOCUS_AREAS.map((a) => a.slug)
const ANGLE_KEYS = ANGLES.map((a) => a.key)
const TYPES = ['Talk', 'Podcast', 'Publication', 'Blog', 'Signal']

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
  /** One line on why the model filed it where it did (shown in the review UI). */
  rationale?: string
  /** Best-effort publication date (YYYY-MM-DD), or null if unknown. */
  publishedAt?: string | null
  /** Set when the item looks too old for a monthly "recent signals" digest. */
  staleWarning?: string | null
}

/** Judge whether a publication date is too old for the monthly Radar. Editions
 *  are monthly, so anything older than ~2 months is flagged for the submitter. */
function staleness(iso: string | null | undefined): {
  publishedAt: string | null
  staleWarning: string | null
} {
  if (!iso) return { publishedAt: null, staleWarning: null }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { publishedAt: null, staleWarning: null }
  const ymd = d.toISOString().slice(0, 10)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days > 60) {
    const months = Math.max(2, Math.round(days / 30))
    return {
      publishedAt: ymd,
      staleWarning:
        `This looks like it was published on ${ymd} (~${months} months ago). ` +
        `The Radar highlights recent signals, so it may be too old for this month's edition.`,
    }
  }
  return { publishedAt: ymd, staleWarning: null }
}

function clampArea(slug: unknown): string {
  return typeof slug === 'string' && AREA_SLUGS.includes(slug as never)
    ? slug
    : ''
}
function clampType(t: unknown): string {
  return typeof t === 'string' && TYPES.includes(t) ? t : ''
}
function clampAngle(a: unknown): string | null {
  return typeof a === 'string' && ANGLE_KEYS.includes(a as never) ? a : null
}

const CARD_SYSTEM = `You are an editor for the Protocol Labs R&D Radar, a monthly digest of the strongest signals across four research focus areas (plus a general bucket):
- digital-human-rights (privacy, encryption, surveillance, human rights, freedom online)
- economies-governance (funding, mechanisms, markets, governance, public goods, crypto-economics)
- ai-robotics (AI models, agents, robotics, compute, benchmarks)
- neurotech (brain, BCI, neural interfaces, neuroscience)
- protocol-labs (org/company announcements, general Protocol Labs news, or anything that does not fit one of the four research areas cleanly)

Given the metadata and text of ONE web page (article, post, paper, thread, video…), produce a concise candidate card.

Return ONLY a JSON object:
{
  "title": string,            // a tight, specific headline (<= 90 chars)
  "description": string,      // 1-2 sentences on why it matters (<= 240 chars)
  "areaSlug": one of ["digital-human-rights","economies-governance","ai-robotics","neurotech","protocol-labs"],
  "type": one of ["Talk","Podcast","Publication","Blog","Signal"],
  "angle": one of ["counterintuitive","big-if-true","early-signal","provocative","funny","clarifying","proof"],
  "source": string,           // who to credit (publication / author / site), <= 40 chars
  "rationale": string,        // one short line on the area/angle choice
  "publishedAt": string|null  // the item's publication date as YYYY-MM-DD if stated on the page, else null
}
Rules: never invent facts not supported by the page. Be honest about the angle — do not manufacture hype. "Signal" is the default type for news/links. For publishedAt, only use a date actually stated on the page; if none is visible, return null.`

function cardUserPrompt(m: PageMeta): string {
  return [
    `URL: ${m.finalUrl}`,
    m.siteName ? `Site: ${m.siteName}` : '',
    `Page title: ${m.title || '(none)'}`,
    m.description ? `Meta description: ${m.description}` : '',
    '',
    'Page text (truncated):',
    m.text || '(no readable body text)',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Parse a single URL into a review-ready card draft. Throws on fetch failure
 *  or when no LLM is configured. */
export async function parseCardDraft(url: string): Promise<CardDraft> {
  const meta = await fetchPageMeta(url)
  type Raw = {
    title?: string
    description?: string
    areaSlug?: string
    type?: string
    angle?: string
    source?: string
    rationale?: string
    publishedAt?: string
  }
  const raw = await askJson<Raw>(CARD_SYSTEM, cardUserPrompt(meta))
  // Prefer the machine-readable meta date; fall back to the model's reading.
  const { publishedAt, staleWarning } = staleness(meta.publishedAt || raw.publishedAt)

  const title = sanitizeText(raw.title || meta.title, 120) || meta.title || meta.finalUrl
  const areaSlug = clampArea(raw.areaSlug) || inferArea(`${title} ${meta.description} ${meta.text}`)
  const type = clampType(raw.type) || inferType(meta.finalUrl, title)
  const source =
    sanitizeText(raw.source || meta.siteName || '', 40) ||
    (() => {
      try {
        return new URL(meta.finalUrl).host.replace(/^www\./, '')
      } catch {
        return 'Community'
      }
    })()

  return {
    title,
    description: sanitizeText(raw.description || meta.description, 240),
    href: meta.finalUrl,
    areaSlug,
    areaLabel: areaLabel(areaSlug),
    type,
    angle: clampAngle(raw.angle),
    source,
    image: meta.image,
    rationale: raw.rationale ? sanitizeText(raw.rationale, 160) : undefined,
    publishedAt,
    staleWarning,
  }
}

// ---------------------------------------------------------------------------
// Recurring source parsing
// ---------------------------------------------------------------------------

export type SourceDraft = {
  /** Suggested stable source key (slug). */
  key: string
  name: string
  description: string
  /** The feed URL we'll actually poll. */
  feedUrl: string
  homepage: string | null
  /** A few preview cards this feed would produce right now. */
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
 *  or its HTML advertises one via <link rel="alternate">). */
export async function discoverFeedUrl(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'plrd-radar-curator/1.0', accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new NoFeedError(`Could not reach that URL (${String(err)}).`)
  }
  if (!res.ok) throw new NoFeedError(`The site returned HTTP ${res.status}.`)
  const ctype = (res.headers.get('content-type') || '').toLowerCase()
  const body = await res.text()
  const finalUrl = res.url || url

  // Already a feed?
  if (/(xml|rss|atom)/.test(ctype) || /<rss\b|<feed\b/i.test(body.slice(0, 500))) {
    return finalUrl
  }
  // Otherwise sniff <link rel="alternate" type="application/rss+xml" href="…">.
  const linkRe = /<link\b[^>]*rel=["']alternate["'][^>]*>/gi
  const links = body.match(linkRe) || []
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

const SOURCE_SYSTEM = `You name and describe a new content source for the Protocol Labs R&D Radar.
Given a feed's title and a few recent item titles, return ONLY JSON:
{ "name": string (<= 40 chars), "description": string (one line, <= 120 chars, what this feed brings in) }`

/** Parse a URL into a recurring-source scaffold + sample cards. Throws
 *  `NoFeedError` when no usable feed is found, or `LlmUnavailableError` when no
 *  LLM is configured (there is no manual fallback for sources, by design). */
export async function parseSourceDraft(url: string): Promise<SourceDraft> {
  const feedUrl = await discoverFeedUrl(url)
  const { parseRss } = await import('../ingest/util.js')
  const xml = await (
    await fetch(feedUrl, {
      headers: { 'user-agent': 'plrd-radar-curator/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
  ).text()
  const items = parseRss(xml).slice(0, 6)
  if (!items.length) {
    throw new NoFeedError('That feed has no readable items yet.')
  }
  const feedTitle =
    xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || ''
  let homepage: string | null = null
  try {
    homepage = new URL(feedUrl).origin
  } catch {
    homepage = null
  }

  let name = sanitizeText(feedTitle, 40)
  let description = ''
  try {
    const raw = await askJson<{ name?: string; description?: string }>(
      SOURCE_SYSTEM,
      `Feed title: ${feedTitle || '(none)'}\nRecent items:\n` +
        items.map((i) => `- ${i.title}`).join('\n'),
    )
    if (raw.name) name = sanitizeText(raw.name, 40)
    if (raw.description) description = sanitizeText(raw.description, 120)
  } catch (err) {
    // LLM is optional here for naming; a missing model still yields a scaffold
    // from the feed's own title. Re-throw only truly fatal (non-LLM) errors.
    if ((err as Error)?.name !== 'LlmUnavailableError') throw err
  }

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
    name: name || feedTitle || 'New source',
    description: description || `Candidate cards pulled from ${homepage || feedUrl}.`,
    feedUrl,
    homepage,
    sample,
  }
}
