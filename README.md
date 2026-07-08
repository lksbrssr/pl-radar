# PL R&D Radar — Crowd Curator 🛰️

A Telegram bot that uses **the wisdom of the crowd** to decide what goes into the
public [PL R&D Radar](https://github.com/daviddao/plrd.org) — the monthly
"catch up in a minute" digest of the strongest signals across Protocol Labs
R&D's focus areas.

Curators opt in with a single message, answer two quick questions, then get a
few **pairwise match-ups** a day: two candidate cards, tap the stronger one. The
winner stays on the throne and faces a fresh challenger (the "king-of-the-hill"
mechanic). Aggregated across dozens of curators, these taps produce a robust
ranking of what deserves to be on the Radar — plus a read on *which segments
care about what*.

> **Status:** Chunk 1 (the voting bot + ranking + read-only API) is built and
> runs locally. Deployment (Chunk 3) and internal-source ingestion (Chunk 4) are
> scaffolded and documented below.

---

## Why this exists

The Radar was previously curated by recency + a hand-picked list. That doesn't
scale and misses the collective taste of the org. This project replaces the
guesswork with a low-friction voting mechanism:

- **Low friction:** it lives entirely in Telegram. No app, no login, no website
  to visit. Onboarding is under a minute.
- **Statistically sound:** pairwise "A beats B" votes feed an **Elo** rating
  (the same family as chess ratings and the Bradley-Terry preference model),
  which turns noisy individual taps into a stable, confident ordering.
- **Segment-aware:** curators are tagged by **role** and **focus area** at
  signup, so we can ask *"who values what?"* — e.g. do investors rank governance
  signals higher than researchers do? This is the lightweight
  conjoint/part-worth analysis the product brief asked for.

---

## Architecture at a glance

```
        Telegram (curators)                    Consumers
              │  taps                                ▲
              ▼                                       │ read-only JSON
   ┌──────────────────────┐        ┌──────────────────────────────────┐
   │  grammY bot (polling) │        │  plrd.org Radar   PL app-store    │
   │  onboarding + voting  │        │  (picks winners)  dashboard       │
   └───────────┬──────────┘        └──────────────────▲───────────────┘
               │ writes votes                          │
               ▼                                        │
   ┌──────────────────────┐   Elo + segments   ┌───────┴───────────┐
   │  SQLite (single file) │ ─────────────────▶ │  Express HTTP API │
   │  votes = source of    │                    │  /api/*.json      │
   │  truth; Elo is a cache │                   └───────────────────┘
   └──────────────────────┘
```

**One backend, three read-only faces.** The bot + database + ranking live in one
small always-on process. It exposes a read-only JSON API that both the public
Radar and a PL app-store dashboard can consume. Secrets (bot token, DB) never
leave this process and never enter a repo or the PL sandbox.

### Why this split?
The PL app-store sandbox injects **no secrets and no persistent storage**, so a
stateful bot can't live there. Instead the bot runs on a tiny always-on host
(Fly.io), and the *outputs* are what the app store / plrd.org read.

---

## Repo layout

```
src/
  config.ts            Env parsing (BOT_TOKEN, DB path, admins, round size)
  types.ts             Focus areas, roles, Card/Curator types
  db/
    schema.sql         SQLite schema (curators, cards, votes, rounds, sessions)
    index.ts           Connection + idempotent schema bootstrap
    repo.ts            All SQL — the single place persistence is defined
  ranking/
    elo.ts             Elo rating + full recompute from vote history
    segments.ts        Per-role leaderboards + attribute win-rates (conjoint)
  bot/
    index.ts           Commands + callback routing
    onboarding.ts      3-step signup wizard (role → focus → cadence)
    voting.ts          King-of-the-hill match-up flow
    keyboards.ts       Inline keyboards
    copy.ts            All user-facing text + progress-bar helper
    session.ts         Transient per-curator flow state type
  http/server.ts       /health + read-only /api/*.json
  scheduler.ts         Optional daily nudge
  seed/                Sample cards + `npm run seed`
  dev/simulate.ts      Offline harness to sanity-check the ranking maths
  index.ts             Entry point (starts HTTP + bot together)
Dockerfile, fly.toml   Deployment (Chunk 3)
```

---

## Quickstart (local)

**1. Create a bot with @BotFather** (Telegram):

- Open a chat with [@BotFather](https://t.me/BotFather) → send `/newbot`.
- Pick a name (e.g. `PL R&D Radar`) and a username ending in `bot`
  (e.g. `plrd_radar_bot`).
- BotFather replies with a **token** like `123456:ABC-…`. Keep it private.
- (Optional) `/setdescription` and `/setuserpic` to make it look polished.

**2. Configure & install:**

```bash
cp .env.example .env          # then paste your BOT_TOKEN into .env
npm install
npm run seed                  # load sample cards to vote on
```

Find your own Telegram user id via [@userinfobot](https://t.me/userinfobot) and
put it in `ADMIN_IDS` in `.env` to unlock `/stats` and `/leaderboard`.

**3. Run:**

```bash
npm run dev
```

Now message your bot `/start` in Telegram and walk through onboarding → voting.

**Verify the ranking without a bot** (no token needed):

```bash
npm run seed
npx tsx src/dev/simulate.ts   # fabricates curators, prints leaderboards
```

---

## The curator experience

1. **`/start`** → a warm welcome explaining the 30-seconds-a-day deal.
2. **Step 1/3 — Role** (`🔬 Researcher`, `💸 Capital`, …) → segment tag.
3. **Step 2/3 — Focus areas** (multi-select, toggles with ✅) → segment tags.
4. **Step 3/3 — Cadence** (2/3/5 per day, or 🎲 surprise me).
5. **Done 🎉** → one tap to start the first round.

Each step edits the *same message* in place and shows a progress bar
(`▰▰▱ Step 2 of 3`), so it feels like one smooth card. Every match-up also edits
in place, so a whole round is one live message rather than a wall of texts. The
reigning champion is marked `👑 reigning` so curators feel the NYT-style
"does my pick survive the next challenger?" hook.

**Commands:** `/vote` (start a round), `/settings` (redo preferences),
`/pause` / `/resume`, `/help`. Admins also get `/stats` and `/leaderboard`.

---

## The data + ranking model

- **`votes` is the source of truth** — every raw "winner beat loser" pairwise
  preference, tagged with the curator (and therefore their segment).
- **Elo is a derived cache** on each card for instant leaderboards; it can be
  recomputed from scratch at any time (`ranking/elo.ts → recomputeElo`).
- **Segment analysis** (`ranking/segments.ts`) slices the same votes:
  - `leaderboardForRole(role)` — Elo using only that segment's votes.
  - `attributeWinRates(attr, role?)` — how often cards with a given attribute
    (focus area / content type / internal-vs-field) win, per segment. This is
    the conjoint-flavoured "what pulls each segment's preference" view.

---

## Web app (the `/` dashboard)

The HTTP root serves a single-page app (Inter + Newsreader, light/dark, styled
like plrd.org) with a left sidebar:

- **Radar** — the published Radar for a chosen **month** as a swipeable carousel
  (top 5 + "you're all caught up" + Share on X), recycled from plrd.org/insights.
  A **lens** selector switches between the **General Radar** (all votes) and a
  **peer segment** (your role or focus area) — "what people like you found most
  relevant".
- **Vote** — participate in voting (full in-browser flow is the next PR; for now
  it links to the Telegram bot).
- **Data** — curation analytics: who-values-what, per-role preference, curators.

Content is organised by monthly **edition**: only the current month is open for
voting; past months appear as published Radars. Old cards expire out of the pool
automatically.

## Read-only API (what consumers use)

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness probe (required by Fly/PLN). |
| `GET /api/editions.json` | Months available, with labels + a `current` flag. |
| `GET /api/radar.json?edition=&lens=&limit=5` | Top cards for an edition through a lens (`general` / `role:<key>` / `focus:<slug>`), in **`RadarItem`** shape. |
| `GET /api/radar-candidates.json?edition=&limit=6` | Current-edition winners for plrd.org to ingest. |
| `GET /api/overview.json` | Everything the Data view needs (stats, win-rates, curators). |
| `GET /api/leaderboard.json` | Global Elo ranking of the card pool. |
| `GET /api/segments.json` | Per-role leaderboards + attribute win-rates. |

`radar-candidates.json` intentionally matches the `RadarItem` type in
`plrd.org/src/components/PLRadar.tsx`, so the Radar can fetch winners with no
transformation (see **Integrating with plrd.org** below).

---

## Deployment (Chunk 3 — Fly.io)

The bot must stay awake 24/7 (long polling), which rules out free tiers that
sleep. Fly.io runs a tiny always-on machine (~$2/mo, often within free
allowance) with a persistent volume for the SQLite file.

```bash
fly launch --no-deploy                 # create the app (uses fly.toml)
fly volumes create data --size 1       # 1 GB volume for the SQLite file
fly secrets set BOT_TOKEN=… ADMIN_IDS=… DAILY_NUDGE_HOUR=9
fly deploy
```

Secrets live only in Fly's secret store — never in the repo. The read-only API
is exposed over HTTPS for plrd.org and the app-store dashboard to fetch.

---

## Integrating with plrd.org

The public Radar currently derives cards by recency + a hand-picked
`radar-signals.ts`. To let the crowd drive it, fetch the curated winners at
build time:

```ts
// plrd.org — in the Insights page data loader
const res = await fetch(
  'https://plrd-radar-curator.fly.dev/api/radar-candidates.json?limit=6',
  { next: { revalidate: 3600 } },
)
const { items } = await res.json()   // items already match RadarItem
```

Winners flow straight into the existing `PLRadar` component. (Deferred until the
backend is deployed and has real votes.)

---

## Roadmap

- [x] **Chunk 1** — Voting bot MVP: onboarding, king-of-the-hill, SQLite, Elo.
- [x] **Chunk 2** — Ranking + segment analysis + read-only JSON API.
- [ ] **Chunk 3** — Deploy to Fly.io; ship a read-only results dashboard to the
      PL app store; wire plrd.org to consume winners.
- [ ] **Chunk 4** — Internal-source ingestion → candidate pool: **Doro** (news
      crawler), **PL Platform** insights, **PL Capital** portfolio/sourcing, and
      **focus-area lead** picks. Each source normalizes into a `cards` row.

---

## Notes for maintainers

- **Minimal deps by design:** grammY (bot), better-sqlite3 (storage), express
  (API). No ORM, no message broker — the scale (dozens of curators) doesn't
  warrant it, and SQLite → Postgres is a small migration if it ever does.
- **Everything is recomputable.** Delete the Elo cache, re-derive from `votes`.
- **No secrets in the repo.** `.env` and `.data/` are git-ignored; the deploy
  path uses Fly secrets.
