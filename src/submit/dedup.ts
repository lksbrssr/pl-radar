/**
 * "Has someone already added this?" — the check that runs on every submission.
 *
 * Layer 1 (deterministic): resolve the URL to a content identity (YouTube id or
 * canonical URL, see ingest/identity.ts) and look for a card already linked to
 * it. Layer 2 (cheap fuzzy): a normalized-title exact match against the current
 * edition, catching the same story posted under a different link. Either hit
 * returns the existing card so the UI can explain *why* the submission was
 * blocked and link straight to it.
 */
import { contentIdentity } from '../ingest/identity.js'
import { findCardByIdentity, getActiveCards } from '../db/repo.js'
import type { Card } from '../types.js'

function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export type DuplicateHit = { reason: 'identity' | 'title'; card: Card }

export function findDuplicate(input: {
  href: string
  image?: string | null
  title?: string
}): DuplicateHit | null {
  const id = contentIdentity({ href: input.href, image: input.image ?? null })
  const byIdentity = findCardByIdentity(id.key)
  if (byIdentity) return { reason: 'identity', card: byIdentity }

  if (input.title) {
    const t = normTitle(input.title)
    if (t.length >= 8) {
      for (const c of getActiveCards()) {
        if (normTitle(c.title) === t) return { reason: 'title', card: c }
      }
    }
  }
  return null
}
