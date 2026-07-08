/**
 * Server-rendered public dashboard, styled to match plrd.org.
 *
 * Design language mirrors the site: Inter (body) + Newsreader (serif headings),
 * light palette (ink #131316, blue #1982F4/#3966FE, warm/cool grays), rounded
 * white cards, black pill buttons. A light/dark toggle remaps the tokens the
 * same way plrd.org does. No auth — this is public by design.
 *
 * Content is organised by monthly EDITION, because news items expire:
 *   • "This month" — the current edition, open for voting, with live Elo.
 *   • "Published Radars" — past editions, showing the selected winners (the
 *     Radar as shipped) with click-through provenance (Elo, votes, win-rate).
 *
 * Clicking any card opens a pop-out modal with the full card + where it came
 * from. All data is embedded server-side; a tiny inline script drives the modal
 * and theme toggle (no framework, no build step).
 */
import * as repo from '../db/repo.js'
import { attributeWinRates } from '../ranking/segments.js'
import { FOCUS_AREAS, ROLES, type Card } from '../types.js'
import { currentEdition, editionLabel } from '../config.js'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Area gradients, matching plrd.org / the match-up image.
const AREA_GRAD: Record<string, [string, string, string]> = {
  'digital-human-rights': ['#0b1f4d', '#1e3a8a', '#3966FE'],
  'economies-governance': ['#0a3b2e', '#0f6b4c', '#12bfdf'],
  'ai-robotics': ['#2a1b4d', '#4834c4', '#7b6cf6'],
  neurotech: ['#141a52', '#2340c9', '#5b7bff'],
  default: ['#0d0f13', '#1d2b5c', '#1982F4'],
}
function gradCss(slug: string): string {
  const g = AREA_GRAD[slug] ?? AREA_GRAD.default!
  return `linear-gradient(135deg, ${g[0]}, ${g[1]} 55%, ${g[2]})`
}
function areaColor(slug: string): string {
  return (AREA_GRAD[slug] ?? AREA_GRAD.default!)[2]
}
function areaLabel(slug: string): string {
  return FOCUS_AREAS.find((a) => a.slug === slug)?.label ?? slug
}
function roleLabel(key: string): string {
  return ROLES.find((r) => r.key === key)?.label ?? key
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '\u2026' : s
}
function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function bar(pct: number, color: string): string {
  return `<div class="bar"><div class="fill" style="width:${Math.round(pct * 100)}%;background:${color}"></div></div>`
}
function focusChips(slugs: string[]): string {
  if (!slugs.length) return '<span class="muted">all areas</span>'
  return slugs
    .map(
      (s) =>
        `<span class="chip"><i style="background:${areaColor(s)}"></i>${esc(areaLabel(s))}</span>`,
    )
    .join(' ')
}

/** A Radar-style card tile (used in current pool + published editions). */
function cardTile(c: Card): string {
  const media = c.image
    ? `<img src="${esc(c.image)}" alt="" loading="lazy">`
    : `<div class="ph" style="background:${gradCss(c.area_slug)}"></div>`
  return `<button class="tile" data-card="${c.id}">
    <div class="tile-media">${media}
      <span class="tile-area" style="background:${areaColor(c.area_slug)}">${esc(areaLabel(c.area_slug))}</span>
    </div>
    <div class="tile-body">
      <span class="kicker">${esc(c.type)}${c.source ? ' · ' + esc(c.source) : ''}</span>
      <h4>${esc(truncate(c.title, 84))}</h4>
    </div>
  </button>`
}

