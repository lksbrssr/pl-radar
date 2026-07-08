/**
 * SQLite connection + schema bootstrap.
 *
 * We use better-sqlite3 (synchronous, fast, zero-config) which is ideal for the
 * modest scale here (~dozens of curators). The whole DB is a single file, so
 * it's trivial to back up, inspect, or migrate to Postgres later.
 */
import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const here = dirname(fileURLToPath(import.meta.url))

// Ensure the directory for the DB file exists (e.g. ./.data).
mkdirSync(dirname(resolve(config.databasePath)), { recursive: true })

export const db = new Database(config.databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Apply the schema (idempotent — every statement is CREATE ... IF NOT EXISTS).
const schema = readFileSync(resolve(here, 'schema.sql'), 'utf8')
db.exec(schema)

// --- Lightweight migrations for DBs created before a column existed ---------
function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
  }[]
  return cols.some((c) => c.name === column)
}

if (!columnExists('cards', 'edition')) {
  db.exec('ALTER TABLE cards ADD COLUMN edition TEXT')
}
// Backfill any card missing an edition from its creation month.
db.exec(
  `UPDATE cards SET edition = strftime('%Y-%m', created_at) WHERE edition IS NULL`,
)

export default db
