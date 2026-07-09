/**
 * Single-page app shell, styled to match plrd.org (Inter body + Newsreader
 * serif headings, light palette, rounded cards, black pill buttons, light/dark
 * toggle). Public by design — no auth.
 *
 * Left sidebar routes (hash-based):
 *   • Radar — the published Radar for a chosen month, as a swipeable carousel
 *     (top 5 cards + "you're all caught up" + Share on X) recycled from
 *     plrd.org/insights. A month selector picks the edition; a "lens" selector
 *     switches between the General Radar (all votes) and a peer segment (your
 *     role or focus area) — "what people like you found most relevant".
 *   • Cards — the full candidate pool for a month, ranked by the confidence-aware
 *     score, split into "on the Radar" (top 5) and "in the running" (click a
 *     card for its provenance: Elo, comparisons, win rate).
 *   • Vote — participate in voting on the web (full flow lands in the next PR;
 *     for now it points to the Telegram bot).
 *   • Insights — the curation analytics: who-values-what, consensus vs
 *     contested, supply/demand, and the curator roster.
 *   • Sources — where candidate cards come from.
 *   • Methodology — a visual explainer of how the crowd's votes become the
 *     monthly Radar (king-of-the-hill → Bradley–Terry confidence cut).
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
    --pos:#0f9d58; --neg:#d64545;
  }
  html.dark{
    --white:#15171c; --ink:#E9E9EE; --ink-soft:#C9CBD3;
    --gray-50:#1c1f26; --gray-100:#1c1f26; --gray-200:#21242c; --line:#262a33;
    --muted:#9EA2AF; --blue:#3B96F6;
    --pos:#34c07f; --neg:#f0736f;
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
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:22px;}
  .brand .logo{width:26px;height:auto;flex:none;display:block;}
  .brand .wm{font-weight:500;letter-spacing:0;font-size:16px;}
  .nav{display:flex;flex-direction:column;gap:3px;}
  .nav button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;
    background:none;border:none;color:var(--ink);padding:10px 12px;border-radius:10px;
    font-size:14.5px;cursor:pointer;}
  .nav button:hover{background:var(--gray-50);}
  .nav button.active{background:var(--gray-200);font-weight:600;}
  .nav .ic{width:18px;text-align:center;}
  .navgap{height:1px;background:var(--line);margin:10px 12px 6px;}
  .hamb{display:none;margin-left:auto;background:none;border:1px solid var(--line);border-radius:10px;
    width:40px;height:40px;cursor:pointer;color:var(--ink);font-size:18px;line-height:1;
    align-items:center;justify-content:center;}
  .hamb:hover{background:var(--gray-50);}
  .side-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px;}
  .toggle{border:1px solid var(--line);background:var(--white);color:var(--ink);
    border-radius:999px;padding:8px 12px;font-size:12.5px;cursor:pointer;}
  .side-foot .tg{font-size:12px;color:var(--muted);}
  .main{flex:1;min-width:0;}
  .wrap{max-width:1000px;margin:0 auto;padding:32px 28px 80px;}
  @media(max-width:720px){
    .app{flex-direction:column;}
    .sidebar{width:auto;height:auto;position:sticky;top:0;z-index:40;background:var(--white);
      flex-direction:row;flex-wrap:wrap;align-items:center;gap:0;padding:14px 16px;
      border-right:none;border-bottom:1px solid var(--line);}
    .brand{margin-bottom:0;}
    .hamb{display:flex;}
    .nav{display:none;flex-direction:column;width:100%;margin-top:12px;gap:4px;}
    .nav button{padding:12px;font-size:16px;}
    .side-foot{display:none;width:100%;margin:10px 0 2px;flex-direction:row;gap:10px;align-items:center;}
    .sidebar.open .nav,.sidebar.open .side-foot{display:flex;}
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
    border-radius:999px;padding:9px 34px 9px 15px;font-size:14px;cursor:pointer;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235f6270' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 13px center;}
  input[type="month"]{background:var(--white);color:var(--ink);border:1px solid var(--line);
    border-radius:999px;padding:9px 16px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;
    min-width:148px;transition:border-color .12s,box-shadow .12s;}
  input[type="month"]:hover{border-color:var(--muted);}
  input[type="month"]:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px rgba(57,102,254,.14);}
  input[type="month"]::-webkit-calendar-picker-indicator{opacity:.5;cursor:pointer;transition:opacity .12s;}
  input[type="month"]:hover::-webkit-calendar-picker-indicator{opacity:.85;}
  html.dark input[type="month"]::-webkit-calendar-picker-indicator{filter:invert(0.8);}
  .searchbox{background:var(--white);color:var(--ink);border:1px solid var(--line);border-radius:999px;
    padding:9px 16px;font-size:14px;font-family:inherit;width:100%;}
  .searchbox:focus{outline:none;border-color:var(--muted);}
  .searchfield{flex:1;min-width:190px;}
  .faic{display:inline-block;vertical-align:-3px;}
  .soon{display:flex;align-items:center;gap:11px;background:var(--gray-50);border:1px dashed var(--line);
    border-radius:14px;padding:12px 16px;margin-bottom:16px;color:var(--muted);font-size:13.5px;}
  .soon .soon-ic{font-size:16px;flex:none;opacity:.8;}
  .soon b{color:var(--ink);}
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
  .cuttoggle{display:inline-flex;gap:0;border:1px solid var(--line);border-radius:999px;overflow:hidden;margin:2px 0 12px;}
  .cuttoggle .ctbtn{border:0;background:var(--white);color:var(--muted);padding:6px 14px;font-size:12.5px;
    cursor:pointer;transition:all .12s;font-weight:600;}
  .cuttoggle .ctbtn.on{background:var(--ink);color:var(--white);}
  .cuttoggle .ctbtn:not(.on):hover{color:var(--ink);}
  .cuthint{font-size:12px;color:var(--muted);margin:-6px 0 12px;}
  .cutrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:2px 0 0;}
  .cutrow .cuttoggle{margin:0;}
  .methlink{font-size:12.5px;font-weight:600;color:#3966FE;white-space:nowrap;}
  html.dark .methlink{color:#6f93ff;}
  .methlink:hover{text-decoration:underline;}
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
  .visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;}
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
  /* part-worth diverging bars */
  .segnote{align-self:flex-end;font-size:12px;padding-bottom:10px;}
  .pw{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px;}
  .pw.gated{opacity:.4;}
  .pwlabel{width:130px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .pwbar{flex:1;height:14px;position:relative;background:var(--gray-200);border-radius:5px;}
  .pwbar .zero{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--muted);opacity:.55;}
  .pwbar .pos,.pwbar .neg{position:absolute;top:2px;bottom:2px;border-radius:3px;}
  .pwbar .pos{left:50%;background:var(--pos);}
  .pwbar .neg{right:50%;background:var(--neg);}
  .pwval{width:46px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}
  .pwval.up{color:var(--pos);} .pwval.down{color:var(--neg);}
  .pwn{width:58px;text-align:right;color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums;}
  /* deviation rows */
  .devrow{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13.5px;}
  .devtag{flex:none;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);
    background:var(--gray-200);border-radius:6px;padding:3px 7px;width:88px;text-align:center;}
  .devtext{flex:none;width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .devtext b{font-weight:600;}
  /* consensus/contested rows */
  .ccrow{display:flex;align-items:center;gap:8px;margin:9px 0;font-size:13px;}
  .cctitle{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ccsd{flex:none;font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px;}
  /* supply/demand table cells */
  td.up{color:var(--pos);font-weight:600;font-variant-numeric:tabular-nums;} td.down{color:var(--neg);font-weight:600;font-variant-numeric:tabular-nums;}
  .sdflag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;}
  .sdflag.up{background:rgba(15,157,88,.14);color:var(--pos);} .sdflag.down{background:rgba(214,69,69,.14);color:var(--neg);}
  /* vote view */
  .vote-cta{background:var(--gray-50);border:1px solid var(--line);border-radius:18px;padding:34px;text-align:center;max-width:560px;}
  .vote-cta h3{font-size:24px;margin-bottom:8px;}
  .vote-cta .btn{display:inline-block;margin-top:16px;background:var(--ink);color:var(--white);border-radius:999px;padding:12px 22px;font-weight:600;}
  .vote-cta .btn:hover{text-decoration:none;opacity:.9;}
  .vform{max-width:560px;} .vform .field{margin-bottom:18px;display:block;}
  .vform .field label{display:block;margin-bottom:8px;}
  .vseeall{text-align:center;margin:2px 0 16px;}
  .vseeall a{display:inline-block;}
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
  .vprogress{padding:0;margin:0 0 14px;font-size:13px;color:var(--muted);}
  .vprogress .row{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:8px;}
  .vprogress .track{height:10px;background:var(--gray-200);border-radius:999px;overflow:hidden;}
  .vprogress .fillp{height:100%;width:0;border-radius:999px;transition:width .5s ease;
    background:linear-gradient(90deg,#3966FE,#12bfdf);}
  .warnsheet{max-width:420px;text-align:center;padding:32px 26px 26px;position:relative;}
  .warnsheet .wicon{font-size:40px;margin-bottom:8px;}
  .warnsheet h3{font-family:Newsreader,serif;font-size:24px;margin-bottom:8px;}
  .warnsheet p{color:var(--muted);font-size:14px;line-height:1.55;margin:0 0 20px;}
  .methsheet{max-width:600px;text-align:left;padding:26px 26px 24px;max-height:86vh;overflow-y:auto;position:relative;}
  .methsheet h3{font-family:Newsreader,serif;font-size:24px;margin:0 30px 10px 0;}
  .methsheet>p{color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 14px;}
  .methsheet .mgrid{margin-top:12px;}
  .vcard .vmedia{position:relative;aspect-ratio:16/9;background:var(--gray-200);}
  .vcard .vmedia img,.vcard .vmedia .ph{width:100%;height:100%;object-fit:cover;display:block;}
  .vcard .varea{position:absolute;left:10px;bottom:10px;color:#fff;font-size:10px;font-weight:600;
    letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(19,19,22,.62);}
  .vcard .vbody{padding:14px 16px 18px;}
  .vcard .vbody .kicker{display:block;}
  .vcard .vbody h4{font-family:Newsreader,serif;font-size:19px;margin:6px 0 6px;}
  .vcard .vbody p{font-size:13px;color:var(--muted);margin:0;}
  .reign{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
    color:#8a6d00;background:#fdf0c8;padding:2px 8px;border-radius:999px;margin-bottom:2px;}
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
  .badge-pub{background:#d9f0e4;color:#166b47;}
  html.dark .badge-pub{background:#123528;color:#57d6a0;}
  .srchead{display:flex;align-items:center;gap:9px;margin:26px 0 6px;}
  .srchead h3{font-size:15px;letter-spacing:.02em;}
  .srchead .tag{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}
  .tag-pub{background:#d9f0e4;color:#166b47;} html.dark .tag-pub{background:#123528;color:#57d6a0;}
  .tag-prop{background:var(--gray-200);color:var(--muted);}
  .locktile{position:relative;border:1px solid var(--line);border-radius:16px;padding:18px 20px;background:var(--gray-50);overflow:hidden;min-height:128px;}
  .locktile .blurred{filter:blur(6px);opacity:.5;user-select:none;pointer-events:none;}
  .locktile .blurred h3{font-size:18px;margin-bottom:8px;} .locktile .blurred p{font-size:13px;color:var(--muted);}
  .locktile .lockover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
    background:linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.35));color:var(--muted);font-size:12.5px;font-weight:600;}
  html.dark .locktile .lockover{background:linear-gradient(180deg,rgba(20,22,28,.15),rgba(20,22,28,.45));}
  .locktile .lockover .lk{font-size:20px;}
  .addsrc{display:block;width:100%;text-align:left;font-family:inherit;color:inherit;border:1.5px dashed var(--line);background:transparent;border-radius:16px;padding:20px 24px;margin:6px 0 2px;cursor:pointer;transition:border-color .12s,background .12s;}
  .addsrc:hover{border-color:var(--muted);background:var(--gray-50);}
  .addsrc h3{font-size:18px;margin-bottom:6px;}
  .addsrc p{font-size:13px;color:var(--muted);margin:0 0 14px;max-width:52ch;}
  .addsrc .btn{display:inline-block;border:none;}
  .srcdivider{border:none;border-top:1px solid var(--line);margin:30px 0 0;}
  /* cards view */
  .cardctrls{position:sticky;top:0;z-index:20;background:var(--white);
    margin:0 -28px 18px;padding:14px 28px;border-bottom:1px solid var(--line);}
  @media(max-width:720px){.cardctrls{margin:0 -16px 16px;padding:12px 16px;}}
  .cardsec{margin-bottom:26px;}
  .cardsec .kicker{display:block;margin-bottom:12px;}
  .cardsecdiv{border:none;border-top:1px solid var(--line);margin:6px 0 24px;}
  .imgprev{margin-top:8px;border:1px solid var(--line);border-radius:10px;overflow:hidden;
    aspect-ratio:16/9;background:var(--gray-200);}
  .imgprev img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .15s;}
  .rankbadge{position:absolute;left:10px;top:10px;z-index:2;font-size:11px;font-weight:700;color:#fff;
    background:rgba(19,19,22,.62);border-radius:999px;padding:3px 9px;font-variant-numeric:tabular-nums;backdrop-filter:blur(2px);}
  .rankbadge.cut{background:linear-gradient(90deg,#3966FE,#12bfdf);}
  .tile-meta{display:flex;gap:12px;margin-top:9px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;}
  /* methodology view */
  .mlead{max-width:660px;}
  .mflow{display:flex;align-items:stretch;flex-wrap:wrap;margin:24px 0 34px;}
  .mstep{flex:1;min-width:150px;background:var(--gray-50);border:1px solid var(--line);border-radius:16px;padding:16px 16px 18px;
    text-align:left;cursor:pointer;transition:border-color .12s,transform .12s;font:inherit;color:inherit;}
  .mstep:hover{border-color:var(--muted);transform:translateY(-2px);}
  .mstep .mjump{display:block;margin-top:8px;font-size:11.5px;font-weight:600;color:var(--accent,#3966FE);}
  .msec{scroll-margin-top:16px;}
  .mstep .mnum{width:26px;height:26px;border-radius:50%;background:var(--ink);color:var(--white);
    display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-bottom:8px;}
  .mstep h4{font-size:16px;margin-bottom:5px;}
  .mstep p{font-size:12.5px;color:var(--muted);margin:0;line-height:1.5;}
  .marrow{flex:none;align-self:center;color:var(--muted);font-size:20px;padding:0 6px;}
  @media(max-width:640px){.mflow{flex-direction:column;} .marrow{transform:rotate(90deg);padding:6px 0;}}
  .msec{margin:32px 0;}
  .msec h3{font-size:22px;margin-bottom:6px;}
  .msec>p{color:var(--muted);font-size:14px;max-width:660px;margin:0 0 14px;line-height:1.6;}
  .mformula{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--gray-50);
    border:1px solid var(--line);border-radius:12px;padding:15px 18px;font-size:15px;overflow-x:auto;margin:14px 0;text-align:center;}
  .mformula b{color:var(--blue);font-weight:600;}
  .mgrid{display:grid;grid-template-columns:1fr;gap:12px;}
  .mtile{background:var(--gray-50);border:1px solid var(--line);border-radius:16px;padding:16px 18px;}
  .mtile .ico{font-size:22px;margin-bottom:8px;}
  .mtile h4{font-size:16px;margin-bottom:5px;}
  .mtile p{font-size:13px;color:var(--muted);margin:0;line-height:1.55;}
  .cirow{display:flex;align-items:center;gap:12px;margin:12px 0;font-size:13px;}
  .cirow .cilabel{width:34px;flex:none;font-weight:600;color:var(--muted);}
  .citrack{flex:1;height:22px;position:relative;background:var(--gray-200);border-radius:6px;}
  .ciband{position:absolute;top:0;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;}
  .ciband.in{background:linear-gradient(90deg,#3966FE,#12bfdf);}
  .ciband.out{background:var(--muted);}
  .cinote{font-size:12.5px;color:var(--muted);margin:8px 0 0;}
  /* add-source wizard */
  .wizsheet{max-width:640px;position:relative;}
  .wizhead{padding:24px 24px 0;}
  .wizhead h3{font-family:Newsreader,serif;font-size:24px;margin:0 0 3px;}
  .wizhead .sub{color:var(--muted);font-size:13px;}
  .wizsteps{display:flex;gap:6px;margin:16px 0 0;}
  .wizsteps .st{flex:1;height:4px;border-radius:999px;background:var(--gray-200);}
  .wizsteps .st.on{background:var(--ink);}
  .wizbody{padding:20px 24px 4px;}
  .wizbody h4{font-family:Inter,sans-serif;font-weight:600;font-size:15px;margin:0 0 8px;}
  .wizbody p{font-size:14px;color:var(--ink-soft);margin:0 0 14px;}
  .wizbody p.muted{color:var(--muted);}
  .wizfoot{display:flex;justify-content:space-between;gap:10px;align-items:center;
    padding:14px 24px 22px;border-top:1px solid var(--line);margin-top:14px;}
  .btn-ghost{display:inline-block;background:transparent;color:var(--ink);border:1px solid var(--line);
    border-radius:999px;padding:11px 20px;font-size:14px;font-weight:500;cursor:pointer;}
  .btn-ghost:hover{background:var(--gray-50);}
  .btn.btn-sm{padding:7px 13px;font-size:12.5px;cursor:pointer;border:none;}
  .pathgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .pathcard{text-align:left;background:var(--gray-50);border:1.5px solid var(--line);border-radius:16px;
    padding:18px;cursor:pointer;transition:border-color .12s,transform .12s;font-family:inherit;color:var(--ink);}
  .pathcard:hover{border-color:var(--ink);transform:translateY(-1px);}
  .pathcard .em{font-size:26px;display:block;margin-bottom:8px;}
  .pathcard h4{font-size:16px;margin:0 0 6px;}
  .pathcard p{font-size:12.5px;color:var(--muted);margin:0;}
  .wizbody .field{margin-bottom:14px;display:block;}
  .wizbody .field label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
    color:var(--muted);margin-bottom:5px;}
  .wizbody .field input,.wizbody .field textarea,.wizbody .field select{width:100%;padding:10px 12px;border:1px solid var(--line);
    border-radius:10px;background:var(--white);color:var(--ink);font-family:inherit;font-size:14px;}
  .wizbody .field textarea{resize:vertical;min-height:62px;}
  .wizbody .field .hint{font-size:11.5px;color:var(--muted);margin-top:5px;}
  .numlist{list-style:none;padding:0;margin:0 0 14px;counter-reset:n;}
  .numlist li{position:relative;padding:2px 0 12px 34px;font-size:13.5px;color:var(--ink-soft);}
  .numlist li:last-child{padding-bottom:0;}
  .numlist li:before{counter-increment:n;content:counter(n);position:absolute;left:0;top:0;
    width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--white);
    font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;}
  .promptbox{position:relative;background:var(--gray-50);border:1px solid var(--line);border-radius:12px;
    padding:14px;margin-bottom:8px;}
  .promptbox pre{margin:0;white-space:pre-wrap;word-break:break-word;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;
    color:var(--ink);max-height:240px;overflow-y:auto;padding-right:2px;}
  .promptbox .copy{position:absolute;top:10px;right:10px;}
  .repochip{display:inline-flex;align-items:center;gap:6px;background:var(--gray-200);border-radius:999px;
    padding:5px 12px;font-size:12.5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:14px;}
  .calloutbox{background:var(--gray-100);border:1px solid var(--line);border-radius:12px;padding:14px;
    font-size:13px;color:var(--ink-soft);margin-bottom:14px;line-height:1.55;}
  .calloutbox strong{color:var(--ink);}
  @media(max-width:560px){ .pathgrid{grid-template-columns:1fr;} }
  /* AI submission flow */
  .urlrow{display:flex;gap:8px;margin-bottom:6px;}
  .urlrow input{flex:1;padding:11px 13px;border:1px solid var(--line);border-radius:10px;
    background:var(--white);color:var(--ink);font-family:inherit;font-size:14px;}
  .urlrow .btn{white-space:nowrap;cursor:pointer;border:none;}
  .subnote{font-size:12px;color:var(--muted);margin:2px 0 14px;}
  .altlink{background:none;border:none;color:var(--blue);font-size:13px;cursor:pointer;padding:0;font-family:inherit;}
  .altlink:hover{text-decoration:underline;}
  .spin{display:inline-block;width:15px;height:15px;border:2px solid rgba(127,127,127,.35);
    border-top-color:var(--ink);border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px;margin-right:7px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .parsing{display:flex;align-items:center;gap:10px;background:var(--gray-50);border:1px solid var(--line);
    border-radius:12px;padding:16px;font-size:13.5px;color:var(--ink-soft);}
  .draftprev{border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:14px;background:var(--white);}
  .draftprev .dp-media{aspect-ratio:16/8;background:var(--gray-200);position:relative;}
  .draftprev .dp-media img{width:100%;height:100%;object-fit:cover;display:block;}
  .draftprev .dp-area{position:absolute;left:10px;bottom:10px;color:#fff;font-size:10px;font-weight:600;
    letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}
  .rationale{font-size:12px;color:var(--muted);font-style:italic;margin:0 0 12px;padding-left:10px;border-left:2px solid var(--line);}
  .dedupbox{background:#fdf0c8;border:1px solid #eacd76;border-radius:12px;padding:14px 16px;margin-bottom:14px;color:#6b5200;font-size:13px;line-height:1.5;}
  html.dark .dedupbox{background:#3a2f12;border-color:#5c4a1a;color:#f5c451;}
  .dedupbox b{color:inherit;} .dedupbox .dd-open{display:inline-block;margin-top:6px;font-weight:600;cursor:pointer;color:inherit;text-decoration:underline;}
  .errbox{background:rgba(214,69,69,.10);border:1px solid rgba(214,69,69,.35);border-radius:12px;
    padding:13px 15px;margin-bottom:14px;color:var(--neg);font-size:13px;line-height:1.5;}
  .okbox{text-align:center;padding:14px 6px;}
  .okbox .okc{width:60px;height:60px;margin:4px auto 14px;border-radius:50%;background:#e7f7ef;color:#18b26b;
    display:flex;align-items:center;justify-content:center;font-size:28px;}
  html.dark .okbox .okc{background:#0f2a1c;}
  .okbox h4{font-family:Newsreader,serif;font-size:22px;margin:0 0 6px;}
  .samplelist{list-style:none;padding:0;margin:8px 0 14px;}
  .samplelist li{display:flex;gap:8px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px;}
  .samplelist li:last-child{border-bottom:none;}
  .samplelist .sdot{width:7px;height:7px;border-radius:50%;flex:none;position:relative;top:5px;}
  .samplelist .stype{color:var(--muted);font-size:11px;flex:none;}
  /* modal */
  .modal{position:fixed;inset:0;background:rgba(19,19,22,.55);display:none;align-items:center;justify-content:center;padding:20px;z-index:50;}
  .modal.open{display:flex;}
  /* The dark scrim covers the WHOLE page (incl. the sidebar); the sheet still
     centers over the content area on desktop via left padding = sidebar width. */
  @media(min-width:721px){.modal{padding-left:256px;}}
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
  .atable{width:100%;border-collapse:collapse;font-size:13px;}
  .atable th{text-align:left;color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:6px 10px;border-bottom:1px solid var(--line);}
  .atable td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top;}
  .atable tr:last-child td{border-bottom:none;}
  .btn.btn-sm[disabled]{opacity:.5;cursor:default;}
  /* Admin tab pills — own class (never mix .btn + .btn-ghost; their color/bg
     conflict flips to white-on-white on hover). Legible in both themes. */
  .atabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px;}
  .atab{background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:999px;
    padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;transition:background .12s,border-color .12s;}
  .atab:hover{background:var(--gray-50);border-color:var(--muted);color:var(--ink);}
  .atab.on{background:var(--ink);color:var(--white);border-color:var(--ink);}
</style></head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <img class="logo" src="/icons/pl-logo-mark.svg" alt="Protocol Labs" width="26" height="30">
      <div class="wm">PL R&amp;D Radar</div>
    </div>
    <button class="hamb" id="hamb" aria-label="Menu" aria-expanded="false">☰</button>
    <nav class="nav" id="nav">
      <button data-route="radar">Radar</button>
      <button data-route="vote">Vote</button>
      <button data-route="cards">Cards</button>
      <button data-route="sources">Sources</button>
      <div class="navgap"></div>
      <button data-route="data">Insights</button>
      <button data-route="method">Methodology</button>
      <button data-route="admin" id="navAdmin" style="display:none">🔐 Admin</button>
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

<div class="modal" id="methmodal"><div class="sheet methsheet">
  <button class="close" id="methclose">×</button>
  <h3 id="methtitle"></h3>
  <div id="methbody"></div>
</div></div>

<div class="modal" id="wizmodal"><div class="sheet wizsheet">
  <button class="close" id="wizclose">×</button>
  <div class="wizhead"><h3 id="wiz-h"></h3><div class="sub" id="wiz-sub"></div>
    <div class="wizsteps" id="wiz-steps"></div></div>
  <div class="wizbody" id="wiz-body"></div>
  <div class="wizfoot" id="wiz-foot"></div>
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
  'protocol-labs':        { c:'#8b98ad', g:'linear-gradient(135deg,#12151c,#243043 55%,#5b6b86)' },
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
  'neurotech':'/icons/neurotech.svg',
  'protocol-labs':'/icons/pl-logo-mark.svg'
};
function areaIcon(slug, px){
  px = px||16; var u = FA_ICON[slug]; if(!u) return '';
  return '<span class="faic" style="width:'+px+'px;height:'+px+'px;background:currentColor'+
    ';-webkit-mask:url('+u+') center/contain no-repeat;mask:url('+u+') center/contain no-repeat"></span>';
}

var state = { editions:[], edition:null, role:'', focus:[], dataSeg:'', overview:null, radar:null, radarCut:null, cards:{}, cardSearch:'' };
try{ var saved=JSON.parse(localStorage.getItem('radar-lens')||'{}'); if(saved){ state.role=saved.role||''; state.focus=saved.focus||[]; } }catch(e){}
function saveLens(){ try{ localStorage.setItem('radar-lens', JSON.stringify({role:state.role,focus:state.focus})); }catch(e){} }
function lensActive(){ return !!(state.role || (state.focus&&state.focus.length)); }
// Web-voter identity (token-based; reuses the role+focus profile).
var web = null; try{ web = JSON.parse(localStorage.getItem('radar-web')||'null'); }catch(e){}
function saveWeb(){ try{ localStorage.setItem('radar-web', JSON.stringify(web)); }catch(e){} }
function newToken(){ return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'w-'+Date.now()+'-'+Math.random().toString(16).slice(2); }
var vs = null; // active voting session {a,b,champ,count,busy}

// ---- Router ----
function route(){ return (location.hash.replace('#','').split('?')[0]||'radar'); }
// Personal magic-link token (?t=…) the bot sends so browser votes count under
// the curator's real Telegram identity.
function magicToken(){
  var h=location.hash.slice(1); var i=h.indexOf('?'); if(i<0) return '';
  try{ return new URLSearchParams(h.slice(i+1)).get('t')||''; }catch(e){ return ''; }
}
// Admin magic-link token (same web_token, sent as x-admin-token). Captured from
// a #admin?t=… deep link the bot mints, then persisted for later visits.
var adminTok=null; try{ adminTok=localStorage.getItem('radar-admin')||null; }catch(e){}
function adminHeaders(){ var h={'Content-Type':'application/json'}; if(adminTok) h['x-admin-token']=adminTok; return h; }
function adminReq(method,path,body){
  return fetch(path,{method:method,headers:adminHeaders(),body:body?JSON.stringify(body):undefined})
    .then(function(r){ return r.json().then(function(j){return {status:r.status,body:j};},function(){return {status:r.status,body:{}};}); });
}
function claimMagic(){
  var t=magicToken(); if(!t || route()==='admin') return Promise.resolve(false);
  return fetch('/api/web/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})})
    .then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(j&&j.ok){
        web={token:t,id:j.id,role:j.role||'',focus:j.focus||[],linked:!!j.linked,name:j.name||''}; saveWeb();
        try{ history.replaceState(null,'','#vote'); }catch(e){ location.hash='vote'; }
        return true;
      }
      return false;
    }).catch(function(){ return false; });
}
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
  var curEd = eds.find(function(e){return e.edition===state.edition;})||{};
  v.innerHTML =
    '<h2 class="title">Radar</h2>'+
    '<p class="lead">A one-minute swipe through the strongest signals across PL R&amp;D, as chosen by the crowd.</p>'+
    '<div class="controls">'+
      '<div class="field"><label>Month</label><input type="month" id="selMonth" value="'+esc(state.edition)+'" min="'+esc(oldest)+'" max="'+esc(newest)+'"></div>'+
    '</div>'+
    '<p class="lead" style="margin-top:-6px">Coming soon — filter the Radar for what people with a given profile (role &amp; interests) surfaced.</p>'+
    cutToggle()+
    '<div id="radarMount"></div>'+
    '<p class="lead" style="margin-top:14px">Showing the top '+((state.radar&&state.radar.items.length)||0)+' of '+((state.radar&&state.radar.poolSize)||0)+' candidates'+(curEd.current?' still in the running this month.':' from that edition.')+'</p>'+
    cutNote();
  el('selMonth').addEventListener('change', function(e){ if(e.target.value){ state.edition=e.target.value; loadRadar(); } });
  v.querySelectorAll('[data-cut]').forEach(function(b){ b.addEventListener('click', function(){ state.radarCut=b.getAttribute('data-cut'); applyRadarCut(); renderRadar(); }); });
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
          '<h3>You\'re all caught up.</h3><p class="muted">That\'s the '+esc(state.radar.label)+'. Come back next month for a fresh cut.</p></div></div>'+
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
// Confidence-in-the-cut note (General radar only). The published Radar is ranked
// by a conservative score (rating − z·SE), so a close #5/#6 boundary means the
// crowd hasn't decided yet — more votes will.
function cutNote(){
  var r = state.radar;
  if(!r || r.rankedBy!=='confidence' || !r.cut) return '';
  var cur = (state.editions.find(function(e){return e.edition===state.edition;})||{}).current;
  if(r.cut.resolved){
    return '<p class="lead" style="margin-top:-8px;color:var(--pos)">✓ The top-'+((r.items&&r.items.length)||5)+' cut is statistically settled.</p>';
  }
  return '<p class="lead" style="margin-top:-8px">⚡ The #'+((r.items&&r.items.length)||5)+'/#'+(((r.items&&r.items.length)||5)+1)+' spot is still a toss-up (margin '+r.cut.margin+' pts)'+(cur?' — votes are still deciding it.':'.')+'</p>';
}
// Balanced vs. by-score cut toggle (General radar only). The server returns both
// balancedItems (diversity-composed) and scoreItems (raw conservative-score
// order); applyRadarCut swaps which one drives the carousel.
function applyRadarCut(){
  var r=state.radar; if(!r) return;
  if(r.balancedItems && r.scoreItems){
    if(!state.radarCut) state.radarCut = r.composed ? 'balanced' : 'score';
    r.items = state.radarCut==='score' ? r.scoreItems : r.balancedItems;
  }
}
function cutToggle(){
  // The Balanced/By-score toggle was removed; the published cut still applies
  // (see applyRadarCut), we just don't expose the switch. Keep the methodology
  // link so people can still learn how the cut works.
  var r=state.radar;
  if(lensActive() || !r) return '';
  return '<div class="cutrow"><a class="methlink" href="#method">Learn more about the methodology →</a></div>';
}
function loadRadar(){
  var q='/api/radar.json?edition='+encodeURIComponent(state.edition)+'&limit=5';
  if(state.role) q+='&role='+encodeURIComponent(state.role);
  if(state.focus.length) q+='&focus='+encodeURIComponent(state.focus.join(','));
  getJSON(q).then(function(r){ state.radar=r; applyRadarCut(); renderRadar(); });
}

// ---- Data view (pairwise part-worths) ----
var GROUPLABEL = { angle:'Angle', area:'Focus area', type:'Content type', source_kind:'Source' };
function labelForRole(ov,key){ var r=ov.lenses.roles.find(function(x){return x.key===key;}); return r?r.label:key; }
function angleName(key){ var a=(state.overview.lenses.angles||[]).find(function(x){return x.key===key;}); return a?a.label:(key||'—'); }
function pwValueLabel(group,value){
  if(group==='area') return areaName(value);
  if(group==='angle') return angleName(value);
  if(group==='source_kind') return value==='field'?'Field signal':'PL R&D internal';
  return value; // content type
}
// Diverging bar: 0 sits in the middle, positive grows right (reward), negative left (penalty).
function pwBar(beta,maxAbs){
  var w = maxAbs>0 ? Math.min(Math.abs(beta)/maxAbs,1)*50 : 0;
  var cls = beta>=0?'pos':'neg';
  return '<div class="pwbar"><span class="zero"></span><span class="'+cls+'" style="width:'+w.toFixed(1)+'%"></span></div>';
}
function pwPanel(groupKey,groupLabel,levels){
  if(!levels||!levels.length) return '';
  var maxAbs=0; levels.forEach(function(l){ maxAbs=Math.max(maxAbs,Math.abs(l.beta)); });
  var rows = levels.map(function(l){
    var tip='95% CI ['+l.ciLo.toFixed(2)+', '+l.ciHi.toFixed(2)+'] · '+l.n+' comparisons';
    return '<div class="pw'+(l.gated?' gated':'')+'" title="'+esc(tip)+'">'+
      '<span class="pwlabel">'+esc(pwValueLabel(groupKey,l.value))+'</span>'+
      pwBar(l.beta,maxAbs)+
      '<span class="pwval '+(l.beta>=0?'up':'down')+'">'+(l.beta>=0?'+':'')+l.beta.toFixed(2)+'</span>'+
      '<span class="pwn">n='+l.n+(l.gated?' ⚠':'')+'</span></div>';
  }).join('');
  return '<div class="panel"><h3>'+esc(groupLabel)+'</h3>'+rows+'</div>';
}
function renderData(){
  var ov = state.overview, v = el('view'), pw = ov.partWorths;
  var aColor = function(s){ return area(s).c; };
  var aLabel = function(s){ return areaName(s); };
  var seg = state.dataSeg||'';
  var segFit = seg ? pw.byRole.find(function(r){return r.key===seg;}) : null;
  var byGroup = segFit ? segFit.byGroup : pw.global.byGroup;
  var nVotes = segFit ? segFit.nVotes : pw.global.nVotes;

  var segOpts = '<option value="">All curators</option>'+pw.byRole.map(function(r){
    return '<option value="'+r.key+'"'+(r.key===seg?' selected':'')+'>'+esc(r.emoji+' '+r.label)+' · '+r.nVotes+' votes</option>'; }).join('');

  var pwPanels = pw.groups.map(function(g){ return pwPanel(g.key,g.label,byGroup[g.key]||[]); }).join('');

  // ---- View 2: deviation from baseline (segment only) ----
  var devHtml='';
  if(segFit){
    var devs = segFit.deviations.filter(function(d){return !d.gated;}).slice(0,8);
    devHtml = '<h2 class="title" style="font-size:22px">What sets '+esc(labelForRole(ov,seg))+' apart</h2>'+
      '<p class="lead">Segment part-worth minus the all-curator average, biggest gaps first — the shared taste is subtracted out so only this segment\'s tilt shows.</p>'+
      (devs.length?'<div class="panel">'+devs.map(function(d){
        var dir = d.deviation>=0?'values':'discounts';
        return '<div class="devrow"><span class="devtag">'+esc(GROUPLABEL[d.group]||d.group)+'</span>'+
          '<span class="devtext"><b>'+dir+'</b> '+esc(pwValueLabel(d.group,d.value))+'</span>'+
          pwBar(d.deviation, Math.abs(devs[0].deviation))+
          '<span class="pwval '+(d.deviation>=0?'up':'down')+'">'+(d.deviation>=0?'+':'')+d.deviation.toFixed(2)+'</span></div>';
      }).join('')+'</div>':'<div class="panel"><p class="muted">Not enough votes from this segment yet to separate its taste from the average.</p></div>');
  }

  // ---- View 3: consensus vs contested ----
  var cc = ov.consensus, consensusHtml='';
  function ccRow(c){
    return '<div class="ccrow"><span class="chip"><i style="background:'+aColor(c.area_slug)+'"></i>'+esc(angleName(c.angle))+'</span>'+
      '<span class="cctitle">'+esc(c.title)+'</span><span class="ccsd">σ '+c.sd.toFixed(2)+'</span></div>';
  }
  if(cc && cc.cards && cc.cards.length && cc.segments>=2){
    var contested = cc.cards.slice(0,5);
    var safe = cc.cards.slice().sort(function(a,b){return a.sd-b.sd;}).slice(0,5);
    consensusHtml = '<h2 class="title" style="font-size:22px">Consensus vs contested</h2>'+
      '<p class="lead">How much a card\'s appeal depends on <em>who</em> is looking (spread of its predicted pull across '+cc.segments+' segments). Low = a safe general pick; high = a lens-specific pick.</p>'+
      '<div class="grid">'+
        '<div class="panel"><h3>🤝 Safe general picks</h3><p class="muted" style="font-size:12px;margin:-4px 0 10px">Everyone agrees</p>'+safe.map(ccRow).join('')+'</div>'+
        '<div class="panel"><h3>⚔️ Contested — lens-specific</h3><p class="muted" style="font-size:12px;margin:-4px 0 10px">Segments disagree most</p>'+contested.map(ccRow).join('')+'</div>'+
      '</div>';
  }

  // ---- View 4: supply / demand gap ----
  var sdRows = (ov.supplyDemand||[]).filter(function(x){return !x.gated;});
  var sdHtml='';
  if(sdRows.length){
    var body = sdRows.slice(0,10).map(function(x){
      var flag, cls;
      if(x.demand>0.03 && x.supplyShare < x.expectedShare*0.9){ flag='Under-supplied — source more'; cls='up'; }
      else if(x.demand< -0.03 && x.supplyShare > x.expectedShare*1.1){ flag='Over-supplied'; cls='down'; }
      else { flag='Balanced'; cls=''; }
      return '<tr><td class="muted">'+esc(GROUPLABEL[x.group]||x.group)+'</td>'+
        '<td>'+esc(pwValueLabel(x.group,x.value))+'</td>'+
        '<td class="'+(x.demand>=0?'up':'down')+'">'+(x.demand>=0?'+':'')+x.demand.toFixed(2)+'</td>'+
        '<td>'+Math.round(x.supplyShare*100)+'%</td>'+
        '<td>'+(flag==='Balanced'?'<span class="muted">'+flag+'</span>':'<span class="sdflag '+cls+'">'+flag+'</span>')+'</td></tr>';
    }).join('');
    sdHtml = '<h2 class="title" style="font-size:22px">Supply &amp; demand gap</h2>'+
      '<p class="lead">What the crowd rewards (demand = global part-worth) vs how common it is in this month\'s pool (supply). A sourcing to-do list for ingestion.</p>'+
      '<table><thead><tr><th>Attribute</th><th>Value</th><th>Demand</th><th>Supply</th><th>Signal</th></tr></thead><tbody>'+body+'</tbody></table>';
  }

  // ---- curators table (unchanged) ----
  var curatorRows = ov.curatorList.map(function(c){
    var focus = (c.focus&&c.focus.length) ? c.focus.map(function(s){ return '<span class="chip"><i style="background:'+aColor(s)+'"></i>'+esc(aLabel(s))+'</span>'; }).join('') : '<span class="muted">all</span>';
    var paused = c.status==='paused'?'<span class="pill">paused</span>':'';
    return '<tr><td>'+esc(c.first_name||'Curator')+' '+(c.username?'<span class="muted">@'+esc(c.username)+'</span>':'')+' '+paused+'</td>'+
      '<td class="muted">'+(c.role?esc(labelForRole(ov,c.role)):'—')+'</td><td>'+focus+'</td>'+
      '<td><b>'+c.votes+'</b></td></tr>';
  }).join('');

  v.innerHTML =
    '<h2 class="title">Curation data</h2>'+
    '<p class="lead">Every pairwise vote decomposed into the independent pull of each <b>angle</b>, <b>topic</b> and <b>format</b> — controlling for the others, per segment.</p>'+
    '<div class="stats">'+
      '<div class="stat"><div class="n">'+ov.curators+'</div><div class="l">Curators</div></div>'+
      '<div class="stat"><div class="n">'+ov.totalVotes+'</div><div class="l">Votes cast</div></div>'+
    '</div>'+
    '<h2 class="title" style="font-size:22px">Part-worths by segment</h2>'+
    '<p class="lead">Pull of each attribute value in log-odds, holding the rest constant. <b>0 = this group\'s average</b>; right rewards, left penalizes. Grayed = below '+pw.threshold+' comparisons (too little data to trust).</p>'+
    '<div class="controls"><div class="field"><label>Segment</label><select id="selSeg">'+segOpts+'</select></div>'+
      '<div class="segnote muted">'+(segFit?('Fit on '+nVotes+' votes from '+esc(labelForRole(ov,seg))+' curators'):('Fit on all '+nVotes+' votes'))+'</div></div>'+
    '<div class="grid">'+pwPanels+'</div>'+
    devHtml+
    consensusHtml+
    sdHtml+
    '<h2 class="title" style="font-size:22px">Curators ('+ov.curators+')</h2>'+
    (curatorRows?'<table><thead><tr><th>Curator</th><th>Role</th><th>Focus areas</th><th>Votes</th></tr></thead><tbody>'+curatorRows+'</tbody></table>':'<div class="panel"><p class="muted">No curators yet.</p></div>');

  var ss=el('selSeg'); if(ss) ss.addEventListener('change', function(e){ state.dataSeg=e.target.value; renderData(); });
}

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
  var media = card.image ? '<img src="'+esc(card.image)+'" alt="" onerror="this.style.display=\'none\'">' : '<div class="ph"></div>';
  return '<button class="vcard'+(entering?' entering':'')+'" data-slot="'+slot+'">'+
    '<div class="vmedia">'+media+'<span class="varea">'+esc(card.areaLabel)+'</span></div>'+
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
  var lbl=el('vprogLabel'); if(!lbl) return;
  if(s.rank===1 && s.votes>0){
    lbl.innerHTML='🏆 Nobody has ranked more cards than you this month — thank you!';
  } else {
    var need=Math.max(1,(s.topVotes||0)-(s.votes||0)+1);
    lbl.innerHTML='<b>'+need+'</b> more vote'+(need===1?'':'s')+' to become top curator'+(s.votes?(' · '+s.votes+' cast so far'):'')+'.';
  }
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
  var linked = !!(web && web.linked);
  var who = (linked && web.name)
    ? '<p class="lead" style="margin-top:-8px">Voting as <b>'+esc(web.name)+'</b> — your picks count under your curator profile.</p>'
    : '';
  var foot = linked
    ? ''
    : '<div class="votefoot"><button id="vReset">Change interests</button>'+
      '<a href="https://t.me/lksbrssr_radar_bot" target="_blank">Vote in Telegram instead</a></div>';
  el('view').innerHTML =
    '<h2 class="title">Vote</h2>'+
    '<p class="lead">Tap the stronger signal for the Radar. Your pick stays and faces a new challenger.</p>'+
    who+
    '<div class="vprogress" id="vprog" style="display:none"><div id="vprogLabel"></div></div>'+
    '<div class="vsplit" id="vsplit"><div id="slotA"><div class="loading">Loading match-up…</div></div><div id="slotB"></div></div>'+
    '<div class="vseeall"><a class="btn-ghost" href="#cards">See all cards →</a></div>'+
    foot;
  var rb=el('vReset'); if(rb) rb.addEventListener('click', function(){ web=null; saveWeb(); localStorage.removeItem('radar-web'); renderVote(); });
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
    repoMeta = { repoUrl:d.repoUrl, guideUrl:d.guideUrl, sourcesDir:d.sourcesDir };
    var cards = d.sources.map(function(s){
      var home = s.homepage ? '<a href="'+esc(s.homepage)+'" target="_blank" rel="noopener">Visit →</a>' : '<span></span>';
      return '<div class="srccard"><div class="top"><h3>'+esc(s.name)+'</h3><span class="badge-int badge-pub">public</span></div>'+
        '<p>'+esc(s.description)+'</p>'+
        '<div class="foot">'+home+'<span class="n muted">'+s.cards+' in current pool</span></div></div>';
    }).join('');
    var add = '<button class="addsrc" id="opensrc"><h3>➕ Add a card or source</h3>'+
      '<p>Paste a link to anything — an article, a post, a paper — and let AI draft a card you review, or wire up a recurring feed.</p>'+
      '<span class="btn">Add to the Radar →</span></button>';
    // Blurred placeholders for the not-yet-unlocked proprietary/internal feeds.
    var lockTiles = [
      ['PL Capital', 'Portfolio & investment signals from across the PL network.'],
      ['Doro crawler', 'Automated discovery across internal research surfaces.'],
      ['PL Platform', 'Product & platform milestones, pre-announcement.'],
    ].map(function(t){
      return '<div class="locktile"><div class="blurred"><h3>'+esc(t[0])+'</h3><p>'+esc(t[1])+'</p></div>'+
        '<div class="lockover"><span class="lk">🔒</span><span>Internal Radar — coming soon</span></div></div>';
    }).join('');
    el('view').innerHTML =
      '<h2 class="title">Sources</h2>'+
      '<p class="lead">Where candidate cards come from. Community contributions are welcome — <a href="'+esc(d.sourcesDir)+'" target="_blank" rel="noopener">browse them on GitHub</a>.</p>'+
      '<div class="srchead"><h3>Public sources</h3><span class="tag tag-pub">public</span></div>'+
      '<p class="lead" style="margin-top:-6px">Any content pulled from these sources may be surfaced to an external audience on the Radar.</p>'+
      '<div class="srcgrid">'+cards+'</div>'+
      add+
      '<hr class="srcdivider">'+
      '<div class="srchead"><h3>Proprietary sources</h3><span class="tag tag-prop">internal</span></div>'+
      '<p class="lead">Internal, non-public feeds. Their content stays inside the org — <b>Internal Radar coming soon</b>.</p>'+
      '<div class="srcgrid">'+lockTiles+'</div>';
    // Always open the choice screen first (recurring source vs. one-time card).
    // NB: pass no args — assigning openWiz directly would hand it the click Event
    // as its path, skipping the choice.
    var ob=el('opensrc'); if(ob) ob.onclick=function(){ openWiz(); };
  });
}

// ---- Cards view (full monthly pool) ----
function renderCards(){
  var v=el('view'); var eds=state.editions;
  var oldest = eds.length? eds[eds.length-1].edition : state.edition;
  var newest = eds.length? eds[0].edition : state.edition;
  v.innerHTML =
    '<h2 class="title">Cards</h2>'+
    '<p class="lead" id="cardsLead">Every candidate competing for this edition\'s Radar.</p>'+
    '<div class="controls cardctrls"><div class="field"><label>Month</label>'+
      '<input type="month" id="cMonth" value="'+esc(state.edition)+'" min="'+esc(oldest)+'" max="'+esc(newest)+'"></div>'+
      '<div class="field searchfield"><label>Search</label>'+
        '<input type="text" id="cSearch" class="searchbox" placeholder="Search cards by keyword…" value="'+esc(state.cardSearch||'')+'"></div>'+
      '<div class="field"><label>&nbsp;</label>'+
        '<button class="btn" id="cAdd" style="cursor:pointer;border:none;white-space:nowrap">Add a card</button></div>'+
    '</div>'+
    '<div id="cardsMount"><div class="loading">Loading cards…</div></div>';
  el('cMonth').addEventListener('change', function(e){ if(e.target.value){ state.edition=e.target.value; state.cardsData=null; loadCards(); } });
  el('cSearch').addEventListener('input', function(e){ state.cardSearch=e.target.value; renderCardsGrid(); });
  el('cAdd').addEventListener('click', function(){ openWiz(); });
  if(state.cardsData && state.cardsData.edition===state.edition) renderCardsGrid(); else loadCards();
}
function loadCards(){
  getJSON('/api/cards.json?edition='+encodeURIComponent(state.edition)).then(function(d){ state.cardsData=d; renderCardsGrid(); });
}
function cardTile(it){
  var media = it.image ? '<img src="'+esc(it.image)+'" loading="lazy" alt="" onerror="this.style.display=\'none\'">' : '<div class="ph"></div>';
  var meta = '<span>'+it.votes+' vote'+(it.votes===1?'':'s')+'</span>'+(it.winrate!=null?'<span>'+it.winrate+'% win</span>':'');
  return '<button class="tile" data-key="'+esc(it.key)+'">'+
    '<div class="tile-media">'+media+
      '<span class="rankbadge'+(it.inCut?' cut':'')+'">#'+it.rank+'</span>'+
      '<span class="tile-area" style="background:rgba(19,19,22,.62)">'+esc(it.areaLabel)+'</span></div>'+
    '<div class="tile-body"><span class="kicker">'+esc(it.type)+(it.source?' · '+esc(it.source):'')+'</span>'+
      '<h4>'+esc(it.title)+'</h4><div class="tile-meta">'+meta+'</div></div></button>';
}
function renderCardsGrid(){
  var d=state.cardsData, mount=el('cardsMount'); if(!mount) return;
  var lead=el('cardsLead');
  if(!d || !d.items.length){ mount.innerHTML='<div class="panel"><p class="muted">No cards in this edition yet.</p></div>'; if(lead) lead.textContent='No candidates in this edition yet.'; return; }
  var cur=(state.editions.find(function(e){return e.edition===d.edition;})||{}).current;
  var q=(state.cardSearch||'').trim().toLowerCase();
  var items=d.items;
  if(q){ items=items.filter(function(x){
    return ((x.title||'').toLowerCase().indexOf(q)>=0)
      || ((x.description||'').toLowerCase().indexOf(q)>=0)
      || ((x.source||'').toLowerCase().indexOf(q)>=0)
      || ((x.areaLabel||'').toLowerCase().indexOf(q)>=0)
      || ((x.type||'').toLowerCase().indexOf(q)>=0); }); }
  if(lead){
    lead.innerHTML = q
      ? items.length+' card'+(items.length===1?'':'s')+' matching “'+esc(state.cardSearch.trim())+'” in '+esc(d.label)+'.'
      : 'All '+d.total+' candidates for '+esc(d.label)+', ranked by the confidence-aware Radar score. The top '+d.cutSize+(cur?' currently make':' made')+' the cut. Tap any card for its provenance.';
  }
  if(!items.length){ mount.innerHTML='<div class="panel"><p class="muted">No cards match “'+esc(state.cardSearch.trim())+'” in '+esc(d.label)+'.</p></div>'; return; }
  var onRadar = items.filter(function(x){return x.inCut;});
  var running = items.filter(function(x){return !x.inCut;});
  var html='';
  if(onRadar.length) html+='<div class="cardsec"><span class="kicker">On the '+esc(d.label)+'</span><div class="tiles">'+onRadar.map(cardTile).join('')+'</div></div>';
  if(onRadar.length && running.length) html+='<hr class="cardsecdiv">';
  if(running.length) html+='<div class="cardsec"><span class="kicker">In the running</span><div class="tiles">'+running.map(cardTile).join('')+'</div></div>';
  mount.innerHTML=html;
  mount.querySelectorAll('[data-key]').forEach(function(b){ b.addEventListener('click', function(){
    var k=b.getAttribute('data-key');
    var it=d.items.filter(function(x){return x.key===k;})[0]; if(!it) return;
    openCard({areaSlug:it.areaSlug,type:it.type,source:it.source,title:it.title,description:it.description,image:it.image,href:it.href,_rating:it.rating,_votes:it.votes,_winrate:it.winrate});
  }); });
}

// ---- Methodology view (how the ranking works) ----
// Each flow tile is a button that pops open its deep-dive in a modal.
function mStep(n,title,body,key){
  return '<button class="mstep" data-meth="'+key+'"><div class="mnum">'+n+'</div>'+
    '<h4>'+title+'</h4><p>'+body+'</p>'+
    '<span class="mjump">Deep-dive →</span></button>';
}
function ciScenario(title,ok,inL,inW,outL,outW,note){
  return '<div class="mtile" style="padding:18px 20px"><h4>'+title+'</h4>'+
    '<div class="cirow"><span class="cilabel">#5</span><div class="citrack"><span class="ciband in" style="left:'+inL+'%;width:'+inW+'%">#5</span></div></div>'+
    '<div class="cirow"><span class="cilabel">#6</span><div class="citrack"><span class="ciband out" style="left:'+outL+'%;width:'+outW+'%">#6</span></div></div>'+
    '<p class="cinote">'+note+'</p></div>';
}
function renderMethodology(){
  var ov=state.overview||{};
  var votes = ov.totalVotes!=null? ('<b>'+Number(ov.totalVotes).toLocaleString()+'</b>') : 'thousands of';
  var curators = ov.curators!=null? ('<b>'+ov.curators+'</b> curators') : '';
  el('view').innerHTML =
    '<h2 class="title">Methodology</h2>'+
    '<p class="lead mlead">The Radar is decided by the <b>wisdom of the crowd</b>, not an editor. Here\'s how '+votes+' quick taps'+(curators?' from '+curators:'')+' become a monthly shortlist of the strongest signals — and why the ranking stays fair to every card, no matter when it entered the pool.</p>'+
    '<div class="mflow">'+
      mStep(1,'Sources','Candidates are ingested from public PL R&amp;D sites, then de-duplicated so each real asset is one card.','sources')+
      '<span class="marrow">→</span>'+
      mStep(2,'Match-ups','Curators see two cards and tap the stronger one. The winner stays and faces a fresh challenger.','vote')+
      '<span class="marrow">→</span>'+
      mStep(3,'Ranking','Every comparison feeds a model that scores each card <em>and</em> how confident we are of that score.','rank')+
      '<span class="marrow">→</span>'+
      mStep(4,'The cut','A strong, balanced top-5 becomes that month\'s Radar — once the crowd has actually decided.','cut')+
    '</div>'+
    '<p class="lead" style="margin-top:-6px">Tap any step to dig into how it works.</p>'+
    '<div class="msec"><p class="muted" style="font-size:13px">Every vote is also decomposed into the independent pull of each angle, topic and format per segment (a conjoint-style part-worth model) — see the <a href="#data">Insights</a> view. Per-profile Radar “lenses” are coming soon. The raw votes are the single source of truth — every rating recomputes from scratch. It\'s all open source: <a href="https://github.com/lksbrssr/plrd-radar-curator" target="_blank" rel="noopener">read the code →</a></p></div>';
  el('view').querySelectorAll('[data-meth]').forEach(function(b){ b.addEventListener('click', function(){
    openMeth(b.getAttribute('data-meth'));
  }); });
}

// Deep-dive content for the methodology modals (keyed by tile).
var METH = {
  sources: { title:'Sources &amp; de-duplication',
    html:'<p>Candidate cards are ingested from public PL R&amp;D sources — <b>plrd.org/insights</b>, the <b>protocol.ai</b> blog and <b>PL Neuro</b> — every few hours. Each card is filed into the edition (month) it was published in. Anyone can add a source with a one-file PR (see the <a href="#sources">Sources</a> tab).</p>'+
      '<div class="mgrid">'+
        '<div class="mtile"><h4>Content vs. card</h4><p>The same talk is often cross-posted by two sites with different titles/URLs. We resolve each to a canonical <b>content</b> by a strong identifier (its YouTube id, else a normalized URL) so cross-posts collapse to <b>one</b> card — no split votes, no duplicates.</p></div>'+
        '<div class="mtile"><h4>Self-healing</h4><p>Dedup runs on every ingest and merges duplicates that slipped in earlier — moving their votes onto the surviving card. Votes are never lost.</p></div>'+
        '<div class="mtile"><h4>Public today</h4><p>All current sources are public, so their content may be shown externally. Internal / proprietary feeds are coming later.</p></div>'+
      '</div>' },
  vote: { title:'The vote: king-of-the-hill',
    html:'<p>Pairwise choices are far more reliable than 1–5 star ratings: “is A stronger than B?” is easy and consistent, while absolute scores drift between people. Each winner stays on screen and meets a new challenger, so strong cards rack up comparisons fast.</p>'+
      '<div class="mgrid">'+
        '<div class="mtile"><h4>One tap per match</h4><p>No forms, no scores — just pick the stronger signal. Two quick questions up front (role + interests) tag your votes for the <a href="#data">Insights</a> analysis.</p></div>'+
        '<div class="mtile"><h4>Speed guard</h4><p>Rapid-fire clicks (under ~1 second) are rejected and don\'t count. We want reads, not reflexes.</p></div>'+
        '<div class="mtile"><h4>Even coverage</h4><p>Challengers are drawn least-seen-first, so votes spread across the whole pool instead of piling onto a few cards.</p></div>'+
      '</div>' },
  rank: { title:'From votes to a confident ranking',
    html:'<p>We model each card\'s latent strength so the chance one card beats another follows a logistic curve of their strength gap — the Bradley–Terry model, the statistical cousin of chess Elo.</p>'+
      '<div class="mformula">P( <b>i</b> beats <b>j</b> ) &nbsp;=&nbsp; σ( strength<sub>i</sub> − strength<sub>j</sub> )</div>'+
      '<div class="mgrid">'+
        '<div class="mtile"><h4>Live Elo</h4><p>Each vote instantly nudges both cards\' ratings (K = 24). Beating a stronger card moves the needle more. This powers the instant leaderboard.</p></div>'+
        '<div class="mtile"><h4>Confidence fit</h4><p>For the official cut we re-fit every card jointly from the whole vote history at once — order-independent — and get a standard error (uncertainty) per card.</p></div>'+
      '</div>'+
      '<p style="margin-top:14px"><b>Fair to newcomers.</b> Sequential Elo quietly rewards cards that have been around longer. So the published Radar ranks by a <b>conservative score</b> — rating minus uncertainty:</p>'+
      '<div class="mformula">Radar score &nbsp;=&nbsp; rating &nbsp;−&nbsp; <b>z</b> × uncertainty</div>'+
      '<p>A card only makes the cut if it\'s <em>confidently</em> good, not just luckily high on a handful of votes. A thinly-voted newcomer stays in the running all month and climbs as votes accumulate — it just isn\'t crowned until the crowd is sure.</p>' },
  cut: { title:'What makes the cut',
    html:'<p>The top 5 by conservative score become the month\'s Radar. Two things shape that final set:</p>'+
      '<div class="mgrid">'+
        '<div class="mtile"><h4>Balanced composition</h4><p>Rather than five near-identical cards, we compose a <b>strong yet balanced</b> set — spreading across focus areas &amp; angles — but only ever reordering near the top, never promoting a weak card — this balanced cut is what the <a href="#radar">Radar</a> shows.</p></div>'+
        '<div class="mtile"><h4>Is it settled?</h4><p>The #5 and #6 cards set the boundary. If their confidence intervals no longer overlap, the cut is <b>settled</b>; if they overlap, the last spot is a <b>toss-up</b> and more votes decide it.</p></div>'+
      '</div>'+
      '<div class="mgrid" style="margin-top:14px">'+
        ciScenario('Settled',true,48,44,4,36,'The intervals don\'t overlap — #5 confidently clears #6.')+
        ciScenario('Toss-up',false,34,50,8,50,'The intervals overlap — the last Radar spot is still undecided.')+
      '</div>' }
};
function openMeth(k){
  var m=METH[k]; if(!m) return;
  el('methtitle').innerHTML=m.title;
  el('methbody').innerHTML=m.html;
  el('methmodal').classList.add('open');
}
function closeMeth(){ el('methmodal').classList.remove('open'); }

// ---- Add-card / add-source wizard (AI parse + dedup, with fallbacks) ----
var AREAS_W = [
  {slug:'digital-human-rights',label:'Digital Human Rights'},
  {slug:'economies-governance',label:'Economies & Governance'},
  {slug:'ai-robotics',label:'AI & Robotics'},
  {slug:'neurotech',label:'Neurotech'},
  {slug:'protocol-labs',label:'Protocol Labs'}
];
var TYPES_W = ['Talk','Podcast','Publication','Blog','Signal'];
var repoMeta = {
  repoUrl:'https://github.com/lksbrssr/plrd-radar-curator',
  guideUrl:'https://github.com/lksbrssr/plrd-radar-curator/blob/main/src/ingest/README.md',
  sourcesDir:'https://github.com/lksbrssr/plrd-radar-curator/tree/main/src/ingest/sources'
};
function wizSlug(s){ return String(s||'').toLowerCase().replace(/https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60); }
function repoShort(){ return repoMeta.repoUrl.replace('https://github.com/',''); }

// Whether the submit surface is on (SUBMIT_KEY set) and whether an LLM is wired.
var SUBMIT = { checked:false, enabled:false, ai:false };
function loadSubmitStatus(){
  return getJSON('/api/submit/status').then(function(s){ SUBMIT={checked:true,enabled:!!s.enabled,ai:!!s.ai}; })
    .catch(function(){ SUBMIT={checked:true,enabled:false,ai:false}; });
}
// The passphrase that lets this browser spend AI tokens (stored locally only).
var submitKey=''; try{ submitKey=localStorage.getItem('radar-submitkey')||''; }catch(e){}
function saveSubmitKey(k){ submitKey=k; try{ if(k) localStorage.setItem('radar-submitkey',k); else localStorage.removeItem('radar-submitkey'); }catch(e){} }
function authHeaders(){ var h={'Content-Type':'application/json'}; if(submitKey) h['x-submit-key']=submitKey; return h; }
function submitPost(path, body){
  return fetch(path,{method:'POST',headers:authHeaders(),body:JSON.stringify(body||{})}).then(function(r){
    return r.json().then(function(j){ return {status:r.status, body:j}; }, function(){ return {status:r.status, body:{}}; });
  });
}

var wiz = { path:null, view:null, data:{}, dedup:null, sample:[], inPool:0, result:null, err:'' };
function openWiz(path){
  wiz = { path:path||null, view:null, dedup:null, sample:[], inPool:0, result:null, err:'', data:{
    title:'', href:'', description:'', area:'ai-robotics', type:'Signal', source:'', angle:'', image:null, rationale:'',
    name:'', feedUrl:'', homepage:'', srcDesc:'', srcArea:''
  } };
  el('wizmodal').classList.add('open');
  renderWiz();
  if(!SUBMIT.checked){ loadSubmitStatus().then(renderWiz); }
}
function closeWiz(){ el('wizmodal').classList.remove('open'); }

function setWiz(h,sub,body,foot){
  el('wiz-steps').style.display='none'; el('wiz-steps').innerHTML='';
  el('wiz-h').textContent=h; el('wiz-sub').textContent=sub;
  el('wiz-body').innerHTML=body;
  el('wiz-foot').style.display=foot?'flex':'none'; el('wiz-foot').innerHTML=foot||'';
}
function errHtml(){ return wiz.err?'<div class="errbox">'+esc(wiz.err)+'</div>':''; }

function renderWiz(){
  if(!SUBMIT.checked){ setWiz('Add to the Radar','Loading\u2026','<div class="parsing"><span class="spin"></span>Getting things ready\u2026</div>',''); return; }
  if(SUBMIT.enabled && !submitKey){ renderUnlock(); return; }
  if(wiz.path===null){ renderWizChoice(); return; }
  if(wiz.path==='card'){ renderCard(); return; }
  renderSource();
}

function renderUnlock(){
  setWiz('Unlock submissions','A passphrase is needed to use the AI',
    '<p class="subnote">Pasting a URL for the AI to read spends API tokens, so this instance is passphrase-gated. Enter the passphrase your admin shared \u2014 it stays in this browser only.</p>'+
    '<div class="field"><label>Passphrase</label><input id="w-key" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"></div>'+
    errHtml(),
    '<span class="muted" style="font-size:12.5px">Don\'t have one? Ask a maintainer.</span><button class="btn" id="w-unlock">Unlock \u2192</button>');
  el('w-key').addEventListener('keydown',function(e){ if(e.key==='Enter') el('w-unlock').click(); });
  el('w-unlock').onclick=function(){ var k=el('w-key').value.trim(); if(!k) return; saveSubmitKey(k); wiz.err=''; renderWiz(); };
}

function renderWizChoice(){
  var canAI=SUBMIT.enabled, body;
  if(canAI){
    body='<p>Add one item right now, or wire up a feed the Radar re-checks daily. Paste a link and AI does the rest \u2014 you just review before it\'s added.</p>'+
      '<div class="pathgrid">'+
      '<button class="pathcard" data-path="card"><h4>Add a card</h4><p>Paste any URL \u2014 article, Reddit or X post, paper, video. AI turns it into a card you review, then it enters this month\'s pool.</p></button>'+
      '<button class="pathcard" data-path="source"><h4>Recurring source</h4><p>Paste a site or feed URL. We find its feed and re-check it about once a day for fresh candidates.</p></button>'+
      '</div>';
  } else {
    body='<p>AI submission isn\'t enabled on this instance \u2014 but you can still contribute with a one-file pull request via your own coding agent.</p>'+
      '<div class="pathgrid">'+
      '<button class="pathcard" data-path="card"><h4>Single card</h4><p>Add one talk, paper or post via a small PR.</p></button>'+
      '<button class="pathcard" data-path="source"><h4>Recurring source</h4><p>Add a feed via a one-file PR.</p></button>'+
      '</div>';
  }
  setWiz('Add to the Radar','Two ways to feed the pool',body,
    '<span class="muted" style="font-size:12.5px">'+(canAI?'Everything is reviewed before it\'s added.':'You\'ll need a GitHub account and a coding agent.')+'</span>');
  Array.prototype.forEach.call(el('wiz-body').querySelectorAll('.pathcard'),function(c){
    c.onclick=function(){ wiz.path=c.getAttribute('data-path'); wiz.view=null; wiz.err=''; renderWiz(); };
  });
}

// ---- shared helpers ----
function dedupOpen(title, ed){ closeWiz(); if(ed){ state.edition=ed; state.cardsData=null; } state.cardSearch=title||''; if(route()==='cards'){ render(); } else { location.hash='cards'; } }
function bindDedupOpens(){
  ['wiz-body','wiz-foot'].forEach(function(host){
    var h=el(host); if(!h) return;
    Array.prototype.forEach.call(h.querySelectorAll('[data-open]'),function(x){
      x.onclick=function(){ dedupOpen(x.getAttribute('data-open'), x.getAttribute('data-ed')||''); };
    });
  });
}
function dedupBanner(dd){
  var c=dd.card;
  var why = dd.reason==='identity' ? 'This exact link is already a candidate' : 'A card with the same title is already in the pool';
  return '<div class="dedupbox"><b>Looks like a duplicate.</b> '+esc(why)+(c.editionLabel?' ('+esc(c.editionLabel)+')':'')+': \u201c'+esc(c.title)+'\u201d.'+
    '<br><span class="dd-open" data-open="'+esc(c.title)+'" data-ed="'+esc(c.edition||'')+'">View the existing card \u2192</span></div>';
}
function cardFormFields(){
  var d=wiz.data;
  return '<div class="field"><label>Title</label><input id="f-title" value="'+esc(d.title)+'"></div>'+
    '<div class="field"><label>URL</label><input id="f-href" value="'+esc(d.href)+'" placeholder="https://\u2026"></div>'+
    '<div class="field"><label>Description</label><textarea id="f-desc">'+esc(d.description)+'</textarea></div>'+
    '<div class="field"><label>Focus area</label><select id="f-area">'+AREAS_W.map(function(a){return '<option value="'+a.slug+'"'+(a.slug===d.area?' selected':'')+'>'+esc(a.label)+'</option>';}).join('')+'</select></div>'+
    '<div class="field"><label>Type</label><select id="f-type">'+TYPES_W.map(function(t){return '<option'+(t===d.type?' selected':'')+'>'+t+'</option>';}).join('')+'</select></div>'+
    '<div class="field"><label>Source attribution</label><input id="f-src" value="'+esc(d.source)+'" placeholder="Who to credit"></div>'+
    '<div class="field"><label>Hero image URL</label><input id="f-image" value="'+esc(d.image||'')+'" placeholder="https://…/image.jpg">'+
      '<div class="imgprev" id="f-imgprev"'+(d.image?'':' style="display:none"')+'><img id="f-imgprev-img" src="'+esc(d.image||'')+'" alt="" onerror="this.style.opacity=0" onload="this.style.opacity=1"></div></div>';
}
function readCardForm(){
  var d=wiz.data;
  if(el('f-title')) d.title=el('f-title').value.trim();
  if(el('f-href')) d.href=el('f-href').value.trim();
  if(el('f-desc')) d.description=el('f-desc').value.trim();
  if(el('f-area')) d.area=el('f-area').value;
  if(el('f-type')) d.type=el('f-type').value;
  if(el('f-src')) d.source=el('f-src').value.trim();
  if(el('f-image')) d.image=el('f-image').value.trim()||null;
}
function bindCardImagePreview(){
  var inp=el('f-image'); if(!inp) return;
  inp.addEventListener('input', function(){
    var v=inp.value.trim(), box=el('f-imgprev'), img=el('f-imgprev-img');
    if(box) box.style.display=v?'block':'none';
    if(img) img.src=v;
  });
}

// ---- card path ----
function renderCard(){
  if(!SUBMIT.enabled){ renderAgentCard(); return; }
  var v=wiz.view;
  if(v==='review'){ renderCardReview(); return; }
  if(v==='duplicate'){ renderCardDuplicate(); return; }
  if(v==='success'){ renderCardSuccess(); return; }
  if(v==='manual'){ renderCardManual(); return; }
  if(v==='agent'){ renderAgentCard(); return; }
  if(!SUBMIT.ai){ renderCardManual(); return; }
  renderCardInput();
}
function renderCardInput(){
  setWiz('Add a card','Paste a URL, AI drafts the card',
    '<p class="subnote">Paste a link to anything \u2014 a news article, a Reddit or X post, a paper, a video. AI reads it and drafts a card; you review before it\'s added.</p>'+
    '<div class="urlrow"><input id="w-url" placeholder="https://\u2026" value="'+esc(wiz.data.href)+'"><button class="btn" id="w-parse">Parse \u2192</button></div>'+
    errHtml()+
    '<button class="altlink" id="w-manual">Or enter the details manually \u2192</button>',
    '<button class="btn-ghost" id="w-back">\u2190 Back</button><span></span>');
  el('w-back').onclick=function(){ wiz.path=null; wiz.err=''; renderWiz(); };
  el('w-url').addEventListener('keydown',function(e){ if(e.key==='Enter') doParseCard(); });
  el('w-parse').onclick=doParseCard;
  el('w-manual').onclick=function(){ wiz.data.href=el('w-url').value.trim(); wiz.view='manual'; wiz.err=''; renderWiz(); };
}
function doParseCard(){
  var url=(el('w-url')?el('w-url').value:wiz.data.href).trim();
  if(!/^https?:\/\//i.test(url)){ wiz.err='Enter a full URL that starts with http.'; renderWiz(); return; }
  wiz.data.href=url; wiz.err='';
  setWiz('Reading the page\u2026','AI is drafting your card','<div class="parsing"><span class="spin"></span>Fetching and analyzing '+esc(url.slice(0,64))+'\u2026</div>','');
  submitPost('/api/submit/parse',{url:url}).then(function(r){
    if(r.status===401){ saveSubmitKey(''); wiz.err='That passphrase was rejected \u2014 enter it again.'; renderWiz(); return; }
    var j=r.body||{};
    if(j.ok){
      var d=j.draft;
      wiz.data.title=d.title||''; wiz.data.description=d.description||''; wiz.data.href=d.href||url;
      wiz.data.area=d.areaSlug||'ai-robotics'; wiz.data.type=d.type||'Signal'; wiz.data.source=d.source||'';
      wiz.data.angle=d.angle||''; wiz.data.image=d.image||null; wiz.data.rationale=d.rationale||'';
      wiz.stale=d.staleWarning||''; wiz.dedup=j.duplicate||null; wiz.view='review'; renderWiz(); return;
    }
    if(j.reason==='ai-unavailable'){ wiz.err=''; wiz.view='manual'; renderWiz(); return; }
    if(j.reason==='fetch'||j.reason==='parse'){ wiz.err=(j.message||'Couldn\'t read that page.')+' Add the details manually below.'; wiz.view='manual'; renderWiz(); return; }
    if(j.reason==='bad-url'){ wiz.err='That doesn\'t look like a valid URL.'; wiz.view=null; renderWiz(); return; }
    wiz.err='Something went wrong. You can add the details manually.'; wiz.view='manual'; renderWiz();
  }).catch(function(){ wiz.err='Network error. Add the details manually below.'; wiz.view='manual'; renderWiz(); });
}
function renderCardReview(){
  var d=wiz.data;
  setWiz('Review your card','AI filled this in \u2014 tweak anything',
    (wiz.stale?'<div class="dedupbox"><b>Might be too old.</b> '+esc(wiz.stale)+'</div>':'')+
    (wiz.dedup?dedupBanner(wiz.dedup):'')+errHtml()+
    (d.rationale?'<p class="rationale">'+esc(d.rationale)+'</p>':'')+
    cardFormFields(),
    '<button class="btn-ghost" id="w-back">\u2190 Start over</button><button class="btn" id="w-add">Add to Radar \u2192</button>');
  el('w-back').onclick=function(){ wiz.view=null; wiz.dedup=null; wiz.err=''; renderWiz(); };
  el('w-add').onclick=doSubmitCard;
  bindDedupOpens(); bindCardImagePreview();
}
function renderCardManual(){
  setWiz('Add a card manually','You fill in the details',
    errHtml()+
    '<p class="subnote">Fill in as much as you can and add it straight to the pool \u2014 or hand it to your own coding agent to open a pull request.</p>'+
    cardFormFields(),
    '<button class="altlink" id="w-agent">Prepare a PR for my agent \u2192</button><button class="btn" id="w-add">Add to Radar \u2192</button>');
  el('w-add').onclick=doSubmitCard;
  el('w-agent').onclick=function(){ readCardForm(); wiz.view='agent'; renderWiz(); };
  bindCardImagePreview();
}
function doSubmitCard(){
  readCardForm();
  var d=wiz.data;
  if(!d.title || !/^https?:\/\//i.test(d.href) || !d.area){ wiz.err='A title, a valid URL and a focus area are required.'; renderWiz(); return; }
  wiz.err=''; var ab=el('w-add'); if(ab){ ab.disabled=true; ab.textContent='Adding\u2026'; }
  submitPost('/api/submit/card',{title:d.title,href:d.href,description:d.description,areaSlug:d.area,type:d.type,source:d.source,angle:d.angle,image:d.image}).then(function(r){
    if(r.status===401){ saveSubmitKey(''); wiz.err='Passphrase rejected \u2014 re-enter it.'; renderWiz(); return; }
    var j=r.body||{};
    if(j.ok){ wiz.result=j.card; wiz.view='success'; renderWiz(); return; }
    if(j.reason==='duplicate'){ wiz.dedup=j.duplicate; wiz.view='duplicate'; renderWiz(); return; }
    if(j.reason==='incomplete'){ wiz.err='A title, URL and focus area are required.'; renderWiz(); return; }
    wiz.err='Could not add the card. Please try again.'; renderWiz();
  }).catch(function(){ wiz.err='Network error while adding the card.'; renderWiz(); });
}
function renderCardDuplicate(){
  var c=wiz.dedup.card;
  var why = wiz.dedup.reason==='identity' ? 'That link is already a candidate this cycle.' : 'A card with the same title is already competing.';
  setWiz('Already on the Radar','This one\'s a duplicate',
    '<div class="dedupbox"><b>Not added \u2014 it\'s already here.</b><br>'+esc(why)+'</div>'+
    '<p class="subnote">The existing card:</p>'+
    '<div class="draftprev" style="padding:14px 16px"><div class="kicker">'+esc(c.areaLabel||'')+(c.editionLabel?' \u00b7 '+esc(c.editionLabel):'')+'</div>'+
      '<h4 style="font-family:Newsreader,serif;font-size:19px;margin:6px 0 8px">'+esc(c.title)+'</h4>'+
      '<a href="'+esc(c.href)+'" target="_blank" rel="noopener">Open source \u2192</a></div>',
    '<button class="btn-ghost" id="w-back">\u2190 Add a different one</button><button class="btn" data-open="'+esc(c.title)+'" data-ed="'+esc(c.edition||'')+'">View in Cards \u2192</button>');
  el('w-back').onclick=function(){ wiz.view=null; wiz.dedup=null; wiz.err=''; wiz.data.href=''; wiz.data.title=''; renderWiz(); };
  bindDedupOpens();
}
function renderCardSuccess(){
  var c=wiz.result||{};
  setWiz('Card added','It\'s in the pool',
    '<div class="okbox"><div class="okc">\u2713</div><h4>Added to the '+esc(c.editionLabel||'Radar')+'</h4>'+
    '<p class="subnote">\u201c'+esc(c.title)+'\u201d is now a candidate. Curators will start seeing it in match-ups.</p></div>',
    '<button class="btn-ghost" id="w-again">Add another</button><button class="btn" data-open="'+esc(c.title)+'" data-ed="'+esc(c.edition||'')+'">View in Cards \u2192</button>');
  el('w-again').onclick=function(){ wiz.view=null; wiz.dedup=null; wiz.err=''; wiz.data.href=''; wiz.data.title=''; wiz.data.description=''; wiz.data.image=null; wiz.data.rationale=''; renderWiz(); };
  bindDedupOpens();
}
function renderAgentCard(){
  setWiz('Hand it to your agent','One-file pull request',
    '<p class="subnote">Paste this into Claude Code, Cursor, or your agent of choice \u2014 it adds your card to the shared Community source and opens a pull request.</p>'+
    '<div class="repochip">'+esc(repoShort())+'</div>'+
    '<div class="promptbox"><button class="btn btn-sm copy" id="wiz-copy">Copy</button><pre id="wiz-prompt">'+esc(promptCard())+'</pre></div>',
    '<button class="btn-ghost" id="w-back">\u2190 Back</button><span class="muted" style="font-size:12px">Review the diff before you approve it.</span>');
  el('w-back').onclick=function(){ if(SUBMIT.enabled){ wiz.view='manual'; } else { wiz.path=null; } renderWiz(); };
  bindWizCopy();
}

// ---- source path ----
function renderSource(){
  if(!SUBMIT.enabled){ renderAgentSource(); return; }
  var v=wiz.view;
  if(v==='review'){ renderSourceReview(); return; }
  if(v==='success'){ renderSourceSuccess(); return; }
  if(v==='agent'){ renderAgentSource(); return; }
  renderSourceInput();
}
function renderSourceInput(){
  setWiz('Add a recurring source','Paste a site or feed URL',
    '<p class="subnote">Paste a site or feed URL. We find its RSS/Atom feed, preview the cards it would add, and re-check it about once a day. There\'s no manual fallback here \u2014 it needs a real feed.</p>'+
    '<div class="urlrow"><input id="w-url" placeholder="https://example.com or /feed.xml" value="'+esc(wiz.data.feedUrl)+'"><button class="btn" id="w-parse">Find feed \u2192</button></div>'+
    errHtml()+
    '<button class="altlink" id="w-agent">Advanced: add via a code PR instead \u2192</button>',
    '<button class="btn-ghost" id="w-back">\u2190 Back</button><span></span>');
  el('w-back').onclick=function(){ wiz.path=null; wiz.err=''; renderWiz(); };
  el('w-url').addEventListener('keydown',function(e){ if(e.key==='Enter') doParseSource(); });
  el('w-parse').onclick=doParseSource;
  el('w-agent').onclick=function(){ wiz.view='agent'; renderWiz(); };
}
function doParseSource(){
  var url=el('w-url').value.trim();
  if(!/^https?:\/\//i.test(url)){ wiz.err='Enter a full URL that starts with http.'; renderWiz(); return; }
  wiz.data.feedUrl=url; wiz.err='';
  setWiz('Finding the feed\u2026','Reading the site','<div class="parsing"><span class="spin"></span>Looking for a feed at '+esc(url.slice(0,64))+'\u2026</div>','');
  submitPost('/api/submit/source/parse',{url:url}).then(function(r){
    if(r.status===401){ saveSubmitKey(''); wiz.err='Passphrase rejected \u2014 re-enter it.'; renderWiz(); return; }
    var j=r.body||{};
    if(j.ok){
      var d=j.draft;
      wiz.data.name=d.name||''; wiz.data.feedUrl=d.feedUrl||url; wiz.data.homepage=d.homepage||''; wiz.data.srcDesc=d.description||''; wiz.data.srcArea='';
      wiz.sample=d.sample||[]; wiz.dedup=j.duplicate||null; wiz.inPool=j.samplesAlreadyInPool||0;
      wiz.view='review'; renderWiz(); return;
    }
    if(j.reason==='no-feed'){ wiz.err=j.message||'No RSS/Atom feed found at that URL.'; wiz.view=null; renderWiz(); return; }
    if(j.reason==='bad-url'){ wiz.err='That doesn\'t look like a valid URL.'; wiz.view=null; renderWiz(); return; }
    wiz.err=j.message||'Could not read that URL.'; wiz.view=null; renderWiz();
  }).catch(function(){ wiz.err='Network error.'; wiz.view=null; renderWiz(); });
}
function renderSourceReview(){
  var d=wiz.data;
  var dup = wiz.dedup ? '<div class="dedupbox"><b>Already tracked.</b> We\'re already polling \u201c'+esc(wiz.dedup.name)+'\u201d ('+esc(wiz.dedup.feedUrl)+'). Adding it again is blocked.</div>' : '';
  var samples=(wiz.sample||[]).map(function(s){ var g=area(s.areaSlug); return '<li><span class="sdot" style="background:'+g.c+'"></span><span style="flex:1">'+esc(s.title)+'</span><span class="stype">'+esc(s.type)+'</span></li>'; }).join('');
  var poolNote = wiz.inPool ? '<p class="subnote">'+wiz.inPool+' of these are already in the pool \u2014 they\'ll dedup automatically.</p>' : '';
  var addBtn = wiz.dedup ? '' : '<button class="btn" id="w-add">Add source \u2192</button>';
  setWiz('Review the source','We found this feed',
    dup+errHtml()+
    '<div class="field"><label>Source name</label><input id="s-name" value="'+esc(d.name)+'"></div>'+
    '<div class="field"><label>Description</label><textarea id="s-desc">'+esc(d.srcDesc)+'</textarea></div>'+
    '<div class="field"><label>Feed URL</label><input id="s-feed" value="'+esc(d.feedUrl)+'"></div>'+
    '<div class="field"><label>Force focus area (optional)</label><select id="s-area"><option value="">Infer per item</option>'+AREAS_W.map(function(a){return '<option value="'+a.slug+'">'+esc(a.label)+'</option>';}).join('')+'</select></div>'+
    (samples?'<p class="subnote" style="margin-bottom:2px">Preview \u2014 cards this feed would add now:</p><ul class="samplelist">'+samples+'</ul>':'')+
    poolNote,
    '<button class="btn-ghost" id="w-back">\u2190 Try another</button>'+addBtn);
  el('w-back').onclick=function(){ wiz.view=null; wiz.err=''; wiz.dedup=null; renderWiz(); };
  var ab=el('w-add'); if(ab) ab.onclick=doSubmitSource;
}
function doSubmitSource(){
  var d=wiz.data;
  if(el('s-name')) d.name=el('s-name').value.trim();
  if(el('s-desc')) d.srcDesc=el('s-desc').value.trim();
  if(el('s-feed')) d.feedUrl=el('s-feed').value.trim();
  if(el('s-area')) d.srcArea=el('s-area').value;
  if(!d.name || !/^https?:\/\//i.test(d.feedUrl)){ wiz.err='A name and a valid feed URL are required.'; renderWiz(); return; }
  wiz.err=''; var ab=el('w-add'); if(ab){ ab.disabled=true; ab.textContent='Adding\u2026'; }
  submitPost('/api/submit/source',{name:d.name,description:d.srcDesc,feedUrl:d.feedUrl,homepage:d.homepage,areaSlug:d.srcArea}).then(function(r){
    if(r.status===401){ saveSubmitKey(''); wiz.err='Passphrase rejected \u2014 re-enter it.'; renderWiz(); return; }
    var j=r.body||{};
    if(j.ok){ wiz.result=j.source; wiz.ingest=j.ingest||null; wiz.ingestError=j.ingestError||null; wiz.view='success'; renderWiz(); return; }
    if(j.reason==='duplicate'){ wiz.dedup=j.duplicate; renderWiz(); return; }
    wiz.err='Could not add the source. Please try again.'; renderWiz();
  }).catch(function(){ wiz.err='Network error while adding the source.'; renderWiz(); });
}
var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function edLabel(ed){
  var m=(state.editions||[]).find(function(e){return e.edition===ed;});
  if(m&&m.label) return m.label;
  var p=/^(\d{4})-(\d{2})$/.exec(ed||'');
  if(p){ var mo=MONTHS[(+p[2])-1]||''; return (+p[1]===new Date().getFullYear())?(mo+' Radar'):(mo+' '+p[1]); }
  return ed;
}
function renderSourceSuccess(){
  var s=wiz.result||{}, ing=wiz.ingest, firstEd=null;
  // Human summary of what the immediate ingest just pulled in.
  var summary;
  if(wiz.ingestError){
    summary='<p class="subnote">\u201c'+esc(s.name)+'\u201d is saved. '+esc(wiz.ingestError)+'</p>';
  } else if(ing){
    var eds=Object.keys(ing.perEdition||{}).sort();
    firstEd=eds[eds.length-1]||null; // newest edition with new cards
    if(ing.ingested>0){
      var parts=eds.map(function(ed){ return ing.perEdition[ed]+' in '+esc(edLabel(ed)); });
      summary='<p class="subnote"><b>'+ing.ingested+' new card'+(ing.ingested===1?'':'s')+'</b> added just now \u2014 '+parts.join(', ')+'.'+
        (ing.deduped?' '+ing.deduped+' were already in the pool (merged).':'')+
        (ing.offTopic?' '+ing.offTopic+' skipped as off-mission.':'')+
        ' It\u2019s also polled on the normal schedule for future posts.</p>';
    } else {
      var why=[];
      if(ing.skippedEdition) why.push(ing.skippedEdition+' outside the current Radar window');
      if(ing.offTopic) why.push(ing.offTopic+' off-mission (no focus-area match)');
      if(ing.undated) why.push(ing.undated+' with no publish date');
      if(ing.deduped) why.push(ing.deduped+' already in the pool');
      summary='<p class="subnote">\u201c'+esc(s.name)+'\u201d is saved, but it added <b>no new cards</b> right now'+
        (why.length?' ('+why.join(', ')+')':'')+'. It\u2019s polled on the normal schedule, so future posts will land automatically.</p>';
    }
  } else {
    summary='<p class="subnote">\u201c'+esc(s.name)+'\u201d is now polled on the normal schedule. New items become candidate cards automatically \u2014 duplicates are merged.</p>';
  }
  setWiz('Source added','It\'s live',
    '<div class="okbox"><div class="okc">\u2713</div><h4>Source added</h4>'+summary+'</div>',
    (ing&&ing.ingested>0?'<button class="btn-ghost" id="w-again">Add another</button><button class="btn" id="w-view">View cards \u2192</button>':'<button class="btn-ghost" id="w-again">Add another</button><button class="btn" id="w-done">Done</button>'));
  el('w-again').onclick=function(){ wiz.view=null; wiz.ingest=null; wiz.ingestError=null; wiz.data.feedUrl=''; wiz.data.name=''; wiz.dedup=null; wiz.err=''; renderWiz(); };
  if(el('w-view')) el('w-view').onclick=function(){ closeWiz(); if(firstEd){ state.edition=firstEd; state.cardsData=null; } location.hash='cards'; };
  if(el('w-done')) el('w-done').onclick=function(){ closeWiz(); if(route()==='sources') renderSources(); };
}
function renderAgentSource(){
  setWiz('Add a source via a PR','One-file pull request',
    '<p class="subnote">Prefer a code-defined source? Paste this into your coding agent \u2014 it writes the source file and opens a pull request.</p>'+
    '<div class="repochip">'+esc(repoShort())+'</div>'+
    '<div class="promptbox"><button class="btn btn-sm copy" id="wiz-copy">Copy</button><pre id="wiz-prompt">'+esc(promptSource())+'</pre></div>',
    '<button class="btn-ghost" id="w-back">\u2190 Back</button><span class="muted" style="font-size:12px">Review the diff before approving.</span>');
  el('w-back').onclick=function(){ if(SUBMIT.enabled){ wiz.view=null; } else { wiz.path=null; } renderWiz(); };
  bindWizCopy();
}

// ---- agent prompt generators (manual / PR fallback) ----
function promptSource(){
  var d=wiz.data, k=wizSlug(d.name)||'my-source', r=repoMeta.repoUrl;
  return [
'You are helping me add a new data source to the PL R&D Radar crowd-curation project.',
'',
'REPOSITORY: '+r,
'Open your pull request against this repo, targeting the main branch. If you do not have push access, fork it first and open the PR from your fork.',
'',
'GOAL: add an ingestion source that pulls candidate cards from:',
'  - Source name: '+(d.name||'(name)'),
'  - Feed / API URL: '+(d.feedUrl||'(url)'),
'  - Homepage: '+(d.homepage||'(none)'),
'  - What it pulls in: '+(d.srcDesc||'(one-line description)'),
'',
'STEPS:',
'1. Read src/ingest/README.md and src/ingest/types.ts to learn the Source contract.',
'2. Use src/ingest/sources/plrd-insights.ts as a reference implementation.',
'3. Create src/ingest/sources/'+k+'.ts exporting a Source. Its fetch() MUST be read-only: return Candidate[], never touch the database. Reuse helpers from src/ingest/util.ts (parseRss, slugify, inferArea, inferType, areaLabel). Set key: "'+k+'" and keyPrefix: "'+k+'-", and give every card a stable, unique key starting with "'+k+'-".',
'4. Register the source in src/ingest/sources/index.ts.',
'5. Verify with: npm run ingest -- --source='+k+' --dry   and   npm run typecheck',
'6. Open a PR to '+r+' with a short summary and the --dry output.',
'',
'RULES: no secrets in the repo (read any API key from an env var and document it), keep dependencies minimal, and areaSlug must be one of: digital-human-rights, economies-governance, ai-robotics, neurotech.'
  ].join('\n');
}
function promptCard(){
  var d=wiz.data, r=repoMeta.repoUrl;
  var key='community-'+(wizSlug(d.title)||'card');
  return [
'You are helping me submit a SINGLE card (a one-time entry, not a recurring source) to the PL R&D Radar crowd-curation project.',
'',
'REPOSITORY: '+r,
'Open your pull request against the main branch. Fork first if you lack push access.',
'',
'CARD TO ADD:',
'  - Title: '+(d.title||'(title)'),
'  - URL: '+(d.href||'(url)'),
'  - Description: '+(d.description||'(one or two sentences)'),
'  - Focus area (areaSlug): '+d.area,
'  - Type: '+d.type,
'  - Source attribution: '+(d.source||'Community'),
'',
'STEPS:',
'1. Read src/ingest/README.md and src/ingest/types.ts, and look at src/ingest/sources/plrd-insights.ts.',
'2. Open src/ingest/sources/community.ts. If it does not exist, create it: export a Source with key "community", name "Community picks", keyPrefix "community-", external: true, and a fetch() that returns a hard-coded array of Candidate objects (no network, no DB).',
'3. Append this card to that array as a Candidate with key "'+key+'", the title, description, href (the URL above), source (the attribution above), sourceKind: "field", type, areaSlug, and areaLabel (use areaLabel() from util.js).',
'4. If you just created community.ts, register it in src/ingest/sources/index.ts.',
'5. Verify with: npm run typecheck   and   npm run ingest -- --source=community --dry',
'6. Open a PR to '+r+' describing the card you added.'
  ].join('\n');
}

function bindWizCopy(){ var b=el('wiz-copy'); if(b) b.onclick=function(){ wizCopy('wiz-prompt',b); }; }
function wizCopy(id, btn){
  var txt=el(id).textContent;
  var done=function(){ var o=btn.getAttribute('data-lbl')||btn.textContent; btn.setAttribute('data-lbl',o); btn.textContent='Copied \u2713'; setTimeout(function(){ btn.textContent=o; },1400); };
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done,function(){ fallbackCopy(txt); done(); }); }
  else { fallbackCopy(txt); done(); }
}
function fallbackCopy(t){ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(ta); }
// ---- Modal ----
function openCard(c){
  if(!c) return;
  var media = el('m-media'); media.style.background='var(--gray-200)';
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
// Methodology deep-dive modal.
el('methclose').onclick=closeMeth;
el('methmodal').addEventListener('click',function(e){ if(e.target===el('methmodal')) closeMeth(); });
// Add-source/add-card wizard modal.
el('wizclose').onclick=closeWiz;
el('wizmodal').addEventListener('click',function(e){ if(e.target===el('wizmodal')) closeWiz(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ closeModal(); closeWarn(); closeWiz(); } });

// ---- Boot ----
function render(){
  setActive();
  var r = route();
  if(r==='radar'){ if(state.radar) renderRadar(); else loadRadar(); }
  else if(r==='cards'){ renderCards(); }
  else if(r==='data'){ renderData(); }
  else if(r==='vote'){ renderVote(); }
  else if(r==='sources'){ renderSources(); }
  else if(r==='method'){ renderMethodology(); }
  else if(r==='admin'){ renderAdmin(); }
}

// ---- Admin panel (gated by an admin magic-link token) ----
var admin = { me:null, tab:'curators', data:null, msg:'', tried:false };
function can(right){ return admin.me && (admin.me.root || (admin.me.rights||[]).indexOf(right)>=0); }
function initAdmin(){
  if(!adminTok) return Promise.resolve(false);
  return adminReq('GET','/api/admin/me').then(function(r){
    if(r.status===200 && r.body && r.body.ok){
      admin.me=r.body; var b=el('navAdmin'); if(b) b.style.display='';
      return true;
    }
    // stale/invalid token — forget it silently
    adminTok=null; try{ localStorage.removeItem('radar-admin'); }catch(e){}
    return false;
  }).catch(function(){ return false; });
}
function adminTabs(){
  var tabs=[['curators','Curators','manage_admins'],['sources','Sources','manage_sources'],['cards','Cards','manage_cards'],['run','Run a round','trigger_rounds']]
    .filter(function(t){ return can(t[2]); });
  return '<div class="atabs">'+tabs.map(function(t){
    return '<button class="atab'+(admin.tab===t[0]?' on':'')+'" data-atab="'+t[0]+'">'+esc(t[1])+'</button>';
  }).join('')+'</div>';
}
function renderAdmin(){
  var v=el('view');
  // Self-initialise from a token in the hash (or a stored one) even when we
  // arrive via a client-side nav rather than a full page load — boot's capture
  // only fires on a cold load, so this makes the #admin?t=… link robust.
  if(!admin.me){
    var t=magicToken()||adminTok;
    if(t && !admin.tried){
      admin.tried=true; adminTok=t; try{localStorage.setItem('radar-admin',t);}catch(e){}
      v.innerHTML='<h2 class="title">\ud83d\udd10 Admin</h2><div class="loading">Signing you in\u2026</div>';
      initAdmin().then(function(ok){ if(ok){ try{history.replaceState(null,'','#admin');}catch(e){} } renderAdmin(); });
      return;
    }
    v.innerHTML='<h2 class="title">Admin</h2><div class="panel"><p class="muted">This area needs an admin link. In Telegram, send <b>/admin</b> to the bot to get your private sign-in link.</p></div>'; return;
  }
  var tabsWithRight=[['curators','manage_admins'],['sources','manage_sources'],['cards','manage_cards'],['run','trigger_rounds']].filter(function(t){return can(t[1]);});
  if(!tabsWithRight.some(function(t){return t[0]===admin.tab;})) admin.tab=(tabsWithRight[0]||['curators'])[0];
  v.innerHTML='<h2 class="title">🔐 Admin</h2>'+
    '<p class="lead">Signed in as <b>'+esc(admin.me.name)+'</b>'+(admin.me.root?' (root)':'')+'. '+esc((admin.me.rights||[]).join(', ')||'no rights')+'.</p>'+
    adminTabs()+
    (admin.msg?'<p class="lead" style="color:var(--accent)">'+esc(admin.msg)+'</p>':'')+
    '<div id="adminMount"><div class="loading">Loading…</div></div>';
  document.querySelectorAll('[data-atab]').forEach(function(b){ b.addEventListener('click',function(){ admin.tab=b.getAttribute('data-atab'); admin.msg=''; renderAdmin(); }); });
  if(admin.tab==='curators') adminLoadCurators();
  else if(admin.tab==='sources') adminLoadSources();
  else if(admin.tab==='cards') adminLoadCards();
  else if(admin.tab==='run') adminRenderRun();
}
function adminMsg(m){ admin.msg=m; renderAdmin(); }
function adminLoadCurators(){
  adminReq('GET','/api/admin/curators').then(function(r){
    var m=el('adminMount'); if(!m) return; var cs=(r.body&&r.body.curators)||[];
    if(!cs.length){ m.innerHTML='<div class="panel"><p class="muted">No curators yet.</p></div>'; return; }
    m.innerHTML='<div class="panel"><table class="atable"><tr><th>Curator</th><th>Votes</th><th>Admin</th></tr>'+
      cs.map(function(c){
        var isRoot=(r.body.rootIds||[]).indexOf(c.id)>=0;
        var label=esc(c.first_name||c.username||('#'+c.id))+(isRoot?' ⭐':'');
        return '<tr><td>'+label+'</td><td>'+c.votes+'</td><td>'+
          (isRoot?'<span class="muted">root</span>':
            '<button class="btn btn-sm" data-adm="'+c.id+'" data-on="'+(c.is_admin?0:1)+'">'+(c.is_admin?'Revoke':'Make admin')+'</button>')+
          '</td></tr>';
      }).join('')+'</table></div>';
    document.querySelectorAll('[data-adm]').forEach(function(b){ b.addEventListener('click',function(){
      var id=b.getAttribute('data-adm'), on=b.getAttribute('data-on')==='1';
      adminReq('POST','/api/admin/curators/'+id+'/admin',{admin:on}).then(function(x){
        adminMsg(x.body&&x.body.ok?('Updated curator '+id):'Failed: '+((x.body&&x.body.error)||x.status));
      });
    }); });
  });
}
function adminLoadSources(){
  adminReq('GET','/api/admin/sources').then(function(r){
    var m=el('adminMount'); if(!m) return; var ss=(r.body&&r.body.sources)||[];
    if(!ss.length){ m.innerHTML='<div class="panel"><p class="muted">No recurring sources.</p></div>'; return; }
    m.innerHTML='<div class="panel"><table class="atable"><tr><th>Source</th><th>Cards</th><th>Active</th><th></th></tr>'+
      ss.map(function(s){
        return '<tr><td><b>'+esc(s.name)+'</b><br><span class="muted" style="font-size:11px">'+esc(s.feedUrl)+'</span></td>'+
          '<td>'+s.cards+'</td><td>'+(s.active?'yes':'<span class="muted">off</span>')+'</td>'+
          '<td style="white-space:nowrap"><button class="btn btn-sm" data-src-tog="'+esc(s.key)+'" data-on="'+(s.active?0:1)+'">'+(s.active?'Deactivate':'Activate')+'</button> '+
          '<button class="btn btn-sm" data-src-del="'+esc(s.key)+'" data-name="'+esc(s.name)+'">Delete</button></td></tr>';
      }).join('')+'</table><p class="muted" style="font-size:11px;margin-top:8px">Delete also removes the source’s cards.</p></div>';
    document.querySelectorAll('[data-src-tog]').forEach(function(b){ b.addEventListener('click',function(){
      adminReq('PATCH','/api/admin/sources/'+encodeURIComponent(b.getAttribute('data-src-tog')),{active:b.getAttribute('data-on')==='1'}).then(function(x){ adminMsg(x.body&&x.body.ok?'Source updated.':'Failed.'); });
    }); });
    document.querySelectorAll('[data-src-del]').forEach(function(b){ b.addEventListener('click',function(){
      var key=b.getAttribute('data-src-del');
      if(!confirm('Delete source “'+b.getAttribute('data-name')+'” and its cards?')) return;
      adminReq('DELETE','/api/admin/sources/'+encodeURIComponent(key)+'?withCards=1').then(function(x){ adminMsg(x.body&&x.body.ok?('Removed source (+'+(x.body.removedCards||0)+' cards).'):'Failed.'); });
    }); });
  });
}
function adminLoadCards(){
  var ed=state.edition||'';
  adminReq('GET','/api/admin/cards?edition='+encodeURIComponent(ed)).then(function(r){
    var m=el('adminMount'); if(!m) return; var its=(r.body&&r.body.items)||[];
    var head='<div class="controls"><div class="field"><label>Month</label><input type="month" id="aMonth" value="'+esc(ed)+'"></div></div>';
    if(!its.length){ m.innerHTML='<div class="panel">'+head+'<p class="muted">No cards in '+esc((r.body&&r.body.label)||ed)+'.</p></div>'; bindAMonth(); return; }
    m.innerHTML='<div class="panel">'+head+'<table class="atable"><tr><th>Card</th><th>Area</th><th>Votes</th><th></th></tr>'+
      its.map(function(c){
        return '<tr'+(c.active?'':' style="opacity:.5"')+'><td><b>'+esc(c.title)+'</b><br><span class="muted" style="font-size:11px">'+esc(c.source||'')+'</span></td>'+
          '<td>'+esc(c.areaLabel)+'</td><td>'+c.votes+'</td>'+
          '<td style="white-space:nowrap"><button class="btn btn-sm" data-card-tog="'+c.id+'" data-on="'+(c.active?0:1)+'">'+(c.active?'Hide':'Restore')+'</button> '+
          '<button class="btn btn-sm" data-card-del="'+c.id+'" data-t="'+esc(c.title)+'">Delete</button></td></tr>';
      }).join('')+'</table></div>';
    bindAMonth();
    document.querySelectorAll('[data-card-tog]').forEach(function(b){ b.addEventListener('click',function(){
      adminReq('PATCH','/api/admin/cards/'+b.getAttribute('data-card-tog'),{active:b.getAttribute('data-on')==='1'}).then(function(x){ adminMsg(x.body&&x.body.ok?'Card updated.':'Failed.'); });
    }); });
    document.querySelectorAll('[data-card-del]').forEach(function(b){ b.addEventListener('click',function(){
      if(!confirm('Delete card “'+b.getAttribute('data-t')+'”? Votes are removed too.')) return;
      adminReq('DELETE','/api/admin/cards/'+b.getAttribute('data-card-del')).then(function(x){ adminMsg(x.body&&x.body.ok?'Card deleted.':'Failed.'); });
    }); });
  });
}
function bindAMonth(){ var i=el('aMonth'); if(i) i.addEventListener('change',function(e){ if(e.target.value){ state.edition=e.target.value; adminLoadCards(); } }); }
function adminRenderRun(){
  var m=el('adminMount'); if(!m) return;
  m.innerHTML='<div class="panel"><h3>Trigger a toss-up round</h3>'+
    '<p class="lead">Sends every active, onboarded Telegram curator a fresh match-up invite right now (independent of the weekly nudge).</p>'+
    '<button class="btn" id="aRun" style="cursor:pointer">Send a round now</button></div>';
  el('aRun').addEventListener('click',function(){
    var b=el('aRun'); b.disabled=true; b.textContent='Sending…';
    adminReq('POST','/api/admin/round/trigger',{}).then(function(x){
      adminMsg(x.body&&x.body.ok?('Round sent to '+x.body.sent+' curator(s)'+(x.body.failed?(' ('+x.body.failed+' failed)'):'')+'.'):('Failed: '+((x.body&&x.body.error)||x.status)));
    });
  });
}
var sidebar = document.querySelector('.sidebar');
var hamb = el('hamb');
function closeMenu(){ if(sidebar) sidebar.classList.remove('open'); if(hamb){ hamb.textContent='☰'; hamb.setAttribute('aria-expanded','false'); } }
if(hamb){ hamb.addEventListener('click', function(){
  var open = sidebar.classList.toggle('open');
  hamb.textContent = open?'✕':'☰'; hamb.setAttribute('aria-expanded', open?'true':'false');
}); }
document.querySelectorAll('#nav button').forEach(function(b){
  b.addEventListener('click', function(){ location.hash = b.getAttribute('data-route'); closeMenu(); });
});
el('themeToggle').addEventListener('click', function(){
  var d = document.documentElement.classList.toggle('dark');
  try{ localStorage.setItem('radar-theme', d?'dark':'light'); }catch(e){}
});
Promise.all([getJSON('/api/editions.json'), getJSON('/api/overview.json')]).then(function(res){
  state.editions = res[0].editions; state.edition = res[0].current || (state.editions[0]&&state.editions[0].edition);
  state.overview = res[1];
  if(!state.editions.some(function(e){return e.edition===state.edition;}) && state.editions[0]) state.edition=state.editions[0].edition;
  // Capture an admin deep link (#admin?t=…) before claimMagic reroutes tokens.
  if(route()==='admin'){ var at=magicToken(); if(at){ adminTok=at; try{ localStorage.setItem('radar-admin',at); }catch(e){} try{ history.replaceState(null,'','#admin'); }catch(e){} } }
  claimMagic().then(function(){ return initAdmin(); }).then(function(){ render(); });
});
`
