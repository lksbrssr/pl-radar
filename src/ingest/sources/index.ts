/**
 * Source registry.
 *
 * To add a source: create `./your-source.ts` exporting a `Source`, import it
 * here, and add it to the array below. That's the whole PR. See
 * `src/ingest/README.md` for the full guide.
 */
import type { Source } from '../types.js'
import { plrdInsights } from './plrd-insights.js'
import { protocolAiBlog } from './protocol-ai-blog.js'
import { plNeuro } from './plneuro.js'

export const SOURCES: Source[] = [
  plrdInsights,
  protocolAiBlog,
  plNeuro,
  // Add more sources here (Doro, PL Platform, PL Capital, an external RSS/JSON
  // feed, a "submit a card" form, …). One line + one file per source.
]
