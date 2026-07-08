/**
 * Fetch a pasted URL and pull out the bits needed to draft a card: the title,
 * description/OG tags, a header image, and a chunk of readable body text.
 * Dependency-free (global `fetch` + regex) and defensive — a page that blocks
 * bots or returns junk just yields whatever we could scrape.
 *
 * Because this fetches an arbitrary user-supplied URL server-side, every request
 * goes through `safeFetch`, which blocks private/loopback/link-local hosts (SSRF
 * guard) and re-checks each redirect hop.
 */
import dns from 'node:dns/promises'
import net from 'node:net'

export type PageMeta = {
  url: string
  /** URL after redirects (what we canonicalize/dedup on). */
  finalUrl: string
  title: string
  description: string
  image: string | null
  siteName: string | null
  /** Plain-text body excerpt (tags stripped, capped). */
  text: string
}

const UA =
  'Mozilla/5.0 (compatible; plrd-radar-curator/1.0; +https://github.com/lksbrssr/plrd-radar-curator)'

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

/** First matching `<meta property|name="key" content="…">` value. */
function meta(html: string, key: string): string | null {
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

/** Strip scripts/styles/tags and collapse whitespace into a plain-text excerpt. */
function bodyText(html: string, maxLen = 4000): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  return decode(cleaned.replace(/\s+/g, ' ')).slice(0, maxLen)
}

export class FetchFailedError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'FetchFailedError'
  }
}

/** True for IPs we must never let the server connect to (SSRF guard). */
function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip)
  if (v === 4) {
    const p = ip.split('.').map(Number)
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true
    if (p[0] === 169 && p[1] === 254) return true // link-local + cloud metadata
    if (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) return true
    if (p[0] === 192 && p[1] === 168) return true
    if (p[0] === 100 && p[1]! >= 64 && p[1]! <= 127) return true // CGNAT
    return false
  }
  if (v === 6) {
    const lo = ip.toLowerCase()
    if (lo === '::1' || lo === '::') return true
    if (lo.startsWith('fe80') || lo.startsWith('fc') || lo.startsWith('fd')) return true
    const m = lo.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped
    if (m) return isBlockedIp(m[1]!)
    return false
  }
  return false
}

async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new FetchFailedError('That host is not allowed.')
  }
  if (net.isIP(h)) {
    if (isBlockedIp(h)) throw new FetchFailedError('That address is not allowed.')
    return
  }
  let addrs: { address: string }[]
  try {
    addrs = await dns.lookup(h, { all: true })
  } catch {
    throw new FetchFailedError('Could not resolve that host.')
  }
  if (addrs.some((a) => isBlockedIp(a.address))) {
    throw new FetchFailedError('That host resolves to a blocked address.')
  }
}

/**
 * SSRF-safe fetch: validate the URL scheme + host (no private/loopback/metadata
 * targets) before every hop, following redirects manually so a redirect can't
 * bounce us into the internal network. Throws `FetchFailedError` on a bad URL,
 * blocked host, timeout, or too many redirects.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    let u: URL
    try {
      u = new URL(current)
    } catch {
      throw new FetchFailedError('That is not a valid URL.')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new FetchFailedError('Only http and https URLs are supported.')
    }
    await assertPublicHost(u.hostname)
    let res: Response
    try {
      res = await fetch(current, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      })
    } catch (err) {
      throw new FetchFailedError(`Could not reach the URL (${String(err)}).`)
    }
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString()
      continue
    }
    return res
  }
  throw new FetchFailedError('Too many redirects.')
}

/** Fetch + extract. Throws `FetchFailedError` if the URL is unreachable or the
 *  response clearly isn't an HTML/text page we can read. */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const res = await safeFetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
  })
  if (!res.ok) {
    throw new FetchFailedError(`The site returned HTTP ${res.status}.`)
  }
  const ctype = res.headers.get('content-type') || ''
  if (ctype && !/(text|html|xml|json)/i.test(ctype)) {
    throw new FetchFailedError(`That link is a ${ctype.split(';')[0]}, not a readable page.`)
  }
  const html = await res.text()
  const finalUrl = res.url || url

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title =
    meta(html, 'og:title') ||
    meta(html, 'twitter:title') ||
    (titleTag ? decode(titleTag[1]!) : '') ||
    ''
  const description =
    meta(html, 'og:description') ||
    meta(html, 'twitter:description') ||
    meta(html, 'description') ||
    ''
  const image = meta(html, 'og:image') || meta(html, 'twitter:image') || null
  const siteName = meta(html, 'og:site_name')

  return {
    url,
    finalUrl,
    title,
    description,
    image: image ? decode(image) : null,
    siteName,
    text: bodyText(html),
  }
}
