# Source ingestion

Sources feed candidate cards into the Radar's monthly pool. Anyone can add a
source — it's designed to be a **one-file pull request**.

Each card is filed into the **edition (YYYY-MM) matching its publication month**,
so a talk published in June lands in the June Radar and a July post in July. By
default ingestion only accepts an allowlist of editions (currently **June & July
2026**); older content is out of scope.

## Built-in sources

- **`plrd-insights`** — talks, podcasts, publications & posts from
  `plrd.org/insights` (RSS backbone, header images scraped from the listing).
- **`protocol-ai-blog`** — announcements & essays from `protocol.ai/blog`
  (`protocol.ai/rss.xml`, header images via RSS `<enclosure>`).
- **`plneuro`** — talks, interviews & posts from the PL neurotech program
  (`plneuro.xyz/feed/`). No feed images yet; can cross-post talks that also come
  via `plrd-insights`, so it may produce duplicates until dedup lands.

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
