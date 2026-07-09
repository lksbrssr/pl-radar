/**
 * All user-facing copy in one place, so tone can be tuned without hunting
 * through logic. Telegram HTML parse mode is used throughout.
 */
import { ROLES } from '../types.js'

/**
 * A friendly progress bar, e.g. progress(2, 3) -> "▰▰▱  Step 2 of 3".
 * Filled blocks for done+current, hollow for remaining.
 */
export function progress(step: number, total: number): string {
  const filled = '▰'.repeat(step)
  const empty = '▱'.repeat(Math.max(0, total - step))
  return `${filled}${empty}  Step ${step} of ${total}`
}

export const copy = {
  welcome: (name?: string) =>
    `<b>Hey${name ? ' ' + escapeHtml(name) : ''} — welcome to the PL R&D Radar.</b>\n\n` +
    `The Radar is a monthly, skim-in-a-minute digest of the strongest signals ` +
    `across PL R&D's focus areas. <b>You help decide what makes the cut.</b>\n\n` +
    `Here's the deal:\n` +
    `• Once a week I'll send you a few quick match-ups\n` +
    `• You just tap the one that's the stronger signal — that's it\n` +
    `• A couple of minutes a week, and your taste shapes what the world sees\n\n` +
    `Ready? Let's get you set up — takes under a minute.`,

  onboardingIntro:
    `Great to have you.\n\nFirst, two quick questions so I can learn whose ` +
    `taste is shaping the Radar (this powers the "who values what" insights). ` +
    `Then you're in.`,

  askRole: () =>
    `${progress(1, 2)}\n\n<b>What best describes your role?</b>\n` +
    `<i>This tags your votes by segment — no wrong answer.</i>`,

  askFocus: (selected: string[]) =>
    `${progress(2, 2)}\n\n<b>Which areas do you care about most?</b>\n` +
    `<i>Pick any that apply, then tap Done.</i>` +
    (selected.length
      ? `\n\nSelected: ${selected.length}`
      : `\n\n<i>(none selected yet)</i>`),

  done: (roleKey: string | null, focusCount: number) =>
    `<b>You're all set.</b>\n\n` +
    `${roleKey ? 'Role: ' + escapeHtml(roleLabel(roleKey)) + '\n' : ''}` +
    `Focus areas: ${focusCount || 'all of them'}\n\n` +
    `That's it — no app to install, no login. Vote right in the browser (bigger ` +
    `card images) or here in chat — your picks count either way. I'll ping you ` +
    `once a week when fresh match-ups are ready.`,

  roundIntro: () =>
    `<b>Round time.</b> Tap the card that's the <b>stronger signal</b> for the ` +
    `Radar. The winner stays on and faces a fresh challenger — so you'll see if ` +
    `your pick holds up.\n\nVote as many as you like, then tap <b>Done</b> when ` +
    `you're finished.`,

  noCards:
    `The candidate pool is empty right now — nothing to vote on yet. ` +
    `Check back soon! (Admins: run <code>npm run seed</code> to load sample cards.)`,

  roundComplete: (n: number) =>
    `<b>${n === 0 ? 'Round ended' : 'Round complete'} — thank you.</b>\n\n` +
    `You cast ${n} vote${n === 1 ? '' : 's'}. Every tap sharpens the signal ` +
    `we surface to the world.\n\nSend /vote anytime for another round.`,

  paused:
    `No problem — you're paused. You won't get nudges until you send ` +
    `/resume. Thanks for everything so far.`,

  resumed: `Welcome back. You'll get match-ups again. Send /vote to dive in now.`,

  help:
    `<b>PL R&D Radar — curator bot</b>\n\n` +
    `/vote — start a round of match-ups\n` +
    `/settings — change your role & focus areas\n` +
    `/pause — stop weekly nudges\n` +
    `/resume — start them again\n` +
    `/help — this message`,
}

function roleLabel(key: string): string {
  return ROLES.find((r) => r.key === key)?.label ?? key
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
