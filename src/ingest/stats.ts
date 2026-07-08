/**
 * Ingestion stats for the Sources view. Kept here (querying the DB directly)
 * rather than in db/repo.ts so it doesn't collide with parallel repo changes.
 */
import db from '../db/index.js'
import { currentEdition } from '../config.js'

/**
 * How many active current-edition cards a source contributed, matched by the
 * source's card-key prefix (e.g. "plrd-"). No schema change required.
 */
export function activeCardCountByKeyPrefix(prefix: string): number {
  if (!prefix) return 0
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM cards
         WHERE active = 1 AND edition = ? AND key LIKE ?`,
      )
      .get(currentEdition(), prefix + '%') as { n: number }
  ).n
}
