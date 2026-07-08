# AGENTS.md — start here

You're working on the **PL R&D Radar crowd-curation** project. This file is the
cold-start briefing so a fresh session can ship a PR **without** a long
hand-holding conversation. Read this, skim the `README.md` sections it points to,
then work.

## What this is (one paragraph)

A Telegram bot + web app that uses the **wisdom of the crowd** to decide what
goes into the public [PL R&D Radar](https://github.com/daviddao/plrd.org) — a
monthly "catch up in a minute" digest. Curators opt in via Telegram and vote on
**pairwise match-ups** (king-of-the-hill: winner stays, faces a new challenger).
Votes feed an **Elo** ranking; the top ~5 cards of the current monthly **edition**
become that month's Radar. A public web app shows the Radar (with a peer "lens"),
a Vote view, and curation analytics.

## Facts you need

- **Repo:** `github.com/lksbrssr/plrd-radar-curator` (public). Default branch `main`.
- **Language/stack:** Node ≥20, **TypeScript** (run via `tsx`, no separate build in dev).
  - **grammY** — Telegram bot framework (long polling, no webhook).
  - **better-sqlite3** — storage. One file; `votes` is the source of truth, Elo is a derived cache.
  - **Express** — the read-only HTTP API + the single-page web app.
  - **@napi-rs/canvas** — renders the composite match-up images sent in Telegram (bundled Inter font).
  - Web design mirrors **plrd.org**: **Inter** (body) + **Newsreader** (serif headings), light/dark, plrd color tokens.
- **Hosting: Fly.io** (two apps):
  - `plrd-radar-curator` — **production**: the bot + web + API, deployed from `main`, persistent SQLite volume, `BOT_TOKEN` in Fly secrets. URL: `https://plrd-radar-curator.fly.dev`.
  - `plrd-radar-curator-preview` — **preview**: web-only (no bot), ephemeral self-seeding DB, no secrets. URL: `https://plrd-radar-curator-preview.fly.dev`.
- **Secrets:** none live in the repo. `BOT_TOKEN` is a Fly secret on production only. Never commit `.env` or tokens.

## Golden rules

1. **Never run the Telegram bot locally against the production token.** Telegram
   allows only ONE long-poller per token; a second one breaks production. For UI
   work use the HTTP-only server: `PORT=4650 npm run dev:serve`.
2. **Work on a branch, open a PR** (don't push to `main`). See workflow below.
3. **Secrets never enter the repo.** `.env`, `.data/`, `*.sqlite` are git-ignored — keep it that way.
4. **`votes` is the source of truth**; any Elo/ranking can be recomputed from it.
5. Match the **plrd.org** look (tokens + Inter/Newsreader) for anything user-facing.

## Local setup

```bash
npm install
cp .env.example .env          # only needed to run the bot; NOT needed for web/UI work
npm run seed                  # load the ~25-card demo pool
npm run simulate              # (optional) fabricate ~40 curators + votes so the UI looks real
PORT=4650 npm run dev:serve   # web app + API only (no bot) at http://localhost:4650
```

To work on the bot itself you need a token from @BotFather in `.env`, then
`npm run dev`. Use a **throwaway bot**, never production's.

## Shipping a PR (the workflow)

```bash
git checkout main && git pull
git checkout -b feat/your-thing
# ...make changes...
npm run typecheck             # must pass
git commit -am "feat: ..." && git push -u origin feat/your-thing
gh pr create --base main --fill
```

- **Visual change? Include a screenshot in the PR** (see the `pr-with-screenshot`
  skill). GitHub can't embed private/branch raw URLs, so: commit the PNG under
  `docs/screenshots/`, and reference it by **commit SHA** (branch names contain
  slashes and break raw URLs):
  `https://raw.githubusercontent.com/lksbrssr/plrd-radar-curator/<SHA>/docs/screenshots/foo.png`
- **Deploy a live preview** of your branch so the reviewer can click it:
  ```bash
  fly deploy --config fly.preview.toml --app plrd-radar-curator-preview
  ```
  Put the preview URL at the top of the PR body.

## Multiple agents at once — IMPORTANT

Several agents/people may work on this repo **simultaneously**. Assume `main`
moves under you:

- **Rebase before you finish / before merge:** `git fetch origin && git rebase origin/main`, resolve, re-push (`git push --force-with-lease`). Don't let a branch rot.
- **The preview app is a single shared URL** (`plrd-radar-curator-preview`). Whoever deploys last wins — deploying your branch **overwrites** anyone else's preview. So:
  - Treat the shared preview as *transient*: deploy it to demo your branch, tell the reviewer, and don't assume it stays on your branch.
  - If two previews are needed at once, spin up a throwaway app:
    `fly apps create plrd-radar-curator-pr-<n> --org personal` then
    `fly deploy --config fly.preview.toml --app plrd-radar-curator-pr-<n>`
    (delete it after: `fly apps destroy plrd-radar-curator-pr-<n>`).
- **Can other people see previews?** Yes — the preview is a public HTTPS URL; anyone with the link can open it (no login). The only caveat is the shared-URL "last deploy wins" point above.
- **Don't run two bots.** Only production polls Telegram. Never `npm run dev` (bot) against the prod token from a second machine/session.

## Deploying to production (on merge)

Requires Fly auth (`fly auth login`) as the repo owner. Secrets are already set.

```bash
git checkout main && git pull
fly deploy --app plrd-radar-curator --ha=false
# schema migrations run automatically on boot (see src/db/index.ts)
```

Demo/simulated curators have ids ≥ 900000 and can be wiped without touching real
data. Real curators come from Telegram.

## Where to read more (README.md)

- **Architecture / repo layout** — how the bot, HTTP, DB, ranking fit together.
- **Web app** — the sidebar views (Radar / Vote / Data), editions, the lens.
- **Read-only API** — endpoints other systems (and the web app) consume.
- **Roadmap** — what's done and what's next (e.g. in-browser voting, ingestion).
