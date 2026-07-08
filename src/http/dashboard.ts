/**
 * Server-rendered admin/results dashboard.
 *
 * A single self-contained HTML page (no build step, no client framework) that
 * shows the whole state of the crowd curation: the card pool with live Elo,
 * the "who values what" segment breakdown, and a recent-votes feed. It reads
 * the same data the API exposes, so it doubles as the read-only view we ship to
 * the PL app store. Styled on-brand (dark, PL blue, Inter).
 *
 * It auto-refreshes every 30s. It is read-only — no admin mutations here (card
 * management happens via the bot / ingestion pipeline).
 */
import * as repo from '../db/repo.js'
import { globalLeaderboard, attributeWinRates } from '../ranking/segments.js'
import { FOCUS_AREAS, ROLES } from '../types.js'

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const AREA_COLOR: Record<string, string> = {
  'digital-human-rights': '#3966FE',
  'economies-governance': '#12bfdf',
  'ai-robotics': '#7b6cf6',
  neurotech: '#5b7bff',
}

function areaLabel(slug: string): string {
  return FOCUS_AREAS.find((a) => a.slug === slug)?.label ?? slug
}
function roleLabel(key: string): string {
  return ROLES.find((r) => r.key === key)?.label ?? key
}

function bar(pct: number, color: string): string {
  const w = Math.round(pct * 100)
  return `<div class="bar"><div class="fill" style="width:${w}%;background:${color}"></div></div>`
}

