/**
 * Source: PL Neuro (plneuro.xyz).
 *
 * Protocol Labs' neurotech program site. In mid-2026 it migrated off WordPress
 * to a static Next.js site, which dropped the old `/feed/` RSS endpoint. There
 * is no feed anymore, so we discover content from `/sitemap.xml` (every
 * `/insights/<slug>/` post) and read each post's server-rendered metadata:
 *
 *   - title / description  → og:title / og:description
 *   - published date       → article:published_time
 *   - header image         → the FIRST embedded YouTube video's thumbnail when
 *                            the post is a talk/interview (also the dedup
 *                            identity `yt:<id>`), otherwise the post's real
 *                            per-item og:image. Generic site share cards are
 *                            ignored so `resolveCardImage` can find a better one.
 *
 * These are our own outputs → source_kind "internal". `areaSlug` is inferred
 * from the text but this is a neurotech-focused source, so it will almost always
 * resolve to `neurotech`.
 */
import type { Source, Candidate } from '../types.js'
import { slugify, inferArea, areaLabel, sanitizeText } from '../util.js'
import { youtubeId } from '../identity.js'

const SITE = 'https://www.plneuro.xyz'
const SITEMAP_URL = `${SITE}/sitemap.xml`
const UA = 'plrd-radar-curator/ingest'

/** Site-wide generic share cards carry no per-item signal — ignore them so the
 *  post falls back to a real hero (a video thumbnail) instead. */
const GENERIC_SHARE = /(plneuro-share-image|pl[-_]?share|default[-_]?share|share[-_]?image)/i

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** First `<meta property|name="key" content="…">` value on a page. */
function meta(html: string, key: string): string | null {
  for (const re of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+\\bcontent=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ]) {
    const m = html.match(re)
    if (m && m[1]) return decode(m[1])
  }
  return null
}

/** `{ loc, lastmod }` for every `<url>` in a sitemap. */
function parseSitemap(xml: string): { loc: string; lastmod?: string }[] {
  const out: { loc: string; lastmod?: string }[] = []
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/gi) || []) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1]?.trim()
    if (!loc) continue
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/i)?.[1]?.trim()
    out.push({ loc, lastmod })
  }
  return out
}

async function fetchText(url: string, accept: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Turn one `/insights/<slug>/` URL into a candidate by reading its metadata. */
async function toCandidate(
  url: string,
  lastmod: string | undefined,
): Promise<Candidate | null> {
  const html = await fetchText(url, 'text/html,application/xhtml+xml')
  if (!html) return null

  // Title: prefer og:title; else strip the " — PL Neuro" suffix off <title>.
  const rawTitle =
    meta(html, 'og:title') ||
    decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] || '')
  const title = rawTitle.replace(/\s+[—–-]\s+PL Neuro\s*$/i, '').trim()
  if (!title) return null

  const description = sanitizeText(meta(html, 'og:description') || meta(html, 'description') || '')

  // The primary talk video is the embedded player (the <iframe src=…/embed/ID>);
  // fall back to the first YouTube id anywhere on the page.
  const primaryVideo =
    html.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/i)?.[1] ||
    youtubeId(html)

  // Header image: a video's thumbnail (also the cross-source dedup identity),
  // else the post's real per-item og:image (skipping generic share cards).
  const ogImage = meta(html, 'og:image')
  const image = primaryVideo
    ? `https://i.ytimg.com/vi/${primaryVideo}/maxresdefault.jpg`
    : ogImage && !GENERIC_SHARE.test(ogImage)
      ? ogImage
      : undefined

  const publishedAt =
    meta(html, 'article:published_time') || lastmod || undefined

  const areaSlug = inferArea(`${title} ${description}`)
  const seg = url.replace(/\/+$/, '').split('/').filter(Boolean).pop() || title
  // Insights are talks/interviews (video) or roadmaps/whitepapers (no video).
  const type = /podcast/i.test(title)
    ? 'Podcast'
    : primaryVideo
      ? 'Talk'
      : 'Publication'

  return {
    key: `plneuro-${slugify(seg)}`,
    title,
    description: description || undefined,
    href: url,
    source: 'PL Neuro',
    sourceKind: 'internal',
    type,
    areaSlug,
    areaLabel: areaLabel(areaSlug),
    image,
    publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
  }
}

export const plNeuro: Source = {
  key: 'plneuro',
  name: 'PL Neuro',
  description: 'Talks, interviews & posts from the PL neurotech program (plneuro.xyz).',
  homepage: 'https://www.plneuro.xyz/',
  keyPrefix: 'plneuro-',
  external: false,

  async fetch(): Promise<Candidate[]> {
    const xml = await fetchText(SITEMAP_URL, 'application/xml,text/xml')
    if (!xml) throw new Error('plneuro sitemap unavailable')

    // Only the article posts; skip section indexes (/insights/ itself), events,
    // and static pages.
    const urls = parseSitemap(xml).filter(({ loc }) =>
      /\/insights\/[^/]+\/?$/.test(loc),
    )

    // N+1 page reads, but small (~dozens) and failure-tolerant: a post that
    // won't load is skipped rather than failing the whole source.
    const settled = await Promise.allSettled(
      urls.map(({ loc, lastmod }) => toCandidate(loc, lastmod)),
    )
    return settled
      .filter(
        (r): r is PromiseFulfilledResult<Candidate> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value)
  },
}
