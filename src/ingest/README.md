# Source ingestion

Sources feed candidate cards into the Radar's monthly pool. Anyone can add a
source — it's designed to be a **one-file pull request**.

## Run it

```bash
npm run ingest                      # fetch all sources → current edition
npm run ingest -- --dry             # preview only, write nothing
npm run ingest -- --source=plrd-insights
npm run ingest -- --since-days=30   # only items from the last 30 days (0 = all)
```

Ingestion is idempotent (upsert by card `key`), so it's safe to run repeatedly
or on a daily cron.

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
