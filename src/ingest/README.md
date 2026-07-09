# Source ingestion

Sources feed candidate cards into the Radar's monthly pool. Anyone can add a
source — it's designed to be a **one-file pull request**.

Each card is filed into the **edition (YYYY-MM) matching its publication month**,
so a talk published in June lands in the June Radar and a July post in July. By
default ingestion only accepts an allowlist of editions (currently **June & July
2026**); older content is out of scope.

There are three kinds of source: **code-defined** (a file in this folder),
**dynamic** (a recurring feed people add through the web app, stored in the
`feed_sources` table and surfaced by `sources/dynamic.ts`), and one-off
**community cards** (submitted through the web app, filed under the `community`
key). All three flow through the same content/dedup layer and ingest engine
(`allSources()` in `sources/index.ts` returns code + dynamic together).

## Built-in sources

- **`plrd-insights`** — talks, podcasts, publications & posts from
  `plrd.org/insights` (RSS backbone, header images scraped from the listing).
- **`protocol-ai-blog`** — announcements & essays from `protocol.ai/blog`
  (`protocol.ai/rss.xml`, header images via RSS `<enclosure>`).
- **`plneuro`** — talks, interviews & posts from the PL neurotech program
  (`plneuro.xyz/feed/`). Header image + dedup identity come from the first
  YouTube embed in the post body.

## Dedup (content layer)

Before a candidate becomes a card it is resolved to a canonical **content** by a
deterministic identity (YouTube video id, else normalized URL — see
`identity.ts`). Cross-posts of the same asset (e.g. a talk on both plrd.org and
plneuro.xyz) collapse to **one card**, with every source kept as provenance in
`content_sources`. The highest-precedence source (`plrd-insights` first) supplies
the canonical title/url/area; description is best-of (longest), image is the
primary's. A `↻ dedup` line in the ingest output marks a collapsed cross-post.

**Self-healing:** if a cross-post entered the pool *before* its strong identity
was known (e.g. a plneuro talk stored under its URL before we mined the YouTube
id), the next ingest detects the stale URL-content for the same link and merges
it into the canonical content — migrating any votes onto the surviving card and
keeping both provenances. So re-running ingest reconciles old duplicates too.

**Runs automatically:** the full (bot) process re-ingests every source (code
**and** dynamic DB feeds) every `INGEST_INTERVAL_HOURS` (default 3; `0` disables),
so the pool stays deduped as sources publish without anyone running the CLI.
Because dedup happens on write, any newly-added card is deduped as it lands.

## On-mission filtering (off-topic drop)

External ("field") sources often publish plenty that has nothing to do with PL
R&D's focus areas — an agency's general org updates, hiring news, birthday
posts. Rather than dumping those into the generic **Protocol Labs** catch-all,
ingestion **drops** a candidate when ALL of these hold:

- the source is `external: true`,
- the item only landed in the `protocol-labs` fallback bucket (no research-area
  match), **and**
- its title+description match **no** focus-area keyword and **no** Protocol Labs
  signal (filecoin/ipfs/libp2p/…), per `inferAreaOrNull()` in `util.ts`.

Explicitly-tagged items (a real research area, or a feed `area_slug` override)
and every **internal** PL source are never dropped. Keyword matching is
boundary-aware with stem support (`neuro*` catches neuron/neuroscience; `ai`
matches `AI-driven` but not `said`), and it deliberately errs toward *keeping*
borderline cards. Dropped items are reported as **off-mission** in the ingest
output and the add-a-source result. Set `DROP_OFF_MISSION=0` to keep everything
(the old catch-all behaviour). Re-ingest is idempotent, so improving the keyword
banks later recovers anything that was previously dropped.

## Add a card or source from the web app (AI-assisted)

The **Sources → Add a card or source** panel is the zero-code path. It's gated
by `SUBMIT_KEY` (so the site only burns AI tokens for people you trust — see the
root `.env.example`) and, when an LLM key is set, uses it to do the parsing:

- **Add a card:** paste *any* URL (article, Reddit/X post, paper, video). The
  server fetches the page, an LLM drafts the card (title, description, area,
  type, angle, attribution), and you review/edit before it lands in the open
  edition as a `community` card. A **dedup check runs up front and again on
  save** — a duplicate is refused with a link to the existing card. If the AI
  isn't configured or the fetch fails, the UI **falls back to a manual form**
  (and can still hand a PR prompt to your own agent).