function timeAgo(iso: string): string {
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function renderDashboard(): string {
  const cards = repo.getAllCards()
  const board = globalLeaderboard()
  const ranks = new Map(board.map((c, i) => [c.id, i + 1]))
  const areaRates = attributeWinRates('area_slug')
  const typeRates = attributeWinRates('type')
  const kindRates = attributeWinRates('source_kind')
  const votes = repo.recentVotes(15)

  const curators = repo.countCurators()
  const totalVotes = repo.totalVotes()

  const cardRows = cards
    .map((c) => {
      const rank = ranks.get(c.id)
      const color = AREA_COLOR[c.area_slug] ?? '#1982F4'
      return `<tr>
        <td class="rank">${rank ?? '—'}</td>
        <td><b>${Math.round(c.rating)}</b></td>
        <td>${c.matches}</td>
        <td>
          <span class="dot" style="background:${color}"></span>
          ${esc(c.title)}
          ${c.active ? '' : '<span class="pill muted">retired</span>'}
        </td>
        <td class="muted">${esc(areaLabel(c.area_slug))}</td>
        <td class="muted">${esc(c.type)}</td>
        <td>${c.source_kind === 'field' ? '<span class="pill field">field</span>' : '<span class="pill">internal</span>'}</td>
      </tr>`
    })
    .join('')

  const rateBlock = (
    title: string,
    rows: { value: string; winRate: number; appearances: number }[],
    labelFn: (v: string) => string = (v) => v,
  ) =>
    `<div class="card">
      <h3>${title}</h3>
      ${
        rows.length
          ? rows
              .map(
                (r) => `<div class="raterow">
        <div class="ratelabel">${esc(labelFn(r.value))}</div>
        ${bar(r.winRate, '#3966FE')}
        <div class="ratepct">${(r.winRate * 100).toFixed(0)}%</div>
      </div>`,
              )
              .join('')
          : '<p class="muted">No votes yet.</p>'
      }
    </div>`

  const roleCards = ROLES.map((r) => {
    const top = repo.getAllCards().length
      ? attributeWinRates('area_slug', r.key)
      : []
    if (!top.length) return ''
    const rows = top
      .slice(0, 4)
      .map(
        (a) =>
          `<div class="raterow"><div class="ratelabel">${esc(areaLabel(a.value))}</div>${bar(a.winRate, AREA_COLOR[a.value] ?? '#3966FE')}<div class="ratepct">${(a.winRate * 100).toFixed(0)}%</div></div>`,
      )
      .join('')
    return `<div class="card"><h3>${esc(r.emoji)} ${esc(roleLabel(r.key))}</h3>${rows}</div>`
  })
    .filter(Boolean)
    .join('')

  const voteFeed = votes.length
    ? votes
        .map(
          (v) => `<div class="feedrow">
        <span class="dot" style="background:${AREA_COLOR[v.winner_area] ?? '#1982F4'}"></span>
        <b>${esc(v.winner)}</b> <span class="muted">beat</span> ${esc(v.loser)}
        <span class="feedmeta">${v.role ? esc(roleLabel(v.role)) + ' · ' : ''}${timeAgo(v.created_at)}</span>
      </div>`,
        )
        .join('')
    : '<p class="muted">No votes yet — send /vote to the bot.</p>'

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>PL R&D Radar — Curation Dashboard</title>
<style>
  :root { --bg:#0b0d12; --panel:#141821; --line:#232a38; --text:#e8ecf3; --muted:#8b95a7; --brand:#3966FE; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font-family:Inter,system-ui,-apple-system,sans-serif; line-height:1.45; }
  .wrap { max-width:1100px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:24px; margin:0 0 4px; }
  h1 .sig { color:var(--brand); }
  .sub { color:var(--muted); margin:0 0 24px; font-size:14px; }
  .stats { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:28px; }
  .stat { background:var(--panel); border:1px solid var(--line); border-radius:14px;
    padding:14px 18px; min-width:140px; }
  .stat .n { font-size:28px; font-weight:700; }
  .stat .l { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; margin-bottom:28px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  .card h3 { margin:0 0 12px; font-size:14px; }
  .raterow { display:flex; align-items:center; gap:10px; margin:7px 0; font-size:13px; }
  .ratelabel { width:150px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ratepct { width:38px; text-align:right; font-variant-numeric:tabular-nums; }
  .bar { flex:1; height:8px; background:#1d2330; border-radius:6px; overflow:hidden; }
  .fill { height:100%; border-radius:6px; }
  h2 { font-size:16px; margin:26px 0 12px; }
  table { width:100%; border-collapse:collapse; background:var(--panel);
    border:1px solid var(--line); border-radius:14px; overflow:hidden; font-size:13px; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:600; text-transform:uppercase; font-size:11px; letter-spacing:.04em; }
  tr:last-child td { border-bottom:none; }
  td.rank { color:var(--muted); font-variant-numeric:tabular-nums; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:7px; vertical-align:middle; }
  .muted { color:var(--muted); }
  .pill { font-size:11px; padding:2px 8px; border-radius:20px; background:#1d2330; color:var(--muted); margin-left:6px; }
  .pill.field { background:#3b2f10; color:#f5b300; }
  .feedrow { padding:8px 0; border-bottom:1px solid var(--line); font-size:13px; }
  .feedrow:last-child { border-bottom:none; }
  .feedmeta { color:var(--muted); font-size:11px; margin-left:6px; }
  a { color:var(--brand); }
</style></head>
<body><div class="wrap">
  <h1>PL R&D Radar — Curation <span class="sig">Dashboard</span></h1>
  <p class="sub">Live crowd-curation state. Auto-refreshes every 30s · <a href="/api/leaderboard.json">API</a></p>

  <div class="stats">
    <div class="stat"><div class="n">${curators}</div><div class="l">Curators</div></div>
    <div class="stat"><div class="n">${totalVotes}</div><div class="l">Votes cast</div></div>
    <div class="stat"><div class="n">${cards.filter((c) => c.active).length}</div><div class="l">Active cards</div></div>
  </div>

  <h2>Who values what — win-rate by attribute</h2>
  <div class="grid">
    ${rateBlock('By focus area', areaRates, areaLabel)}
    ${rateBlock('By content type', typeRates)}
    ${rateBlock('Internal vs field', kindRates, (v) => (v === 'field' ? 'Field signal' : 'PL R&D internal'))}
  </div>

  ${
    roleCards
      ? `<h2>Focus-area preference by role segment</h2><div class="grid">${roleCards}</div>`
      : ''
  }

  <h2>Card pool — live Elo</h2>
  <table>
    <thead><tr><th>#</th><th>Elo</th><th>Matches</th><th>Card</th><th>Area</th><th>Type</th><th>Source</th></tr></thead>
    <tbody>${cardRows}</tbody>
  </table>

  <h2>Recent votes</h2>
  <div class="card">${voteFeed}</div>
</div></body></html>`
}
