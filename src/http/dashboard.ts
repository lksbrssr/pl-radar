/**
 * Single-page app shell, styled to match plrd.org (Inter body + Newsreader
 * serif headings, light palette, rounded cards, black pill buttons, light/dark
 * toggle). Public by design — no auth.
 *
 * Left sidebar routes (hash-based) to three views:
 *   • Radar — the published Radar for a chosen month, as a swipeable carousel
 *     (top 5 cards + "you're all caught up" + Share on X) recycled from
 *     plrd.org/insights. A month selector picks the edition; a "lens" selector
 *     switches between the General Radar (all votes) and a peer segment (your
 *     role or focus area) — "what people like you found most relevant".
 *   • Vote — participate in voting on the web (full flow lands in the next PR;
 *     for now it points to the Telegram bot).
 *   • Data — the curation analytics: who-values-what, curators, and the full
 *     monthly card pool (click a card for provenance).
 *
 * The shell is static HTML; all content is fetched client-side from /api/*.json
 * (no framework, no build step).
 */

export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PL R&D Radar — Crowd Curation</title>
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
    font-family:Inter,system-ui,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;}
  h1,h2,h3,h4{font-family:Newsreader,Georgia,serif;font-weight:500;line-height:1.15;margin:0;}
  a{color:var(--blue);text-decoration:none;} a:hover{text-decoration:underline;}
  .muted{color:var(--muted);}
  button{font-family:inherit;}
  /* layout */
  .app{display:flex;min-height:100vh;}
  .sidebar{width:236px;flex:none;border-right:1px solid var(--line);padding:24px 18px;
    display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh;}
  .brand{display:flex;align-items:center;gap:11px;margin-bottom:22px;}
  .brand .dot{width:22px;height:22px;border-radius:50%;flex:none;
    background:radial-gradient(circle at 30% 30%,#5b8cff,#1982F4 60%,#3966FE);}
  .brand .wm{font-weight:700;letter-spacing:.12em;font-size:14px;}
  .brand .sub{color:var(--muted);font-size:11.5px;margin-top:1px;}
  .nav{display:flex;flex-direction:column;gap:3px;}
  .nav button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;
    background:none;border:none;color:var(--ink);padding:10px 12px;border-radius:10px;
    font-size:14.5px;cursor:pointer;}
  .nav button:hover{background:var(--gray-50);}
  .nav button.active{background:var(--gray-200);font-weight:600;}
  .nav .ic{width:18px;text-align:center;}
  .side-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px;}
  .toggle{border:1px solid var(--line);background:var(--white);color:var(--ink);
    border-radius:999px;padding:8px 12px;font-size:12.5px;cursor:pointer;}
  .side-foot .tg{font-size:12px;color:var(--muted);}
  .main{flex:1;min-width:0;}
  .wrap{max-width:1000px;margin:0 auto;padding:32px 28px 80px;}
  @media(max-width:720px){
    .app{flex-direction:column;} .sidebar{width:auto;height:auto;position:static;
      flex-direction:row;flex-wrap:wrap;align-items:center;border-right:none;border-bottom:1px solid var(--line);}
    .brand{margin-bottom:0;margin-right:auto;} .nav{flex-direction:row;} .side-foot{margin:0;flex-direction:row;}
    .wrap{padding:22px 16px 60px;}
  }
  /* headings */
  h2.title{font-size:30px;margin-bottom:4px;}
  .lead{color:var(--muted);margin:0 0 18px;font-size:14px;}
  .live{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
    color:#0a8f43;background:#e7f7ee;padding:3px 10px;border-radius:999px;vertical-align:middle;}
  html.dark .live{background:#0f2a1c;color:#4ade80;}
  .live i{width:7px;height:7px;border-radius:50%;background:currentColor;animation:pulse 1.6s infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  /* controls */
  .controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;}
  .field{display:flex;flex-direction:column;gap:4px;}
  .field label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
  select{appearance:none;background:var(--white);color:var(--ink);border:1px solid var(--line);
    border-radius:10px;padding:9px 34px 9px 12px;font-size:14px;cursor:pointer;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235f6270' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 12px center;}
  input[type="month"]{background:var(--white);color:var(--ink);border:1px solid var(--line);
    border-radius:10px;padding:9px 12px;font-size:14px;cursor:pointer;font-family:inherit;}
  html.dark input[type="month"]::-webkit-calendar-picker-indicator{filter:invert(0.8);}
  .faic{display:inline-block;vertical-align:-3px;}
  /* lens panel */
  .lenspanel{background:var(--gray-50);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:18px;}
  .lenshead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .lreset{background:none;border:none;color:var(--blue);font-size:12.5px;cursor:pointer;}
  .lchips{display:flex;flex-wrap:wrap;gap:8px;}
  .lchip{border:1px solid var(--line);background:var(--white);color:var(--ink);border-radius:999px;
    padding:7px 13px;font-size:13px;cursor:pointer;transition:all .12s;
    display:inline-flex;align-items:center;gap:7px;}
  .lchip:hover{border-color:var(--muted);}
  .lchip.on{background:var(--ink);color:var(--white);border-color:var(--ink);}
  /* carousel (recycled from plrd.org PLRadar) */
  .radar{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--white);
    box-shadow:0 8px 30px rgba(15,17,21,.06);}
  .segs{display:flex;gap:6px;padding:16px 16px 12px;background:var(--white);}
  .seg{flex:1;height:3px;border-radius:999px;background:rgba(0,0,0,.10);overflow:hidden;}
  html.dark .seg{background:rgba(255,255,255,.14);}
  .seg>i{display:block;height:100%;background:var(--ink);border-radius:999px;transition:width .3s;}
  .stage{position:relative;min-height:360px;}
  .slide{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;
    opacity:0;pointer-events:none;transform:translateX(14px);transition:all .3s;}
  .slide.on{opacity:1;pointer-events:auto;transform:none;}
  @media(max-width:640px){.slide{grid-template-columns:1fr;}}
  .visual{position:relative;overflow:hidden;min-height:200px;}
  .visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  .visual .tex{position:absolute;inset:0;opacity:.10;
    background-image:radial-gradient(circle at 30% 40%,#fff 1px,transparent 1px),radial-gradient(circle at 70% 65%,#fff 1px,transparent 1px);
    background-size:26px 26px,34px 34px;}
  .visual .scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(10,12,18,.60),rgba(10,12,18,.10) 34%,transparent 62%);}
  .visual .meta{position:absolute;left:20px;bottom:16px;color:#fff;z-index:2;}
  .visual .meta .a{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.9;}
  .visual .meta .d{font-family:Newsreader,serif;font-size:18px;}
  .sbody{padding:34px 40px;display:flex;flex-direction:column;justify-content:center;}
  @media(max-width:640px){.sbody{padding:24px;}}
  .badge{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
    padding:4px 10px;border-radius:7px;background:var(--gray-200);color:var(--muted);margin-bottom:16px;}
  .sbody h3{font-family:Newsreader,serif;font-size:26px;font-weight:500;line-height:1.15;margin-bottom:12px;}
  .sbody p{font-size:15px;color:var(--muted);line-height:1.6;margin:0;max-width:30rem;}
  .cta{align-self:flex-start;margin-top:24px;background:var(--ink);color:var(--white);
    font-size:14px;font-weight:600;padding:11px 20px;border-radius:999px;}
  .cta:hover{text-decoration:none;opacity:.9;}
  .endslide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;
    padding:24px;opacity:0;pointer-events:none;transform:translateX(14px);transition:all .3s;}
  .endslide.on{opacity:1;pointer-events:auto;transform:none;}
  .endslide .check{width:64px;height:64px;margin:0 auto 18px;border-radius:50%;
    background:#e7f7ef;color:#18b26b;display:flex;align-items:center;justify-content:center;font-size:30px;}
  .endslide h3{font-family:Newsreader,serif;font-size:28px;margin-bottom:8px;}
  .tapL,.tapR{position:absolute;top:56px;bottom:56px;z-index:3;cursor:pointer;background:none;border:none;}
  .tapL{left:0;width:38%;} .tapR{right:0;width:52%;}
  .rctl{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
    border-top:1px solid var(--line);background:var(--white);}
  .rbtn{width:38px;height:38px;border-radius:999px;border:1px solid var(--line);background:var(--white);
    color:var(--ink);cursor:pointer;font-size:16px;}
  .rbtn:disabled{opacity:.3;cursor:default;}
  .rctl .count{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
  .sharebtn{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:500;
    padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--white);color:var(--ink);cursor:pointer;}
  /* data view */
  .stats{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:30px;}
  .stat{background:var(--gray-50);border:1px solid var(--line);border-radius:16px;padding:16px 20px;min-width:150px;}
  .stat .n{font-family:Newsreader,serif;font-size:34px;line-height:1;}
  .stat .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-top:6px;}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:14px;}
  .panel{background:var(--gray-50);border:1px solid var(--line);border-radius:16px;padding:18px 20px;}
  .panel h3{font-size:16px;margin-bottom:12px;}
  .raterow{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px;}
  .ratelabel{width:150px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ratepct{width:38px;text-align:right;font-variant-numeric:tabular-nums;}
  .bar{flex:1;height:8px;background:var(--gray-200);border-radius:6px;overflow:hidden;}
  .fill{height:100%;border-radius:6px;}
  .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:8px;}
  .tile{text-align:left;padding:0;border:1px solid var(--line);background:var(--white);border-radius:16px;
    overflow:hidden;cursor:pointer;color:inherit;transition:transform .12s,box-shadow .12s;display:flex;flex-direction:column;}
  .tile:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(19,19,22,.10);}
  .tile-media{position:relative;aspect-ratio:16/10;background:var(--gray-200);}
  .tile-media img,.tile-media .ph{width:100%;height:100%;object-fit:cover;display:block;}
  .tile-area{position:absolute;left:10px;bottom:10px;color:#fff;font-size:10px;font-weight:600;
    letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}
  .tile-body{padding:12px 14px 16px;} .tile-body h4{font-size:17px;margin-top:6px;}
  .kicker{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);}
  table{width:100%;border-collapse:collapse;background:var(--gray-50);border:1px solid var(--line);
    border-radius:16px;overflow:hidden;font-size:13px;margin-top:6px;}
  th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);}
  th{color:var(--muted);font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.04em;}
  tr:last-child td{border-bottom:none;}
  .chip{display:inline-flex;align-items:center;font-size:11px;padding:2px 9px;border-radius:999px;background:var(--gray-200);margin:1px 2px;white-space:nowrap;}
  .chip i{width:7px;height:7px;border-radius:50%;margin-right:5px;}
  .pill{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--gray-200);color:var(--muted);margin-left:6px;}
  /* vote view */
  .vote-cta{background:var(--gray-50);border:1px solid var(--line);border-radius:18px;padding:34px;text-align:center;max-width:560px;}
  .vote-cta h3{font-size:24px;margin-bottom:8px;}
  .vote-cta .btn{display:inline-block;margin-top:16px;background:var(--ink);color:var(--white);border-radius:999px;padding:12px 22px;font-weight:600;}
  .vote-cta .btn:hover{text-decoration:none;opacity:.9;}
  .vform{max-width:560px;} .vform .field{margin-bottom:16px;display:block;}
  .vsplit{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:10px 0 18px;align-items:start;}
  @media(max-width:640px){.vsplit{grid-template-columns:1fr;}}
  .vcard{border:1px solid var(--line);background:var(--white);border-radius:16px;overflow:hidden;
    cursor:pointer;text-align:left;color:inherit;font-family:inherit;padding:0;width:100%;
    display:flex;flex-direction:column;
    transition:transform .22s ease,box-shadow .22s,border-color .22s,opacity .24s ease;}
  .vcard:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(19,19,22,.12);border-color:var(--muted);}
  .vcard.leaving{opacity:0;transform:translateY(10px) scale(.965);pointer-events:none;}
  .vcard.entering{opacity:0;transform:translateY(10px) scale(.98);}
  .vcard.won{box-shadow:0 0 0 2px var(--blue);}
  /* voting progress + slow-down warning */
  .vprogress{background:var(--gray-50);border:1px solid var(--line);border-radius:14px;padding:13px 16px;margin:2px 0 14px;}
  .vprogress .row{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:8px;}
  .vprogress .track{height:10px;background:var(--gray-200);border-radius:999px;overflow:hidden;}
  .vprogress .fillp{height:100%;width:0;border-radius:999px;transition:width .5s ease;
    background:linear-gradient(90deg,#3966FE,#12bfdf);}
  .warnsheet{max-width:420px;text-align:center;padding:32px 26px 26px;position:relative;}
  .warnsheet .wicon{font-size:40px;margin-bottom:8px;}
  .warnsheet h3{font-family:Newsreader,serif;font-size:24px;margin-bottom:8px;}
  .warnsheet p{color:var(--muted);font-size:14px;line-height:1.55;margin:0 0 20px;}
  .vcard .vmedia{position:relative;aspect-ratio:16/9;}
  .vcard .vmedia img,.vcard .vmedia .ph{width:100%;height:100%;object-fit:cover;display:block;}
  .vcard .varea{position:absolute;left:10px;bottom:10px;color:#fff;font-size:10px;font-weight:600;
    letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}
  .vcard .vbody{padding:14px 16px 18px;}
  .vcard .vbody .kicker{display:block;}
  .vcard .vbody h4{font-family:Newsreader,serif;font-size:19px;margin:6px 0 6px;}
  .vcard .vbody p{font-size:13px;color:var(--muted);margin:0;}
  .reign{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
    color:#8a6d00;background:#fdf0c8;padding:2px 8px;border-radius:999px;margin-bottom:2px;}
  .vversus{text-align:center;color:var(--muted);font-size:13px;margin:0 0 10px;}
  .votefoot{display:flex;gap:16px;align-items:center;color:var(--muted);font-size:13px;flex-wrap:wrap;}
  .votefoot button,.votefoot a{color:var(--blue);background:none;border:none;cursor:pointer;font-size:13px;font-family:inherit;padding:0;}
  /* sources view */
  .srcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}
  .srccard{background:var(--gray-50);border:1px solid var(--line);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;}
  .srccard .top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}
  .srccard h3{font-size:18px;}
  .srccard p{font-size:13px;color:var(--muted);margin:0 0 14px;flex:1;}
  .srccard .foot{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;}
  .srccard .n{font-variant-numeric:tabular-nums;}
  .badge-int{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:var(--gray-200);color:var(--muted);}
  .badge-field{background:#fdf0c8;color:#8a6d00;}
  html.dark .badge-field{background:#3a2f12;color:#f5c451;}
  .addsrc{border:1.5px dashed var(--line);background:transparent;border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;justify-content:center;}
  .addsrc h3{font-size:18px;margin-bottom:6px;}
  .addsrc p{font-size:13px;color:var(--muted);margin:0 0 14px;}
  .addsrc .btn{align-self:flex-start;}
  /* modal */
  .modal{position:fixed;inset:0;background:rgba(19,19,22,.55);display:none;align-items:center;justify-content:center;padding:20px;z-index:50;}
  .modal.open{display:flex;}
  .sheet{background:var(--white);border-radius:20px;max-width:560px;width:100%;overflow-y:auto;max-height:90vh;box-shadow:0 30px 80px rgba(0,0,0,.4);}
  .sheet-media{aspect-ratio:16/9;position:relative;}
  .sheet-media img,.sheet-media .ph{width:100%;height:100%;object-fit:cover;}
  .sheet-body{padding:22px 24px 26px;}
  .sheet-body h3{font-family:Newsreader,serif;font-size:26px;margin:6px 0 10px;}
  .sheet-body p.desc{color:var(--ink-soft);margin:0 0 18px;}
  .prov{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;}
  .prov .box{background:var(--gray-50);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center;}
  .prov .box .n{font-family:Newsreader,serif;font-size:24px;} .prov .box .l{font-size:11px;color:var(--muted);text-transform:uppercase;}
  .btn{display:inline-block;background:var(--ink);color:var(--white);border-radius:999px;padding:11px 20px;font-size:14px;font-weight:500;}
  .btn:hover{text-decoration:none;opacity:.9;}
  .close{position:absolute;top:12px;right:14px;background:rgba(0,0,0,.4);color:#fff;border:none;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;}
  .loading{color:var(--muted);padding:40px 0;text-align:center;}
</style></head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <span class="dot"></span>
      <div><div class="wm">PL R&amp;D RADAR</div><div class="sub">Crowd curation</div></div>
    </div>
    <nav class="nav" id="nav">
      <button data-route="radar"><span class="ic">📡</span> Radar</button>
      <button data-route="vote"><span class="ic">🗳️</span> Vote</button>
      <button data-route="data"><span class="ic">📊</span> Data</button>
      <button data-route="sources"><span class="ic">🛰️</span> Sources</button>
    </nav>
    <div class="side-foot">
      <button class="toggle" id="themeToggle">◐ Theme</button>
      <div class="tg">Vote in Telegram:<br><a href="https://t.me/lksbrssr_radar_bot" target="_blank">@lksbrssr_radar_bot</a></div>
    </div>
  </aside>
  <main class="main"><div class="wrap" id="view"><div class="loading">Loading…</div></div></main>
</div>

<div class="modal" id="modal"><div class="sheet">
  <div class="sheet-media" id="m-media"><button class="close" id="m-close">×</button></div>
  <div class="sheet-body">
    <span class="kicker" id="m-kicker"></span>
    <h3 id="m-title"></h3><p class="desc" id="m-desc"></p>
    <div class="prov">
      <div class="box"><div class="n" id="m-rating"></div><div class="l">Elo</div></div>
      <div class="box"><div class="n" id="m-votes"></div><div class="l">Votes</div></div>
      <div class="box"><div class="n" id="m-winrate"></div><div class="l">Win rate</div></div>
    </div>
    <a class="btn" id="m-link" target="_blank" rel="noopener">Open source →</a>
  </div>
</div></div>

<div class="modal" id="warnmodal"><div class="sheet warnsheet">
  <button class="close" id="warnclose">×</button>
  <div class="wicon">🐢</div>
  <h3>Whoa — slow down a sec</h3>
  <p>You're voting very fast. Take a moment to actually read each card — rapid-fire clicks don't count toward the Radar.</p>
  <button class="btn" id="warngot">Got it — I'll read them</button>
</div></div>

<script>
${CLIENT_JS}
</script>
</body></html>`
}

// ---------------------------------------------------------------------------
// Client-side app (vanilla JS, runs in the browser).
// ---------------------------------------------------------------------------
const CLIENT_JS = String.raw`
var AREA = {
  'digital-human-rights': { c:'#3966FE', g:'linear-gradient(135deg,#0b1f4d,#1e3a8a 55%,#3966FE)' },
  'economies-governance': { c:'#12bfdf', g:'linear-gradient(135deg,#0a3b2e,#0f6b4c 55%,#12bfdf)' },
  'ai-robotics':          { c:'#7b6cf6', g:'linear-gradient(135deg,#2a1b4d,#4834c4 55%,#7b6cf6)' },
  'neurotech':            { c:'#5b7bff', g:'linear-gradient(135deg,#141a52,#2340c9 55%,#5b7bff)' },
  'default':              { c:'#1982F4', g:'linear-gradient(135deg,#0d0f13,#1d2b5c 55%,#1982F4)' }
};
var CTA = { Talk:'Watch the talk', Podcast:'Listen now', Publication:'Read the paper', Blog:'Read the post', Signal:'Read the story' };
function area(s){ return AREA[s]||AREA.default; }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function el(id){ return document.getElementById(id); }
function getJSON(u){ return fetch(u).then(function(r){ return r.json(); }); }
// Focus-area icons matching plrd.org/about (self-hosted, tinted via CSS mask).
var FA_ICON = {
  'digital-human-rights':'/icons/digital-human-rights.png',
  'economies-governance':'/icons/economies-governance.png',
  'ai-robotics':'/icons/ai-robotics.png',
  'neurotech':'/icons/neurotech.svg'
};
function areaIcon(slug, px){
  px = px||16; var u = FA_ICON[slug]; if(!u) return '';
  return '<span class="faic" style="width:'+px+'px;height:'+px+'px;background:var(--ink)'+
    ';-webkit-mask:url('+u+') center/contain no-repeat;mask:url('+u+') center/contain no-repeat"></span>';
}

var state = { editions:[], edition:null, role:'', focus:[], overview:null, radar:null, cards:{} };
try{ var saved=JSON.parse(localStorage.getItem('radar-lens')||'{}'); if(saved){ state.role=saved.role||''; state.focus=saved.focus||[]; } }catch(e){}
function saveLens(){ try{ localStorage.setItem('radar-lens', JSON.stringify({role:state.role,focus:state.focus})); }catch(e){} }
function lensActive(){ return !!(state.role || (state.focus&&state.focus.length)); }
// Web-voter identity (token-based; reuses the role+focus profile).
var web = null; try{ web = JSON.parse(localStorage.getItem('radar-web')||'null'); }catch(e){}
function saveWeb(){ try{ localStorage.setItem('radar-web', JSON.stringify(web)); }catch(e){} }
function newToken(){ return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'w-'+Date.now()+'-'+Math.random().toString(16).slice(2); }
var vs = null; // active voting session {a,b,champ,count,busy}

// ---- Router ----
function route(){ return (location.hash.replace('#','')||'radar'); }
function setActive(){
  document.querySelectorAll('#nav button').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-route')===route());
  });
}
window.addEventListener('hashchange', render);

// ---- Radar view ----
function roleName(key){ var r=state.overview.lenses.roles.find(function(x){return x.key===key;}); return r?r.label:key; }
function areaName(slug){ var a=state.overview.lenses.areas.find(function(x){return x.slug===slug;}); return a?a.label:slug; }
function lensLabel(){
  if(!lensActive()) return 'Radar';
  var parts=[];
  if(state.role) parts.push(roleName(state.role));
  if(state.focus.length) parts.push(state.focus.map(areaName).join(' + '));
  return parts.join(' · ');
}
function lensSubtitle(){
  if(!lensActive()) return ' — every curator\'s votes combined.';
  var peers = state.radar && state.radar.peers!=null ? state.radar.peers : '';
  return ' — what your '+(peers?peers+' ':'')+'peers ranked highest.';
}
function renderRadar(){
  var v = el('view');
  var eds = state.editions;
  var oldest = eds.length ? eds[eds.length-1].edition : state.edition;
  var newest = eds.length ? eds[0].edition : state.edition;
  var roleOpts = '<option value="">Any role</option>'+state.overview.lenses.roles.map(function(r){ return '<option value="'+r.key+'"'+(r.key===state.role?' selected':'')+'>'+esc(r.emoji+' '+r.label)+'</option>'; }).join('');
  var focusChipsHtml = state.overview.lenses.areas.map(function(a){ var on=state.focus.indexOf(a.slug)>=0; return '<button class="lchip'+(on?' on':'')+'" data-focus="'+a.slug+'">'+(on?'✓ ':'')+areaIcon(a.slug)+esc(a.label)+'</button>'; }).join('');
  var curEd = eds.find(function(e){return e.edition===state.edition;})||{};
  v.innerHTML =
    '<h2 class="title">'+esc(lensLabel())+'</h2>'+
    '<p class="lead">The '+esc((state.radar&&state.radar.label)||'')+' as chosen by the crowd'+esc(lensSubtitle())+'</p>'+
    '<div class="controls">'+
      '<div class="field"><label>Month</label><input type="month" id="selMonth" value="'+esc(state.edition)+'" min="'+esc(oldest)+'" max="'+esc(newest)+'"></div>'+
      '<div class="field"><label>Your role</label><select id="selRole">'+roleOpts+'</select></div>'+
    '</div>'+
    '<div class="lenspanel">'+
      '<div class="lenshead"><span class="field"><label>Your interests</label></span>'+
        (lensActive()?'<button class="lreset" id="lreset">Reset to all curators</button>':'')+'</div>'+
      '<div class="lchips">'+focusChipsHtml+'</div>'+
    '</div>'+
    '<div id="radarMount"></div>'+
    '<p class="lead" style="margin-top:14px">Showing the top '+((state.radar&&state.radar.items.length)||0)+' of '+((state.radar&&state.radar.poolSize)||0)+' candidates'+(curEd.current?' still in the running this month.':' from that edition.')+'</p>';
  el('selMonth').addEventListener('change', function(e){ if(e.target.value){ state.edition=e.target.value; loadRadar(); } });
  el('selRole').addEventListener('change', function(e){ state.role=e.target.value; saveLens(); loadRadar(); });
  var lr=el('lreset'); if(lr) lr.addEventListener('click', function(){ state.role=''; state.focus=[]; saveLens(); loadRadar(); });
  v.querySelectorAll('[data-focus]').forEach(function(b){ b.addEventListener('click', function(){
    var s=b.getAttribute('data-focus'); var i=state.focus.indexOf(s);
    if(i>=0) state.focus.splice(i,1); else state.focus.push(s);
    saveLens(); loadRadar();
  }); });
  mountCarousel();
}

function mountCarousel(){
  var items = (state.radar&&state.radar.items)||[];
  var mount = el('radarMount'); if(!mount) return;
  if(!items.length){ mount.innerHTML='<div class="panel"><p class="muted">No votes yet for this lens — be the first to vote!</p></div>'; return; }
  var N = items.length + 1; // + end slide
  var i = 0;
  var segs = items.map(function(_,idx){ return '<div class="seg"><i style="width:0%"></i></div>'; }).join('')+'<div class="seg"><i style="width:0%"></i></div>';
  var slides = items.map(function(it,idx){
    var g = area(it.areaSlug);
    var cover = it.image ? '<img src="'+esc(it.image)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '';
    return '<div class="slide" data-idx="'+idx+'">'+
      '<div class="visual" style="background:'+g.g+'"><div class="tex"></div>'+cover+'<div class="scrim"></div>'+
        '<div class="meta"><div class="a">'+esc(it.areaLabel)+'</div><div class="d">'+esc(it.date)+'</div></div></div>'+
      '<div class="sbody"><span class="badge">'+esc(it.type)+'</span>'+
        '<h3>'+esc(it.title)+'</h3>'+(it.description?'<p>'+esc(it.description)+'</p>':'')+
        '<a class="cta" href="'+esc(it.href)+'" target="_blank" rel="noopener">'+esc(CTA[it.type]||'Open')+' →</a>'+
      '</div></div>';
  }).join('');
  mount.innerHTML =
    '<div class="radar">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;padding-top:14px">'+
        '<span class="live"><i></i>'+esc((state.editions.find(function(e){return e.edition===state.edition;})||{}).current?'voting open':'published')+'</span>'+
        '<button class="sharebtn" id="shareX"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> Share on X</button>'+
      '</div>'+
      '<div class="segs">'+segs+'</div>'+
      '<div class="stage" id="stage">'+slides+
        '<div class="endslide" data-idx="'+items.length+'"><div><div class="check">✓</div>'+
          '<h3>You\'re all caught up.</h3><p class="muted">That\'s the '+esc(state.radar.label)+'. Switch the lens to see what other segments rank highest.</p></div></div>'+
        '<button class="tapL" id="tapL"></button><button class="tapR" id="tapR"></button>'+
      '</div>'+
      '<div class="rctl"><button class="rbtn" id="prev">←</button><span class="count" id="count"></span><button class="rbtn" id="next">→</button></div>'+
    '</div>';

  function show(){
    var slides = mount.querySelectorAll('.slide');
    slides.forEach(function(s){ s.classList.toggle('on', Number(s.getAttribute('data-idx'))===i); });
    var end = mount.querySelector('.endslide'); end.classList.toggle('on', i===items.length);
    mount.querySelectorAll('.seg>i').forEach(function(f,idx){ f.style.width = idx<=i?'100%':'0%'; });
    el('count').textContent = i===items.length ? 'All caught up' : (i+1)+' / '+items.length;
    el('prev').disabled = i===0; el('next').disabled = i===N-1;
    el('tapL').style.display = i>0?'block':'none'; el('tapR').style.display = i<N-1?'block':'none';
  }
  function go(n){ i=Math.max(0,Math.min(N-1,n)); show(); }
  el('prev').onclick=function(){go(i-1);}; el('next').onclick=function(){go(i+1);};
  el('tapL').onclick=function(){go(i-1);}; el('tapR').onclick=function(){go(i+1);};
  el('shareX').onclick=shareX;
  var tx=null, stage=el('stage');
  stage.addEventListener('touchstart',function(e){tx=e.touches[0].clientX;});
  stage.addEventListener('touchend',function(e){ if(tx===null)return; var dx=e.changedTouches[0].clientX-tx; if(dx<-40)go(i+1); else if(dx>40)go(i-1); tx=null; });
  document.onkeydown=function(e){ if(route()!=='radar')return; if(e.key==='ArrowRight')go(i+1); else if(e.key==='ArrowLeft')go(i-1); else if(e.key==='Escape')closeModal(); };
  show();
}
function shareX(){
  var text = 'PL R&D Radar — '+((state.radar&&state.radar.label)||'')+'\nA one-minute swipe through what\'s new across our research, talks & ideas.';
  var url='https://www.plrd.org/insights';
  window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(text)+'&url='+encodeURIComponent(url)+'&via=PL_RnD','_blank','noopener');
}
function loadRadar(){
  var q='/api/radar.json?edition='+encodeURIComponent(state.edition)+'&limit=5';
  if(state.role) q+='&role='+encodeURIComponent(state.role);
  if(state.focus.length) q+='&focus='+encodeURIComponent(state.focus.join(','));
  getJSON(q).then(function(r){ state.radar=r; renderRadar(); });
}

// ---- Data view ----
function bar(p,c){ return '<div class="bar"><div class="fill" style="width:'+Math.round(p*100)+'%;background:'+c+'"></div></div>'; }
function rateBlock(title, rows, labelFn, colorFn){
  labelFn=labelFn||function(v){return v;}; colorFn=colorFn||function(){return '#1982F4';};
  var body = rows.length ? rows.map(function(r){ return '<div class="raterow"><span class="ratelabel">'+esc(labelFn(r.value))+'</span>'+bar(r.winRate,colorFn(r.value))+'<span class="ratepct">'+Math.round(r.winRate*100)+'%</span></div>'; }).join('') : '<p class="muted">No votes yet.</p>';
  return '<div class="panel"><h3>'+title+'</h3>'+body+'</div>';
}
function areaLabelFromRates(ov){ var m={}; ov.lenses.areas.forEach(function(a){m[a.slug]=a.label;}); return function(v){return m[v]||v;}; }
function renderData(){
  var ov = state.overview, v = el('view');
  var aLabel = areaLabelFromRates(ov);
  var aColor = function(s){ return area(s).c; };
  var roleGrid = ov.byRole.filter(function(r){return r.areaRates.length;}).map(function(r){
    var rows = r.areaRates.slice(0,4).map(function(a){ return '<div class="raterow"><span class="ratelabel">'+esc(aLabel(a.value))+'</span>'+bar(a.winRate,aColor(a.value))+'<span class="ratepct">'+Math.round(a.winRate*100)+'%</span></div>'; }).join('');
    return '<div class="panel"><h3>'+esc(r.emoji+' '+r.label)+'</h3>'+rows+'</div>';
  }).join('');
  var curatorRows = ov.curatorList.map(function(c){
    var focus = (c.focus&&c.focus.length) ? c.focus.map(function(s){ return '<span class="chip"><i style="background:'+aColor(s)+'"></i>'+esc(aLabel(s))+'</span>'; }).join('') : '<span class="muted">all</span>';
    var cad = (c.cadence&&c.cadence>0)?c.cadence+'/day':'surprise';
    var paused = c.status==='paused'?'<span class="pill">paused</span>':'';
    return '<tr><td>'+esc(c.first_name||'Curator')+' '+(c.username?'<span class="muted">@'+esc(c.username)+'</span>':'')+' '+paused+'</td>'+
      '<td class="muted">'+(c.role?esc(labelForRole(ov,c.role)):'—')+'</td><td>'+focus+'</td>'+
      '<td><b>'+c.votes+'</b></td><td class="muted">'+cad+'</td></tr>';
  }).join('');
  v.innerHTML =
    '<h2 class="title">Curation data</h2>'+
    '<p class="lead">Every pairwise vote, aggregated. This is where the Radar\'s rankings come from.</p>'+
    '<div class="stats">'+
      '<div class="stat"><div class="n">'+ov.curators+'</div><div class="l">Curators</div></div>'+
      '<div class="stat"><div class="n">'+ov.totalVotes+'</div><div class="l">Votes cast</div></div>'+
    '</div>'+
    '<h2 class="title" style="font-size:22px">Who values what</h2>'+
    '<p class="lead">Win-rate by attribute — what the crowd rewards.</p>'+
    '<div class="grid">'+
      rateBlock('By focus area', ov.attributeWinRates.area, aLabel, aColor)+
      rateBlock('By content type', ov.attributeWinRates.type)+
      rateBlock('Internal vs field', ov.attributeWinRates.sourceKind, function(x){return x==='field'?'Field signal':'PL R&D internal';})+
    '</div>'+
    (roleGrid?'<h2 class="title" style="font-size:22px">Focus-area preference by role</h2><div class="grid">'+roleGrid+'</div>':'')+
    '<h2 class="title" style="font-size:22px">Curators ('+ov.curators+')</h2>'+
    (curatorRows?'<table><thead><tr><th>Curator</th><th>Role</th><th>Focus areas</th><th>Votes</th><th>Cadence</th></tr></thead><tbody>'+curatorRows+'</tbody></table>':'<div class="panel"><p class="muted">No curators yet.</p></div>');
}
function labelForRole(ov,key){ var r=ov.lenses.roles.find(function(x){return x.key===key;}); return r?r.label:key; }

// ---- Vote view (in-browser king-of-the-hill) ----
function renderVote(){
  if(web && web.id){ renderVoteSession(); } else { renderVoteOnboarding(); }
}

function renderVoteOnboarding(){
  var roleOpts = '<option value="">Prefer not to say</option>'+state.overview.lenses.roles.map(function(r){ return '<option value="'+r.key+'">'+esc(r.emoji+' '+r.label)+'</option>'; }).join('');
  var chips = state.overview.lenses.areas.map(function(a){ return '<button type="button" class="lchip" data-vfocus="'+a.slug+'">'+areaIcon(a.slug)+esc(a.label)+'</button>'; }).join('');
  el('view').innerHTML =
    '<h2 class="title">Vote</h2>'+
    '<p class="lead">Two cards, tap the stronger signal — the winner stays and faces a new challenger. First, a little about you so your votes count toward the right peer segment.</p>'+
    '<div class="vform">'+
      '<div class="field"><label>Your role</label><select id="vRole">'+roleOpts+'</select></div>'+
      '<div class="field"><label>Your interests</label><div class="lchips" id="vChips">'+chips+'</div></div>'+
      '<button class="btn" id="vStart">Start voting →</button>'+
      '<p class="muted" style="margin-top:16px;font-size:13px">Prefer chat? You can also vote in Telegram: <a href="https://t.me/lksbrssr_radar_bot" target="_blank">@lksbrssr_radar_bot</a></p>'+
    '</div>';
  var focus=[];
  el('view').querySelectorAll('[data-vfocus]').forEach(function(b){ b.addEventListener('click', function(){
    var s=b.getAttribute('data-vfocus'); var i=focus.indexOf(s);
    if(i>=0){ focus.splice(i,1); b.classList.remove('on'); } else { focus.push(s); b.classList.add('on'); }
  }); });
  el('vStart').addEventListener('click', function(){
    var role=el('vRole').value; var token=newToken();
    el('vStart').textContent='Starting…'; el('vStart').disabled=true;
    fetch('/api/web/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token,role:role,focus:focus})})
      .then(function(r){return r.json();}).then(function(res){
        web={token:token,id:res.id,role:role,focus:focus}; saveWeb(); renderVoteSession();
      });
  });
}

function challenger(excludeCsv){
  return getJSON('/api/vote/challenger'+(excludeCsv?('?exclude='+encodeURIComponent(excludeCsv)):'')).then(function(r){ return r.card; });
}
function voteCardHtml(slot, card, reigning, entering){
  var g=area(card.areaSlug);
  var media = card.image ? '<img src="'+esc(card.image)+'" alt="" onerror="this.style.display=\'none\'">' : '<div class="ph"></div>';
  return '<button class="vcard'+(entering?' entering':'')+'" data-slot="'+slot+'">'+
    '<div class="vmedia" style="background:'+g.g+'">'+media+'<span class="varea" style="background:'+g.c+'">'+esc(card.areaLabel)+'</span></div>'+
    '<div class="vbody">'+(reigning?'<span class="reign">✓ your pick</span>':'')+
      '<span class="kicker">'+esc(card.type)+(card.source?' · '+esc(card.source):'')+'</span>'+
      '<h4>'+esc(card.title)+'</h4>'+(card.description?'<p>'+esc(card.description)+'</p>':'')+
    '</div></button>';
}
var warnOpen=false;
function openWarn(){ warnOpen=true; el('warnmodal').classList.add('open'); }
function closeWarn(){ warnOpen=false; el('warnmodal').classList.remove('open'); }
function updateStats(s){
  var p=el('vprog'); if(!p||!s) return; p.style.display='block';
  var pct = s.topVotes ? Math.max(6, Math.round(s.votes/s.topVotes*100)) : 6;
  el('vprogFill').style.width=pct+'%';
  var rank = s.rank===1 && s.votes>0 ? '🏆 you\'re the top curator!' : (s.rank?('#'+s.rank+' of '+s.of+' curators'):(s.of+' curators'));
  el('vprogLabel').textContent = s.votes+' vote'+(s.votes===1?'':'s')+' · '+rank;
}
function paintSlot(slot, card, reigning, entering){
  var host=el('slot'+slot.toUpperCase()); if(!host) return;
  host.innerHTML = voteCardHtml(slot, card, reigning, entering);
  var btn=host.querySelector('[data-slot]');
  btn.addEventListener('click', function(){ pick(slot); });
  if(entering){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ btn.classList.remove('entering'); }); }); }
}
function delay(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
function renderVoteSession(){
  el('view').innerHTML =
    '<h2 class="title">Vote</h2>'+
    '<p class="lead">Tap the stronger signal for the Radar. Your pick stays and faces a new challenger.</p>'+
    '<div class="vprogress" id="vprog" style="display:none">'+
      '<div class="row"><span id="vprogLabel"></span><span class="muted">vs. the top curator</span></div>'+
      '<div class="track"><div class="fillp" id="vprogFill"></div></div></div>'+
    '<p class="vversus">🅰 &nbsp; vs &nbsp; 🅱</p>'+
    '<div class="vsplit" id="vsplit"><div id="slotA"><div class="loading">Loading match-up…</div></div><div id="slotB"></div></div>'+
    '<div class="votefoot"><button id="vReset">Change interests</button>'+
      '<a href="https://t.me/lksbrssr_radar_bot" target="_blank">Vote in Telegram instead</a></div>';
  el('vReset').addEventListener('click', function(){ web=null; saveWeb(); localStorage.removeItem('radar-web'); renderVote(); });
  vs={a:null,b:null,champ:null,count:0,busy:false,lastTs:0};
  if(web&&web.token){ getJSON('/api/vote/me?token='+encodeURIComponent(web.token)).then(function(r){ updateStats(r.stats); }); }
  challenger('').then(function(a){ vs.a=a; return challenger(''+a.id); }).then(function(b){
    vs.b=b; paintSlot('a', vs.a, false, false); paintSlot('b', vs.b, false, false);
  });
}
function pick(slot){
  if(!vs || vs.busy || warnOpen) return;
  var now=Date.now();
  // Too fast since your last vote? Block with a modal you must dismiss.
  if(vs.lastTs && now-vs.lastTs < 1200){ openWarn(); return; }
  vs.busy=true;
  var winner = slot==='a'?vs.a:vs.b; var loser = slot==='a'?vs.b:vs.a;
  var loserSlot = slot==='a'?'b':'a';
  var winCard=el('slot'+slot.toUpperCase()).querySelector('.vcard');
  var loseCard=el('slot'+loserSlot.toUpperCase()).querySelector('.vcard');
  if(winCard) winCard.classList.add('won');
  if(loseCard) loseCard.classList.add('leaving');
  Promise.all([
    fetch('/api/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:web.token,winnerId:winner.id,loserId:loser.id})}).then(function(r){return r.json();}),
    challenger(winner.id+','+loser.id),
    delay(300)
  ]).then(function(arr){
    var res=arr[0], nc=arr[1];
    if(res && res.tooFast){ // server rejected as too fast — revert, don't count
      if(loseCard) loseCard.classList.remove('leaving');
      if(winCard) winCard.classList.remove('won');
      openWarn(); if(res.stats) updateStats(res.stats); vs.busy=false; return;
    }
    vs.lastTs=now; vs.count++; vs.champ=slot;
    if(slot==='a'){ vs.b=nc; } else { vs.a=nc; }
    paintSlot(loserSlot, nc, false, true);   // fresh challenger animates in
    paintSlot(slot, winner, true, false);     // winner stays, now marked 'your pick'
    if(res && res.stats) updateStats(res.stats);
    vs.busy=false;
  }).catch(function(){ if(loseCard) loseCard.classList.remove('leaving'); if(winCard) winCard.classList.remove('won'); vs.busy=false; });
}

// ---- Sources view ----
function renderSources(){
  el('view').innerHTML = '<h2 class="title">Sources</h2><div class="loading">Loading sources…</div>';
  getJSON('/api/sources.json').then(function(d){
    var cards = d.sources.map(function(s){
      var badge = s.external ? '<span class="badge-int badge-field">field</span>' : '<span class="badge-int">internal</span>';
      var home = s.homepage ? '<a href="'+esc(s.homepage)+'" target="_blank" rel="noopener">Visit →</a>' : '<span></span>';
      return '<div class="srccard"><div class="top"><h3>'+esc(s.name)+'</h3>'+badge+'</div>'+
        '<p>'+esc(s.description)+'</p>'+
        '<div class="foot">'+home+'<span class="n muted">'+s.cards+' in pool</span></div></div>';
    }).join('');
    var add = '<div class="addsrc"><h3>➕ Add a source</h3>'+
      '<p>Any feed, API or crawler can feed the Radar. Adding one is a one-file pull request — no infra, no secrets.</p>'+
      '<a class="btn" href="'+esc(d.guideUrl)+'" target="_blank" rel="noopener">How to add a source →</a></div>';
    el('view').innerHTML =
      '<h2 class="title">Sources</h2>'+
      '<p class="lead">Where candidate cards come from. Community sources are welcome — <a href="'+esc(d.sourcesDir)+'" target="_blank" rel="noopener">browse them on GitHub</a>.</p>'+
      '<div class="srcgrid">'+cards+add+'</div>';
  });
}

// ---- Modal ----
function openCard(c){
  if(!c) return;
  var media = el('m-media'); media.style.background=area(c.areaSlug).g;
  media.querySelectorAll('img,.ph').forEach(function(n){n.remove();});
  if(c.image){ var img=document.createElement('img'); img.src=c.image; media.insertBefore(img,media.firstChild); }
  el('m-kicker').textContent = c.type + (c.source?' · '+c.source:'');
  el('m-title').textContent = c.title;
  el('m-desc').textContent = c.description||'';
  el('m-rating').textContent = c._rating||'—';
  el('m-votes').textContent = c._votes!=null?c._votes:'—';
  el('m-winrate').textContent = c._winrate!=null?c._winrate+'%':'—';
  el('m-link').href = c.href;
  el('modal').classList.add('open');
}
function closeModal(){ el('modal').classList.remove('open'); }
el('m-close').onclick=closeModal;
el('modal').addEventListener('click',function(e){ if(e.target===el('modal')) closeModal(); });
// Slow-down warning modal (must be dismissed before voting continues).
el('warnclose').onclick=closeWarn;
el('warngot').onclick=closeWarn;
el('warnmodal').addEventListener('click',function(e){ if(e.target===el('warnmodal')) closeWarn(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ closeModal(); closeWarn(); } });

// ---- Boot ----
function render(){
  setActive();
  var r = route();
  if(r==='radar'){ if(state.radar) renderRadar(); else loadRadar(); }
  else if(r==='data'){ renderData(); }
  else if(r==='vote'){ renderVote(); }
  else if(r==='sources'){ renderSources(); }
}
document.querySelectorAll('#nav button').forEach(function(b){
  b.addEventListener('click', function(){ location.hash = b.getAttribute('data-route'); });
});
el('themeToggle').addEventListener('click', function(){
  var d = document.documentElement.classList.toggle('dark');
  try{ localStorage.setItem('radar-theme', d?'dark':'light'); }catch(e){}
});
Promise.all([getJSON('/api/editions.json'), getJSON('/api/overview.json')]).then(function(res){
  state.editions = res[0].editions; state.edition = res[0].current || (state.editions[0]&&state.editions[0].edition);
  state.overview = res[1];
  if(!state.editions.some(function(e){return e.edition===state.edition;}) && state.editions[0]) state.edition=state.editions[0].edition;
  render();
});
`
