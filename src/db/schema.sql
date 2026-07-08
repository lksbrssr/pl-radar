-- PL R&D Radar — crowd curation schema (SQLite)
--
-- Design notes for future readers:
--  * `curators` = people who opted in via the Telegram bot. Segment tags
--    (role + focus areas) power the "who cares about what" (conjoint-style)
--    analysis.
--  * `cards` = candidate items to be voted on. Shape mirrors plrd.org's
--    `RadarItem` so the winners drop straight into the public Radar.
--  * `votes` = the raw pairwise preferences ("winner beat loser"). This is the
--    source of truth; Elo ratings are a derived cache we can always recompute.
--  * `sessions` = transient per-curator state for the onboarding wizard and the
--    king-of-the-hill voting flow (stored as JSON).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- People who opted in to curate. `id` is the Telegram user id.
CREATE TABLE IF NOT EXISTS curators (
  id             INTEGER PRIMARY KEY,          -- Telegram user id
  username       TEXT,
  first_name     TEXT,
  role           TEXT,                         -- segment tag: researcher/engineer/capital/...
  cadence        INTEGER,                      -- preferred pairs per day
  status         TEXT NOT NULL DEFAULT 'active', -- active | paused
  web_token      TEXT UNIQUE,                   -- set for web voters (localStorage token); NULL for Telegram curators
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  onboarded_at   TEXT,                         -- set when the wizard completes
  last_active_at TEXT
);

-- Many-to-many: a curator's focus-area interests (segment tags).
CREATE TABLE IF NOT EXISTS curator_focus (
  curator_id INTEGER NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  area_slug  TEXT NOT NULL,                    -- digital-human-rights | economies-governance | ai-robotics | neurotech
  PRIMARY KEY (curator_id, area_slug)
);

-- The canonical underlying asset (a talk, a post) that one or more source items
-- map to. Cross-posts (same YouTube video / URL from different sources) collapse
-- to one `content` row via `identity_key`. Cards link up to content; the votable
-- unit is still the card. See src/ingest/identity.ts + docs/card-presentation.md.
CREATE TABLE IF NOT EXISTS content (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_key        TEXT UNIQUE NOT NULL,        -- 'yt:<videoId>' | 'url:<canonicalUrl>'
  identity_kind       TEXT NOT NULL,               -- youtube | url
  canonical_source_key TEXT,                       -- which source currently owns the canonical fields (precedence)
  canonical_title     TEXT NOT NULL,
  canonical_url       TEXT NOT NULL,
  description         TEXT,
  image               TEXT,
  area_slug           TEXT,
  area_label          TEXT,
  type                TEXT,
  source              TEXT,                        -- canonical source display name (e.g. 'PL R&D')
  source_kind         TEXT,                        -- internal | field
  published_at        TEXT,
  edition             TEXT,                        -- YYYY-MM
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Provenance: every raw source item that mapped to a content. Lets us keep all
-- attributions (plrd.org AND plneuro.xyz both listed) and re-derive canonical
-- fields. UNIQUE(source_key, source_url) keeps re-ingest idempotent.
CREATE TABLE IF NOT EXISTS content_sources (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id         INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  source_key         TEXT NOT NULL,               -- e.g. 'plrd-insights'
  source_url         TEXT NOT NULL,
  source_title       TEXT,
  source_description TEXT,
  source_image       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_key, source_url)
);
CREATE INDEX IF NOT EXISTS idx_content_sources_content ON content_sources(content_id);

-- Candidate cards to be voted on. Mirrors plrd.org RadarItem + attributes for
-- the conjoint-style breakdown (type, area, source-kind).
CREATE TABLE IF NOT EXISTS cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT UNIQUE NOT NULL,            -- stable slug
  title       TEXT NOT NULL,
  description TEXT,
  href        TEXT NOT NULL,
  source      TEXT,                            -- e.g. "SCOTUSblog", "Doro", "PL Capital"
  source_kind TEXT NOT NULL DEFAULT 'internal',-- internal | field (attribute for analysis)
  type        TEXT NOT NULL DEFAULT 'Signal',  -- Talk | Podcast | Publication | Blog | Signal
  area_slug   TEXT NOT NULL,
  area_label  TEXT NOT NULL,
  edition     TEXT,                            -- YYYY-MM: which monthly Radar this card belongs to
  image       TEXT,
  external    INTEGER NOT NULL DEFAULT 0,      -- 0/1
  active      INTEGER NOT NULL DEFAULT 1,      -- only active cards enter matchups
  rating      REAL NOT NULL DEFAULT 1500,      -- Elo (derived cache)
  matches     INTEGER NOT NULL DEFAULT 0,      -- comparisons this card has been in
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Raw pairwise preferences. Source of truth for all rankings.
CREATE TABLE IF NOT EXISTS votes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  curator_id     INTEGER NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  winner_card_id INTEGER NOT NULL REFERENCES cards(id),
  loser_card_id  INTEGER NOT NULL REFERENCES cards(id),
  round_id       INTEGER REFERENCES rounds(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_votes_curator ON votes(curator_id);
CREATE INDEX IF NOT EXISTS idx_votes_winner ON votes(winner_card_id);
CREATE INDEX IF NOT EXISTS idx_votes_loser ON votes(loser_card_id);

-- A "round" = one sitting of ROUND_SIZE comparisons (king-of-the-hill).
CREATE TABLE IF NOT EXISTS rounds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  curator_id   INTEGER NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  size         INTEGER NOT NULL,
  comparisons  INTEGER NOT NULL DEFAULT 0,     -- how many votes cast so far
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Extensible curator attributes ("who are you" answers beyond role + focus).
-- Future onboarding questions land here as key/value rows, so adding a question
-- never requires a schema change and the lens can filter on any of them.
CREATE TABLE IF NOT EXISTS curator_traits (
  curator_id  INTEGER NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  trait_key   TEXT NOT NULL,                 -- e.g. 'seniority', 'org', 'timezone'
  trait_value TEXT NOT NULL,
  PRIMARY KEY (curator_id, trait_key, trait_value)
);

-- Extensible card attributes (EAV), mirroring `curator_traits` on the card
-- side. `attr_key='angle'` holds the primary rhetorical hook today (with
-- `attr_key='angle_secondary'` for an optional second angle). Future card
-- attributes (e.g. 'format', 'novelty') land here as new keys, so adding one
-- never requires a schema change and attribute-win-rate reads can group by any
-- of them — exactly as the segment analysis does for curator traits.
--
-- Why EAV over a plain `angle TEXT` column on `cards`: the brief anticipates
-- more card attributes soon, and this pattern already exists for curators, so
-- reusing it keeps the two "who/what has which tags" stories symmetric and
-- avoids a column-churn migration each time we add an attribute.
CREATE TABLE IF NOT EXISTS card_attributes (
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  attr_key   TEXT NOT NULL,                 -- e.g. 'angle', 'angle_secondary'
  attr_value TEXT NOT NULL,                 -- e.g. 'counterintuitive'
  PRIMARY KEY (card_id, attr_key, attr_value)
);
CREATE INDEX IF NOT EXISTS idx_card_attributes_key
  ON card_attributes(attr_key, attr_value);

-- Transient per-curator state (onboarding wizard step, active voting flow).
CREATE TABLE IF NOT EXISTS sessions (
  curator_id INTEGER PRIMARY KEY REFERENCES curators(id) ON DELETE CASCADE,
  state      TEXT NOT NULL DEFAULT '{}',       -- JSON blob
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