export function renderDashboard(): string {
  const cur = currentEdition()
  const allCards = repo.getAllCards()
  const wins = repo.cardWinCounts()
  const curatorList = repo.listCuratorsWithStats()
  const curators = repo.countCurators()
  const totalVotes = repo.totalVotes()
  const editions = repo.listEditions()

  // Group cards by edition, preserving rating-desc order from getAllCards.
  const byEdition = new Map<string, Card[]>()
  for (const c of allCards) {
    const e = c.edition ?? 'undated'
    if (!byEdition.has(e)) byEdition.set(e, [])
    byEdition.get(e)!.push(c)
  }
  const currentCards = byEdition.get(cur) ?? []
  const pastEditions = editions.filter((e) => e.edition !== cur)

  // --- Card data for the modal (client-side lookup by id) ---
  const cardData: Record<number, unknown> = {}
  for (const c of allCards) {
    const w = wins.get(c.id) ?? 0
    cardData[c.id] = {
      title: c.title,
      description: c.description,
      image: c.image,
      href: c.href,
      area: areaLabel(c.area_slug),
      areaColor: areaColor(c.area_slug),
      grad: gradCss(c.area_slug),
      type: c.type,
      source: c.source,
      sourceKind: c.source_kind,
      edition: c.edition ? editionLabel(c.edition) : '—',
      rating: Math.round(c.rating),
      matches: c.matches,
      wins: w,
      winRate: c.matches ? Math.round((w / c.matches) * 100) : 0,
    }
  }

  // --- Segment win-rate blocks ---
  const rateBlock = (
    title: string,
    rows: { value: string; winRate: number }[],
    labelFn: (v: string) => string = (v) => v,
    colorFn: (v: string) => string = () => '#1982F4',
  ) =>
    `<div class="panel">
      <h3>${title}</h3>
      ${
        rows.length
          ? rows
              .map(
                (r) =>
                  `<div class="raterow"><span class="ratelabel">${esc(labelFn(r.value))}</span>${bar(r.winRate, colorFn(r.value))}<span class="ratepct">${(r.winRate * 100).toFixed(0)}%</span></div>`,
              )
              .join('')
          : '<p class="muted">No votes yet.</p>'
      }
    </div>`

  const roleBlocks = ROLES.map((r) => {
    if (!totalVotes) return ''
    const rates = attributeWinRates('area_slug', r.key)
    if (!rates.length) return ''
    const rows = rates
      .slice(0, 4)
      .map(
        (a) =>
          `<div class="raterow"><span class="ratelabel">${esc(areaLabel(a.value))}</span>${bar(a.winRate, areaColor(a.value))}<span class="ratepct">${(a.winRate * 100).toFixed(0)}%</span></div>`,
      )
      .join('')
    return `<div class="panel"><h3>${esc(r.emoji)} ${esc(roleLabel(r.key))}</h3>${rows}</div>`
  })
    .filter(Boolean)
    .join('')

  // --- Current edition pool ---
  const currentGrid = currentCards.length
    ? `<div class="tiles">${currentCards.map(cardTile).join('')}</div>`
    : '<div class="panel"><p class="muted">No cards in this edition yet.</p></div>'

  // --- Published (past) editions ---
  const publishedHtml = pastEditions.length
    ? pastEditions
        .map((e) => {
          const cards = (byEdition.get(e.edition) ?? []).slice(0, 6)
          return `<div class="edition">
        <div class="edition-head">
          <h3>${esc(editionLabel(e.edition))}</h3>
          <span class="muted">selected from ${e.votes ?? 0} votes · ${e.cards} candidates</span>
        </div>
        <div class="tiles">${cards.map(cardTile).join('')}</div>
      </div>`
        })
        .join('')
    : '<div class="panel"><p class="muted">No published editions yet — this month is the first Radar.</p></div>'

  // --- Curators table ---
  const curatorRows = curatorList.length
    ? curatorList
        .map((c) => {
          const name = esc(c.first_name || 'Curator')
          const handle = c.username ? `<span class="muted">@${esc(c.username)}</span>` : ''
          const cad = c.cadence && c.cadence > 0 ? `${c.cadence}/day` : 'surprise'
          const paused = c.status === 'paused' ? '<span class="pill">paused</span>' : ''
          return `<tr>
            <td>${name} ${handle} ${paused}</td>
            <td class="muted">${c.role ? esc(roleLabel(c.role)) : '\u2014'}</td>
            <td>${focusChips(c.focus)}</td>
            <td><b>${c.votes}</b></td>
            <td class="muted">${cad}</td>
            <td class="muted">${timeAgo(c.last_active_at)}</td>
          </tr>`
        })
        .join('')
    : ''

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>PL R&D Radar — Curation Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet">
<script>(function(){try{var t=localStorage.getItem('radar-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();</script>
<style>
  :root{
    --white:#ffffff; --ink:#131316; --ink-soft:#34373F;
    --gray-50:#F8F7F3; --gray-100:#F6F9FD; --gray-200:#eef1f6; --line:#e6e9f0;
    --muted:#5f6270; --blue:#1982F4; --blue-500:#3966FE; --teal:#12bfdf;
  }
  html.dark{
    --white:#15171c; --ink:#E9E9EE; --ink-soft:#C9CBD3;
    --gray-50:#1c1f26; --gray-100:#1c1f26; --gray-200:#21242c; --line:#262a33;
    --muted:#9EA2AF; --blue:#3B96F6;
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--white);color:var(--ink);
    font-family:Inter,system-ui,sans-serif;font-size:16px;line-height:1.5;
    -webkit-font-smoothing:antialiased;}
  h1,h2,h3,h4{font-family:Newsreader,Georgia,serif;font-weight:500;line-height:1.15;margin:0;}
  .wrap{max-width:1120px;margin:0 auto;padding:28px 20px 80px;}
  a{color:var(--blue);text-decoration:none;} a:hover{text-decoration:underline;}
  .muted{color:var(--muted);}
  /* header */
  header{display:flex;align-items:center;justify-content:space-between;gap:16px;
    padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:28px;flex-wrap:wrap;}
  .brand{display:flex;align-items:center;gap:12px;}
  .brand .dot{width:22px;height:22px;border-radius:50%;
    background:radial-gradient(circle at 30% 30%,#5b8cff,#1982F4 60%,#3966FE);}
  .brand .wm{font-weight:700;letter-spacing:.14em;font-size:15px;font-family:Inter;}
  .brand .sub{color:var(--muted);font-size:13px;}
  .toggle{border:1px solid var(--line);background:var(--white);color:var(--ink);
    border-radius:999px;padding:8px 14px;font-size:13px;cursor:pointer;font-family:Inter;}
  /* stats */
  .stats{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:34px;}
  .stat{background:var(--gray-50);border:1px solid var(--line);border-radius:16px;padding:16px 20px;min-width:150px;}
  .stat .n{font-family:Newsreader,serif;font-size:34px;line-height:1;}
  .stat .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-top:6px;}
  /* section titles */
  h2{font-size:26px;margin:38px 0 6px;}
  .lead{color:var(--muted);margin:0 0 18px;font-size:14px;}
  .live{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
    color:#0a8f43;background:#e7f7ee;padding:3px 10px;border-radius:999px;font-family:Inter;}
  html.dark .live{background:#0f2a1c;color:#4ade80;}
  .live i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block;
    animation:pulse 1.6s infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  /* grids */
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:14px;}
  .panel{background:var(--gray-50);border:1px solid var(--line);border-radius:16px;padding:18px 20px;}
  .panel h3{font-size:16px;margin-bottom:12px;}
  .raterow{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px;}
  .ratelabel{width:150px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ratepct{width:38px;text-align:right;font-variant-numeric:tabular-nums;}
  .bar{flex:1;height:8px;background:var(--gray-200);border-radius:6px;overflow:hidden;}
  .fill{height:100%;border-radius:6px;}
  /* tiles */
  .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin-bottom:8px;}
  .tile{text-align:left;padding:0;border:1px solid var(--line);background:var(--white);
    border-radius:16px;overflow:hidden;cursor:pointer;font-family:inherit;color:inherit;
    transition:transform .12s ease,box-shadow .12s ease;display:flex;flex-direction:column;}
  .tile:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(19,19,22,.10);}
  .tile-media{position:relative;aspect-ratio:16/10;background:var(--gray-200);}
  .tile-media img,.tile-media .ph{width:100%;height:100%;object-fit:cover;display:block;}
  .tile-area{position:absolute;left:10px;bottom:10px;color:#fff;font-size:10px;font-weight:600;
    letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}
  .tile-body{padding:12px 14px 16px;}
  .kicker{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);}
  .tile-body h4{font-size:18px;margin-top:6px;}
  /* tables */
  table{width:100%;border-collapse:collapse;background:var(--gray-50);
    border:1px solid var(--line);border-radius:16px;overflow:hidden;font-size:13px;margin-top:6px;}
  th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);}
  th{color:var(--muted);font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.04em;}
  tr:last-child td{border-bottom:none;}
  .chip{display:inline-flex;align-items:center;font-size:11px;padding:2px 9px;border-radius:999px;
    background:var(--gray-200);margin:1px 2px;white-space:nowrap;}
  .chip i{width:7px;height:7px;border-radius:50%;margin-right:5px;}
  .pill{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--gray-200);color:var(--muted);margin-left:6px;}
  .edition{margin-bottom:26px;}
  .edition-head{display:flex;align-items:baseline;gap:12px;margin-bottom:12px;flex-wrap:wrap;}
  .edition-head h3{font-size:22px;}
  /* modal */
  .modal{position:fixed;inset:0;background:rgba(19,19,22,.55);display:none;
    align-items:center;justify-content:center;padding:20px;z-index:50;}
  .modal.open{display:flex;}
  .sheet{background:var(--white);border-radius:20px;max-width:560px;width:100%;
    overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4);max-height:90vh;overflow-y:auto;}
  .sheet-media{aspect-ratio:16/9;position:relative;}
  .sheet-media img,.sheet-media .ph{width:100%;height:100%;object-fit:cover;display:block;}
  .sheet-area{position:absolute;left:16px;bottom:14px;color:#fff;font-size:11px;font-weight:600;
    letter-spacing:.05em;text-transform:uppercase;padding:4px 10px;border-radius:999px;}
  .sheet-body{padding:22px 24px 26px;}
  .sheet-body .kicker{display:block;margin-bottom:6px;}
  .sheet-body h3{font-size:26px;margin-bottom:10px;}
  .sheet-body p.desc{color:var(--ink-soft);margin:0 0 18px;}
  .prov{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;}
  .prov .box{background:var(--gray-50);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center;}
  .prov .box .n{font-family:Newsreader,serif;font-size:24px;}
  .prov .box .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
  .btn{display:inline-block;background:var(--ink);color:var(--white);border-radius:999px;
    padding:11px 20px;font-size:14px;font-weight:500;}
  .btn:hover{text-decoration:none;opacity:.9;}
  .close{position:absolute;top:12px;right:14px;background:rgba(0,0,0,.4);color:#fff;border:none;
    width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;}
