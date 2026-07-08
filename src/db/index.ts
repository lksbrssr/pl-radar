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
import { contentIdentity } from '../ingest/identity.js'

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
if (!columnExists('curators', 'web_token')) {
  db.exec('ALTER TABLE curators ADD COLUMN web_token TEXT')
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_curators_web_token ON curators(web_token)',
  )
}
// Content layer: link each card to its canonical content (nullable → backfilled
// below). ADD COLUMN with a REFERENCES clause is allowed because the default is
// NULL; the `content` table is created above via schema.sql.
if (!columnExists('cards', 'content_id')) {
  db.exec('ALTER TABLE cards ADD COLUMN content_id INTEGER REFERENCES content(id)')
}
db.exec('CREATE INDEX IF NOT EXISTS idx_cards_content ON cards(content_id)')

// Backfill any card missing an edition from its creation month.
db.exec(
  `UPDATE cards SET edition = strftime('%Y-%m', created_at) WHERE edition IS NULL`,
)

// --- Content backfill (idempotent) -----------------------------------------
// Wrap every not-yet-linked card in a canonical `content` (1:1), so the content
// layer is populated for pre-existing data without changing the pool or
// rankings. Uses the SAME identity logic as ingest, so re-ingesting those cards
// later resolves to the same content (no duplicate content/cards).
function sourceKeyForCardKey(key: string): string {
  if (key.startsWith('plrd-')) return 'plrd-insights'
  if (key.startsWith('protocol-')) return 'protocol-ai-blog'
  if (key.startsWith('plneuro-')) return 'plneuro'
  if (key.startsWith('community-')) return 'community'
  return 'backfill'
}

const toBackfill = db
  .prepare(
    `SELECT id, key, title, description, href, source, source_kind, type,
            area_slug, area_label, edition, image, created_at
     FROM cards WHERE content_id IS NULL`,
  )
  .all() as {
  id: number; key: string; title: string; description: string | null; href: string
  source: string | null; source_kind: string; type: string; area_slug: string
  area_label: string; edition: string | null; image: string | null; created_at: string
}[]

if (toBackfill.length) {
  const findContent = db.prepare('SELECT id FROM content WHERE identity_key = ?')
  const insContent = db.prepare(
    `INSERT INTO content
       (identity_key, identity_kind, canonical_source_key, canonical_title,
        canonical_url, description, image, area_slug, area_label, type, source,
        source_kind, published_at, edition, created_at)
     VALUES (@identity_key, @identity_kind, @canonical_source_key, @canonical_title,
        @canonical_url, @description, @image, @area_slug, @area_label, @type, @source,
        @source_kind, NULL, @edition, @created_at)`,
  )
  const insSource = db.prepare(
    `INSERT OR IGNORE INTO content_sources
       (content_id, source_key, source_url, source_title, source_description, source_image)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const linkCard = db.prepare('UPDATE cards SET content_id = ? WHERE id = ?')
  const run = db.transaction(() => {
    for (const c of toBackfill) {
      const idn = contentIdentity({ href: c.href, image: c.image })
      const existing = findContent.get(idn.key) as { id: number } | undefined
      let contentId: number
      if (existing) {
        contentId = existing.id
      } else {
        contentId = Number(
          insContent.run({
            identity_key: idn.key,
            identity_kind: idn.kind,
            canonical_source_key: sourceKeyForCardKey(c.key),
            canonical_title: c.title,
            canonical_url: c.href,
            description: c.description,
            image: c.image,
            area_slug: c.area_slug,
            area_label: c.area_label,
            type: c.type,
            source: c.source,
            source_kind: c.source_kind,
            edition: c.edition,
            created_at: c.created_at,
          }).lastInsertRowid,
        )
      }
      insSource.run(
        contentId,
        sourceKeyForCardKey(c.key),
        c.href,
        c.title,
        c.description,
        c.image,
      )
      linkCard.run(contentId, c.id)
    }
  })
  run()
  console.log(`[migrate] linked ${toBackfill.length} card(s) to content`)
}

export default db
