/**
 * Ingestion stats for the Sources view. Kept here (querying the DB directly)
 * rather than in db/repo.ts so it doesn't collide with parallel repo changes.
 */
import db from '../db/index.js'

/**
 * How many active cards a source has contributed to the pool (across all
 * editions), matched by the source's card-key prefix (e.g. "plrd-"). Cards are
 * ingested into the edition matching their publication month, so counting a
 * single edition would undercount a source that spans months. No schema change.
 */
export function activeCardCountByKeyPrefix(prefix: string): number {
  if (!prefix) return 0
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM cards
         WHERE active = 1 AND key LIKE ?`,
      )
      .get(prefix + '%') as { n: number }
  ).n
}