</style></head>
<body><div class="wrap">
  <header>
    <div class="brand">
      <span class="dot"></span>
      <div>
        <div class="wm">PL R&amp;D RADAR</div>
        <div class="sub">Crowd curation · which signals make the Radar</div>
      </div>
    </div>
    <button class="toggle" id="themeToggle">◐ Theme</button>
  </header>

  <div class="stats">
    <div class="stat"><div class="n">${curators}</div><div class="l">Curators</div></div>
    <div class="stat"><div class="n">${totalVotes}</div><div class="l">Votes cast</div></div>
    <div class="stat"><div class="n">${currentCards.length}</div><div class="l">In the running</div></div>
    <div class="stat"><div class="n">${pastEditions.length}</div><div class="l">Published Radars</div></div>
  </div>

  <h2>${esc(editionLabel(cur))} <span class="live"><i></i>voting open</span></h2>
  <p class="lead">Curators are voting on these now. The highest-signal cards become this month's public Radar. Tap a card for details.</p>
  ${currentGrid}

  <h2>Who values what</h2>
  <p class="lead">Win-rate by attribute, from every pairwise vote — a read on what the crowd (and each segment) rewards.</p>
  <div class="grid">
    ${rateBlock('By focus area', attributeWinRates('area_slug'), areaLabel, areaColor)}
    ${rateBlock('By content type', attributeWinRates('type'))}
    ${rateBlock('Internal vs field', attributeWinRates('source_kind'), (v) => (v === 'field' ? 'Field signal' : 'PL R&D internal'))}
  </div>
  ${roleBlocks ? `<div class="grid">${roleBlocks}</div>` : ''}

  <h2>Curators (${curators})</h2>
  <p class="lead">Who's shaping the Radar. Roles &amp; focus areas power the segment analysis above.</p>
  ${
    curatorRows
      ? `<table><thead><tr><th>Curator</th><th>Role</th><th>Focus areas</th><th>Votes</th><th>Cadence</th><th>Last active</th></tr></thead><tbody>${curatorRows}</tbody></table>`
      : '<div class="panel"><p class="muted">No curators onboarded yet — share the bot and have people send it <b>/start</b>.</p></div>'
  }

  <h2>Published Radars</h2>
  <p class="lead">Past months, as shipped. Each card was chosen by the crowd — tap to see the votes behind it.</p>
  ${publishedHtml}
