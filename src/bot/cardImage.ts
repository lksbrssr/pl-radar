/**
 * Renders a match-up as a single composite PNG that looks like the public
 * Radar: two stacked card panels (🅰 top, 🅱 bottom) with the same area-tinted
 * gradients, cover images, and titles. We send ONE image per comparison and
 * swap it in place with editMessageMedia, so a whole round is one live card.
 *
 * Uses @napi-rs/canvas (prebuilt native binaries, no system deps) so it runs
 * identically on macOS and in the slim Docker image. Inter is bundled and
 * registered for on-brand, deterministic text (no reliance on system fonts).
 */
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type SKRSContext2D,
  type Image,
} from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Card } from '../types.js'

const here = dirname(fileURLToPath(import.meta.url))
GlobalFonts.registerFromPath(
  resolve(here, '../assets/fonts/Inter.ttf'),
  'Inter',
)

// Area gradients copied verbatim from plrd.org PLRadar.tsx so the bot and the
// public Radar look identical.
const AREA_GRADIENT: Record<string, { from: string; via: string; to: string }> = {
  'digital-human-rights': { from: '#0b1f4d', via: '#1e3a8a', to: '#3966FE' },
  'economies-governance': { from: '#0a3b2e', via: '#0f6b4c', to: '#12bfdf' },
  'ai-robotics': { from: '#2a1b4d', via: '#4834c4', to: '#7b6cf6' },
  neurotech: { from: '#141a52', via: '#2340c9', to: '#5b7bff' },
  default: { from: '#0d0f13', via: '#1d2b5c', to: '#1982F4' },
}

// Side-by-side layout (🅰 left, 🅱 right) so the panels line up with the
// left/right vote buttons.
const W = 840
const H = 560
const PAD = 18
const GAP = 60 // middle channel that holds the VS badge
const PANEL_W = (W - PAD * 2 - GAP) / 2
const PANEL_H = H - PAD * 2
const RADIUS = 26

// --- Remote cover image cache (fetched once, reused across rounds) ----------
const imageCache = new Map<string, Image | null>()

