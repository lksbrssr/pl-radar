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
import { dynamicSources } from './dynamic.js'

/** Code-defined sources (one file + one line each). */
export const SOURCES: Source[] = [
  plrdInsights,
  protocolAiBlog,
  plNeuro,
  // Add more sources here (Doro, PL Platform, PL Capital, an external RSS/JSON
  // feed, …). One line + one file per source.
]

/**
 * Every source the ingest engine should run: the code-defined ones above PLUS
 * the recurring feeds people added through the web app (loaded from the DB).
 * Re-read on each call so newly added feeds are picked up without a restart.
 */
export function allSources(): Source[] {
  return [...SOURCES, ...dynamicSources()]
}
