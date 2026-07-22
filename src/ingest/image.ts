/**
 * Header-image resolution for ingestion.
 *
 * A candidate's image can be missing or dead: a source ships a generic share
 * image that 404s (e.g. PL Neuro event pages), or a YouTube `maxresdefault`
 * thumbnail that doesn't exist for that video. This module validates the image
 * and, when it's broken, falls back to the source page's real hero image:
 *
 *   1. keep the current image if it still loads;
 *   2. for a dead YouTube maxres thumbnail, use `hqdefault` (always exists);
 *   3. otherwise scrape the page for a hero (og:image → preloaded image → the
 *      first prominent <img>) and use the first candidate that actually loads.
 *
 * Best-effort and dependency-free (global `fetch` + regex). Every request is
 * short-timeout and failure-tolerant; if nothing can be confirmed we return
 * `null` so the UI shows its neutral placeholder instead of a broken tile.
 */

const UA =
  'Mozilla/5.0 (compatible; plrd-radar-curator/1.0; +https://github.com/lksbrssr/pl-radar)'

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

/** Resolve a (possibly relative) src against the page URL. */
function absolute(src: string, base: string): string | null {
  try {
    return new URL(src.trim(), base).toString()
  } catch {
    return null
  }
}

// Obvious non-hero images we never want to promote to a card header.
const JUNK =
  /(logo|icon|favicon|sprite|avatar|participant|headshot|placeholder|spacer|pixel|1x1|blank|badge|emoji)/i

// Site-wide generic share cards. These load fine (so `isValidImage` passes) but
// carry no per-item signal — they're the same neutral PL logo card on every
// page. We treat them as replaceable: prefer any real hero (e.g. an embedded
// video thumbnail) and only keep the generic card as a last resort.
const GENERIC_SHARE =
  /(pl_research_card|plneuro-share-image|pl[-_]?share|default[-_]?share|og[-_]?default|share[-_]?image)/i

/** YouTube video ids referenced by embeds/links in a page's HTML, first-seen. */
function youtubeIdsInHtml(html: string): string[] {
  const re =
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?[^"'&]*\bv=|embed\/|shorts\/)|ytimg\.com\/vi\/)([A-Za-z0-9_-]{11})/gi
  const seen: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) if (!seen.includes(m[1]!)) seen.push(m[1]!)
  return seen
}

/** First `<meta property|name="key" content="…">` value. */
function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+\\bcontent=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m && m[1]) return decode(m[1])
  }
  return null
}

/** HEAD-ish check that a URL serves a real image (2xx + `image/*`). */
export async function isValidImage(url: string): Promise<boolean> {
  if (!/^https?:\/\/\S+$/i.test(url)) return false
  try {
    const res = await fetch(url, {
      method: 'GET',
      // Ask for a single byte — enough to see the status + content-type without
      // pulling the whole image. Servers that ignore Range just send 200.
      headers: { 'user-agent': UA, range: 'bytes=0-0', accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok && res.status !== 206) return false
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    // A 200 that serves HTML (soft-404) is not a valid image.
    if (ct && !ct.startsWith('image/')) return false
    return true
  } catch {
    return false
  }
}

/** Ordered, de-duplicated list of candidate hero-image URLs scraped from a page. */
export async function heroImagesFromPage(pageUrl: string): Promise<string[]> {
  let html = ''
  let finalUrl = pageUrl
  try {
    const res = await fetch(pageUrl, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []
    const ct = res.headers.get('content-type') || ''
    if (ct && !/(text|html|xml)/i.test(ct)) return []
    html = await res.text()
    finalUrl = res.url || pageUrl
  } catch {
    return []
  }

  const out: string[] = []
  const push = (src?: string | null) => {
    if (!src) return
    const abs = absolute(decode(src), finalUrl)
    // Never promote a site-wide generic share card as a "real" hero.
    if (abs && !GENERIC_SHARE.test(abs) && !out.includes(abs)) out.push(abs)
  }

  // 0. Embedded video (talks/podcasts): the video thumbnail is the real hero,
  //    even when the page's og:image is only a generic share card. maxres first
  //    (nicer), hqdefault as the guaranteed-to-exist fallback.
  for (const id of youtubeIdsInHtml(html)) {
    push(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`)
    push(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)
  }

  // 1. Social / OG images (highest intent).
  push(metaContent(html, 'og:image'))
  push(metaContent(html, 'twitter:image'))
  push(metaContent(html, 'twitter:image:src'))

  // 2. Explicitly preloaded hero image (Next.js & friends).
  const preloads = html.match(/<link\b[^>]*\brel=["']preload["'][^>]*>/gi) || []
  for (const p of preloads) {
    if (!/\bas=["']image["']/i.test(p)) continue
    push(p.match(/\bhref=["']([^"']+)["']/i)?.[1])
    const srcset = p.match(/\bimagesrcset=["']([^"']+)["']/i)?.[1]
    if (srcset) push(srcset.split(',')[0]?.trim().split(/\s+/)[0])
  }

  // 3. Prominent <img>: prefer ones declaring a large width, skip page chrome.
  const large: string[] = []
  const rest: string[] = []
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1]
    if (!src || src.startsWith('data:') || JUNK.test(src)) continue
    const w = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1] || 0)
    if (w >= 600) large.push(src)
    else rest.push(src)
  }
  large.forEach(push)
  rest.slice(0, 3).forEach(push)

  return out
}

/**
 * Resolve the best working image for a candidate. Returns a confirmed-loading
 * image URL, or `null` if none could be verified. Does at most one page fetch
 * (only when the current image is missing/broken and no YouTube fallback works).
 */
export async function resolveCardImage(input: {
  image?: string | null
  href?: string | null
}): Promise<string | null> {
  const current = input.image || null
  const currentIsGeneric = current ? GENERIC_SHARE.test(current) : false
  // A real, per-item image that still loads is always kept. A generic share
  // card is only kept if we can't find something better below.
  if (current && !currentIsGeneric && (await isValidImage(current))) return current

  // Dead YouTube maxres → hqdefault (guaranteed to exist for a real video).
  const yt = current?.match(/ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\/maxresdefault\.jpg/i)
  if (yt) {
    const hq = `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`
    if (await isValidImage(hq)) return hq
  }

  if (input.href) {
    for (const cand of await heroImagesFromPage(input.href)) {
      if (await isValidImage(cand)) return cand
    }
  }

  // Nothing better found: fall back to a generic share card if it at least
  // loads, so the tile isn't empty.
  if (current && currentIsGeneric && (await isValidImage(current))) return current

  return null
}