async function fetchCover(url: string | null): Promise<Image | null> {
  if (!url) return null
  if (imageCache.has(url)) return imageCache.get(url)!
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3500)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error(`status ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const img = await loadImage(buf)
    imageCache.set(url, img)
    return img
  } catch {
    imageCache.set(url, null) // negative-cache so we don't retry every render
    return null
  }
}

function roundedRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Word-wrap `text` to `maxWidth`, capped at `maxLines` (last line ellipsized). */
function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines - 1) break
    } else {
      line = test
    }
  }
  if (lines.length < maxLines) lines.push(line)
  // Ellipsize if we ran out of room.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1]!
    const remainder = words.slice(
      lines.slice(0, maxLines - 1).join(' ').split(/\s+/).filter(Boolean).length,
    )
    if (remainder.join(' ').length > last.length) {
      while (
        ctx.measureText(last + '…').width > maxWidth &&
        last.length > 0
      ) {
        last = last.slice(0, -1)
      }
      lines[maxLines - 1] = last.trimEnd() + '…'
    }
  }
  return lines
}

function drawPanel(
  ctx: SKRSContext2D,
  card: Card,
  cover: Image | null,
  x: number,
  y: number,
  w: number,
  h: number,
  slot: 'A' | 'B',
  reigning: boolean,
) {
  ctx.save()
  roundedRectPath(ctx, x, y, w, h, RADIUS)
  ctx.clip()

  // Background: cover image (cover-fit) or the area gradient.
  if (cover) {
    const scale = Math.max(w / cover.width, h / cover.height)
    const dw = cover.width * scale
    const dh = cover.height * scale
    ctx.drawImage(cover, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  } else {
    const g = AREA_GRADIENT[card.area_slug] ?? AREA_GRADIENT.default!
    const grad = ctx.createLinearGradient(x, y, x + w, y + h)
    grad.addColorStop(0, g.from)
    grad.addColorStop(0.55, g.via)
    grad.addColorStop(1, g.to)
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)
  }

  // Bottom scrim for text legibility.
  const scrim = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h)
  scrim.addColorStop(0, 'rgba(0,0,0,0)')
  scrim.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.fillStyle = scrim
  ctx.fillRect(x, y, w, h)

  // Slot badge (top-left): a clean lettered square, no emoji (portable).
  const bx = x + 22
  const by = y + 22
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundedRectPath(ctx, bx, by, 52, 52, 14)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 2
  roundedRectPath(ctx, bx, by, 52, 52, 14)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = '700 30px Inter'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(slot, bx + 26, by + 28)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Reigning pill (top-right).
  if (reigning) {
    ctx.font = '700 20px Inter'
    const label = 'REIGNING'
    const pw = ctx.measureText(label).width + 40
    const px = x + w - 22 - pw
    ctx.fillStyle = '#F5B300'
    roundedRectPath(ctx, px, y + 24, pw, 34, 17)
    ctx.fill()
    ctx.fillStyle = '#1a1a1a'
    ctx.fillText('\u2022 ' + label, px + 16, y + 47)
  }

  // --- Text block, anchored to the BOTTOM so it never clips. ---
  const tx = x + 24
  const textW = w - 48
  const lineH = 34

  // Source line (only "Field signal" prefix when the card is external).
  const sourceText = card.source
    ? card.source_kind === 'field'
      ? `Field signal · ${card.source}`
      : card.source
    : ''

  // Measure the title first so we know how tall the block is. Narrow columns
  // wrap more, so allow up to 3 lines.
  ctx.font = '700 29px Inter'
  const titleLines = wrapText(ctx, card.title, textW, 3)

  const sourceBaseline = y + h - 24
  const titleBottomBaseline = sourceText ? sourceBaseline - 32 : sourceBaseline
  const firstTitleBaseline = titleBottomBaseline - (titleLines.length - 1) * lineH
  const areaBaseline = firstTitleBaseline - lineH - 6

  // Area + type caption.
  ctx.font = '700 16px Inter'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(
    `${card.area_label.toUpperCase()}  ·  ${card.type.toUpperCase()}`,
    tx,
    areaBaseline,
  )

  // Title.
  ctx.font = '700 29px Inter'
  ctx.fillStyle = '#ffffff'
  titleLines.forEach((line, i) => {
    ctx.fillText(line, tx, firstTitleBaseline + i * lineH)
  })

  // Source.
  if (sourceText) {
    ctx.font = '400 18px Inter'
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.fillText(sourceText, tx, sourceBaseline)
  }

  ctx.restore()
}

/**
 * Render the full match-up image. `reigningSlot` marks which panel survived the
 * previous comparison (null on the first), so the winner visibly *stays put*.
 */
export async function renderMatchup(
  top: Card,
  bottom: Card,
  reigningSlot: 'a' | 'b' | null,
): Promise<Buffer> {
  const [topCover, bottomCover] = await Promise.all([
    fetchCover(top.image),
    fetchCover(bottom.image),
  ])

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Backdrop.
  ctx.fillStyle = '#0b0d12'
  ctx.fillRect(0, 0, W, H)

  const leftX = PAD
  const rightX = PAD + PANEL_W + GAP
  drawPanel(ctx, top, topCover, leftX, PAD, PANEL_W, PANEL_H, 'A', reigningSlot === 'a')
  drawPanel(ctx, bottom, bottomCover, rightX, PAD, PANEL_W, PANEL_H, 'B', reigningSlot === 'b')

  // VS badge, centred in the middle channel.
  const vsX = W / 2
  const vsY = H / 2
  ctx.fillStyle = '#3966FE'
  ctx.beginPath()
  ctx.arc(vsX, vsY, 32, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '800 24px Inter'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', vsX, vsY + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  return canvas.toBuffer('image/png')
}
