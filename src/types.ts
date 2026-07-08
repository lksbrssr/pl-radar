/** Shared domain types. */

/** The four PL R&D focus areas. Slugs match plrd.org exactly. */
export const FOCUS_AREAS = [
  { slug: 'digital-human-rights', label: 'Digital Human Rights', emoji: '🛡️' },
  { slug: 'economies-governance', label: 'Economies & Governance', emoji: '⚖️' },
  { slug: 'ai-robotics', label: 'AI & Robotics', emoji: '🤖' },
  { slug: 'neurotech', label: 'Neurotech', emoji: '🧠' },
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
}

export type Curator = {
  id: number
  username: string | null
  first_name: string | null
  role: string | null
  cadence: number | null
  status: string
  created_at: string
  onboarded_at: string | null
  last_active_at: string | null
}
