/**
 * Fetch a pasted URL and pull out the bits an LLM needs to write a card:
 * the title, description/OG tags, a header image, and a chunk of readable body
 * text. Dependency-free (global `fetch` + regex) and defensive — a page that
 * blocks bots or returns junk just yields whatever we could scrape, and the
 * caller decides whether that's enough.
 */

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

/** Fetch + extract. Throws `FetchFailedError` if the URL is unreachable or the
 *  response clearly isn't an HTML/text page we can read. */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new FetchFailedError(`Could not reach the URL (${String(err)})`)
  }
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
