# Admin panel (design + status)

> **Status: DRAFT.** Backend (auth, capabilities, endpoints), the Telegram SSO
> entry point, and the admin **overlays** are implemented. Polish + hardening are
> still TODO (see the checklist at the bottom). Everything is gated so it is safe
> to ship incrementally.

> **No standalone Admin tab.** Admin is not a separate page — being an admin just
> unlocks controls **inline** on the existing tabs (decided with the maintainer):
> - **Cards** — edit / hide / delete each card, plus a “show hidden” toggle.
> - **Sources** — rename / deactivate / delete recurring feeds.
> - **Insights** — the curator roster (names/profiles) is **admin-only**, with
>   promote/revoke toggles and an **individual-curator preference lens**. The
>   aggregate “cut by curator type” stays public.
> - **Vote** — a “send a round” (trigger toss-up) button.
> - **Radar / Methodology** — no admin features.
>
> A small **🔐 Admin** badge in the sidebar tells a signed-in admin they're in
> admin mode.

The admin panel gives trusted people a place to **curate the pool and the
sources** and to **run the crowd** without touching the database or the code.
It reuses the pieces the app already has (the magic-link token, the `ADMIN_IDS`
env list, the ingest engine, the nudge broadcaster) rather than inventing new
infrastructure.

## Who is an admin

Two tiers, so there is always a root of trust that can't be locked out:

1. **Root admins** — Telegram user IDs in the `ADMIN_IDS` env var (already used
   for `/stats`, `/leaderboard`). Always admin, hold **every** capability, and
   **cannot be demoted** from the panel. This is the break-glass tier.
2. **Granted admins** — curators promoted by another admin. Stored as
   `curators.is_admin = 1` plus a set of **capabilities** in
   `curator_admin_rights`. A granted admin only has the rights they were given.

## Capabilities

Fine-grained so you can hand someone exactly what the ask described — "rights to
remove or edit sources and cards" — without making them a super-admin:

| right             | lets the holder…                                            |
|-------------------|-------------------------------------------------------------|
| `manage_sources`  | edit / deactivate / remove recurring feed sources           |
| `manage_cards`    | edit / deactivate / remove candidate cards                  |
| `manage_admins`   | promote/demote curators and grant/revoke rights             |
| `trigger_rounds`  | manually kick off a toss-up (match-up) round for curators   |

Root admins implicitly hold all four. Granting a right requires `manage_admins`.

## Authentication — Telegram SSO (no passwords)

Same mechanism as the "vote on the web" magic link, so there is **no new secret
and no password to leak**:

1. In Telegram, an admin runs **`/admin`**. The bot checks `ADMIN_IDS` /
   `is_admin`, mints the caller's stable `web_token` (via
   `getOrCreateCuratorWebToken`), and replies with a deep link:
   `{WEB_URL}/#admin?t=<token>`.
2. The web app stores the token in `localStorage` and sends it on every admin
   request as the `x-admin-token` header.
3. The server resolves `token → curator → admin context` on each call
   (`src/admin/auth.ts`). No admin context ⇒ `401`. Missing the required
   capability ⇒ `403`.

Because it's the curator's real Telegram identity, every admin action is
attributable, and revoking is instant (demote, or rotate the token).

> **Threat model / hardening (TODO):** tokens are currently long-lived (same as
> the vote link). For the panel we should move to **short-TTL, single-use**
> admin tokens (issue on `/admin`, expire in ~15 min, exchange for an
> httpOnly session cookie). Tracked below.

## API surface (`/api/admin/*`, all behind the admin guard)

| method + path                          | right           | action |
|----------------------------------------|-----------------|--------|
| `GET  /api/admin/me`                   | (any admin)     | who am I, which rights |
| `GET  /api/admin/curators`             | `manage_admins` | list curators + admin flags |
| `POST /api/admin/curators/:id/admin`   | `manage_admins` | promote/demote, set rights `{admin, rights[]}` |
| `GET  /api/admin/sources`              | `manage_sources`| list all feed sources (+ card counts) |
| `PATCH  /api/admin/sources/:key`       | `manage_sources`| edit name/description/area/active |
| `DELETE /api/admin/sources/:key`       | `manage_sources`| remove a source (and optionally its cards) |
| `GET  /api/admin/cards`                | `manage_cards`  | list cards for an edition (incl. inactive) |
| `PATCH  /api/admin/cards/:id`          | `manage_cards`  | edit title/description/area/type/active |
| `DELETE /api/admin/cards/:id`          | `manage_cards`  | remove a card (votes cascade) |
| `POST /api/admin/round/trigger`        | `trigger_rounds`| broadcast a fresh match-up round to curators |

All mutations are logged to the server console with the acting curator id.

## "Trigger a toss-up run"

A toss-up = one sitting of pairwise match-ups (the king-of-the-hill flow). The
manual trigger reuses the scheduler's broadcast: it messages every active,
onboarded Telegram curator with the "your match-ups are ready" nudge + a deep
link into a round, on demand (independent of the weekly cadence). Returns how
many curators were pinged. (Later: also support seeding an in-app round for web
voters.)

## UI (overlays, not a tab)

There is no `#admin` view. `GET /api/admin/me` runs on load (via the magic-link
token); when it succeeds we set an in-memory `admin.me`, show the sidebar badge,
and each tab's render function conditionally emits its admin controls via a
`can(right)` check. The bot's `/admin` link (`#admin?t=…`) is a **sign-in
landing**: it captures the token, resolves admin status, then redirects to
`#cards`. Privacy: the public `/api/overview.json` no longer includes the
curator list at all — names/profiles come only from `/api/admin/curators`.

The card **edit** modal reuses the add-card wizard's modal chrome + form fields
(prefilled), saving via `PATCH /api/admin/cards/:id`.

## Data model

```sql
ALTER TABLE curators ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0; -- migration

CREATE TABLE curator_admin_rights (
  curator_id INTEGER NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  right      TEXT NOT NULL,   -- manage_sources | manage_cards | manage_admins | trigger_rounds
  granted_by INTEGER,         -- curator id of the granter
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (curator_id, right)
);
```

## Checklist

- [x] Schema + migration (`is_admin`, `curator_admin_rights`)
- [x] Auth/capability resolver (`src/admin/auth.ts`)
- [x] repo helpers (admin flags, rights, card/source edit+remove)
- [x] `/api/admin/*` routes behind the guard
- [x] `/admin` Telegram command → SSO deep link
- [x] Overlays on Cards / Sources / Insights / Vote (no standalone tab)
- [x] Curator roster made admin-only (removed from public overview)
- [x] Individual-curator preference lens (`/api/admin/curator-fit`)
- [x] Card edit modal (reuses the add-card wizard form)
- [x] Sidebar admin badge
- [x] CODEOWNERS + `admin-guard` CI check on the trust boundary
- [ ] Short-TTL single-use admin tokens + httpOnly session cookie
- [ ] Audit-log table (persist admin actions, not just console)
- [ ] Seed in-app rounds for web voters on manual trigger
- [ ] Tests for the capability guard
