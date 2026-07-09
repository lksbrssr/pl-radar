/** Shared domain types. */

/** The four PL R&D focus areas. Slugs match plrd.org exactly. */
export const FOCUS_AREAS = [
  { slug: 'digital-human-rights', label: 'Digital Human Rights', emoji: '🛡️' },
  { slug: 'economies-governance', label: 'Economies & Governance', emoji: '⚖️' },
  { slug: 'ai-robotics', label: 'AI & Robotics', emoji: '🤖' },
  { slug: 'neurotech', label: 'Neurotech', emoji: '🧠' },
  // Catch-all for items that don't fit a research focus area cleanly — e.g. org
  // / company announcements and general Protocol Labs news.
  { slug: 'protocol-labs', label: 'Protocol Labs', emoji: '🔷' },
] as const

export type AreaSlug = (typeof FOCUS_AREAS)[number]['slug']

/** Curator role segments (for the conjoint-style "who cares about what"). */
export const ROLES = [
  { key: 'researcher', label: 'Researcher / Scientist', emoji: '🔬' },
  { key: 'engineer', label: 'Engineer / Builder', emoji: '🛠️' },
  { key: 'capital', label: 'Capital / Investment', emoji: '💸' },
  { key: 'platform', label: 'Platform / Ops', emoji: '🧩' },
  { key: 'founder', label: 'Founder / Lead', emoji: '🚀' },
  { key: 'comms', label: 'Comms / Marketing', emoji: '📣' },
  { key: 'other', label: 'Something else', emoji: '✨' },
] as const

export type RoleKey = (typeof ROLES)[number]['key']

/**
 * Card ANGLES — the emotional/rhetorical hook that explains *why* a real signal
 * lands, kept orthogonal to its topic (focus area) and format (type). Tagging an
 * angle lets the analysis separate "what pulls a segment" (topic) from "how it
 * pulls" (angle). Each card gets one primary angle (optional secondary).
 *
 * Discipline: the angle names why a genuine signal is compelling; it must never
 * inflate a weak card. If the honest read is "incremental," tag it that way
 * (`clarifying`/`proof` are the honest homes for solid-but-unflashy work). No
 * manufactured outrage.
 */
export const ANGLES = [
  { key: 'counterintuitive', label: 'Counterintuitive', emoji: '🔀', hint: 'cuts against the obvious read' },
  { key: 'big-if-true', label: 'Big if true', emoji: '🎲', hint: 'high-stakes claim worth watching' },
  { key: 'early-signal', label: 'Early signal', emoji: '🌱', hint: 'faint but real, ahead of the curve' },
  { key: 'provocative', label: 'Provocative', emoji: '⚡', hint: 'challenges a comfortable consensus' },
  { key: 'funny', label: 'Funny', emoji: '😄', hint: 'lands because it is genuinely fun' },
  { key: 'clarifying', label: 'Clarifying', emoji: '🔎', hint: 'makes a messy topic legible' },
  { key: 'proof', label: 'Proof', emoji: '✅', hint: 'shows something actually works' },
] as const

export type AngleKey = (typeof ANGLES)[number]['key']

export type Card = {
  id: number
  key: string
  title: string
  description: string | null
  href: string
  source: string | null
  source_kind: 'internal' | 'field'
  type: string
  area_slug: string
  area_label: string
  edition: string | null
  image: string | null
  external: number
  active: number
  rating: number
  matches: number
  created_at: string
  /** Primary rhetorical hook (from card_attributes, attr_key='angle'). */
  angle: string | null
}

export type Curator = {
  id: number
  username: string | null
  first_name: string | null
  role: string | null
  cadence: number | null
  status: string
  /** Magic-link/browser-voter token; NULL for chat-only Telegram curators. */
  web_token: string | null
  created_at: string
  onboarded_at: string | null
  last_active_at: string | null
}
