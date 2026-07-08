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

-- Transient per-curator state (onboarding wizard step, active voting flow).
CREATE TABLE IF NOT EXISTS sessions (
  curator_id INTEGER PRIMARY KEY REFERENCES curators(id) ON DELETE CASCADE,
  state      TEXT NOT NULL DEFAULT '{}',       -- JSON blob
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