- **Add a recurring source:** paste a site/feed URL. The server discovers the
  RSS/Atom feed, previews the cards it would add, and dedups against feeds we
  already poll; on confirm it's saved to `feed_sources` and polled on the normal
  ingest schedule. **No manual fallback** here — it needs a real feed.

The endpoints live in `src/http/server.ts` (`/api/submit/*`) and the parsing in
`src/submit/` (`fetch.ts` → `llm.ts` → `parse.ts`, with `dedup.ts`).

## Run it

```bash
npm run ingest                          # all sources → June & July 2026
npm run ingest -- --dry                 # preview only, write nothing
npm run ingest -- --source=plrd-insights
npm run ingest -- --editions=2026-07    # only a specific month
npm run ingest -- --editions=all        # every month (ignore the allowlist)
```

Items with no publication date can't be placed in a month and are skipped
(reported as "undated"). Ingestion is idempotent (upsert by card `key`), so it's
safe to run repeatedly or on a daily cron.

## Add a source (PR checklist)

1. Create `src/ingest/sources/<your-source>.ts` exporting a `Source`
   (see `../types.ts`):

   ```ts
   import type { Source, Candidate } from '../types.js'
   import { inferArea, inferType, areaLabel, slugify } from '../util.js'

   export const mySource: Source = {
     key: 'my-source',
     name: 'My Source',
     description: 'What this pulls in, in one line.',
     external: true, // true for third-party "field signals"
     async fetch(): Promise<Candidate[]> {
       // Fetch your feed/API. Do NOT write to the DB here — just return cards.
       const res = await fetch('https://example.com/feed.json')
       const data = await res.json()
       return data.items.map((it) => ({
         key: `my-${slugify(it.id)}`,          // stable + unique
         title: it.title,
         description: it.summary,
         href: it.url,
         source: 'My Source',
         sourceKind: 'field',                   // 'internal' | 'field'
         type: inferType(it.url, it.title),     // or set explicitly
         areaSlug: inferArea(`${it.title} ${it.summary}`),
         areaLabel: areaLabel(inferArea(`${it.title} ${it.summary}`)),
         image: it.image,
         publishedAt: it.date,                  // ISO string, for recency
       }))
     },
   }
   ```

2. Register it in `src/ingest/sources/index.ts`:

   ```ts
   import { mySource } from './my-source.js'
   export const SOURCES: Source[] = [plrdInsights, mySource]
   ```

3. `npm run ingest -- --source=my-source --dry` to sanity-check the output,
   then open a PR. Include a screenshot or the dry-run output.

> Tip: the web app's **Sources → Add a source or card** walkthrough generates a
> ready-to-paste prompt for a coding agent (Claude Code, Cursor, …) that does all
> of the above for you.

## Submit a single card (no recurring source)

If you just want to drop in **one** item once — a specific talk, paper, post or
signal — you don't need a whole source. Add it to the hand-curated
`community` source instead:

1. Open `src/ingest/sources/community.ts` (create it if missing) exporting a
   `Source` with `key: 'community'`, `keyPrefix: 'community-'`, `external: true`,
   and a `fetch()` that returns a hard-coded `Candidate[]` (no network, no DB).
2. Append your card as a `Candidate` with a stable `key` (e.g.
   `community-<slug>`), `sourceKind: 'field'`, and a valid `areaSlug`.
3. Register it in `index.ts` (only needed the first time the file is created).
4. `npm run typecheck` and `npm run ingest -- --source=community --dry`, then PR.

The Sources walkthrough in the web app can generate this prompt for you too.

## Rules

- **`fetch()` is read-only** — return `Candidate[]`, never touch the database.
  The runner handles upserts, editions, and dedup.
- **Stable keys.** Derive `key` from a stable id/URL so re-runs update instead
  of duplicating.
- **No secrets in the repo.** If a source needs an API key, read it from an env
  var and document it; never commit it.
- **Keep dependencies minimal.** Prefer `fetch` + the helpers in `util.ts`
  (there's a tiny RSS parser) over adding libraries.
- `areaSlug` must be one of the four focus-area slugs in `src/types.ts`. When a
  source doesn't provide the area/type, `inferArea` / `inferType` give a
  best-effort guess (explicit card tags, maintained separately, refine this).