</div>

<div class="modal" id="modal">
  <div class="sheet">
    <div class="sheet-media" id="m-media"><button class="close" id="m-close">×</button></div>
    <div class="sheet-body">
      <span class="kicker" id="m-kicker"></span>
      <h3 id="m-title"></h3>
      <p class="desc" id="m-desc"></p>
      <div class="prov">
        <div class="box"><div class="n" id="m-rating"></div><div class="l">Elo score</div></div>
        <div class="box"><div class="n" id="m-votes"></div><div class="l">Votes in</div></div>
        <div class="box"><div class="n" id="m-winrate"></div><div class="l">Win rate</div></div>
      </div>
      <a class="btn" id="m-link" target="_blank" rel="noopener">Open source →</a>
    </div>
  </div>
</div>

<script id="carddata" type="application/json">${JSON.stringify(cardData)}</script>
<script>
  var CARDS = JSON.parse(document.getElementById('carddata').textContent);
  var modal = document.getElementById('modal');
  function openCard(id){
    var c = CARDS[id]; if(!c) return;
    var media = document.getElementById('m-media');
    media.style.background = c.grad;
    media.querySelectorAll('img,.ph').forEach(function(n){n.remove();});
    if(c.image){ var img=document.createElement('img'); img.src=c.image; media.insertBefore(img, media.firstChild); }
    else { var ph=document.createElement('div'); ph.className='ph'; media.insertBefore(ph, media.firstChild); }
    document.getElementById('m-kicker').textContent = c.type + (c.source? ' · ' + c.source : '') + ' · ' + c.edition;
    document.getElementById('m-title').textContent = c.title;
    document.getElementById('m-desc').textContent = c.description || '';
    document.getElementById('m-rating').textContent = c.rating;
    document.getElementById('m-votes').textContent = c.matches;
    document.getElementById('m-winrate').textContent = c.winRate + '%';
    document.getElementById('m-link').href = c.href;
    modal.classList.add('open');
  }
  document.querySelectorAll('[data-card]').forEach(function(el){
    el.addEventListener('click', function(){ openCard(el.getAttribute('data-card')); });
  });
  function closeModal(){ modal.classList.remove('open'); }
  document.getElementById('m-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeModal(); });

  var toggle = document.getElementById('themeToggle');
  toggle.addEventListener('click', function(){
    var dark = document.documentElement.classList.toggle('dark');
    try{ localStorage.setItem('radar-theme', dark?'dark':'light'); }catch(e){}
  });
</script>
</body></html>`
}
