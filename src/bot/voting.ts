/**
 * King-of-the-hill voting flow.
 *
 * A round is a series of pairwise match-ups. The winner of each match-up stays
 * on the throne (slot 🅰) and faces a fresh challenger (slot 🅱); the loser is
 * replaced. This is the NYT-style mechanic the product brief asked for: you get
 * the satisfaction of seeing whether your last pick survives the next challenge.
 *
 * Each comparison edits the SAME message in place, so a whole round feels like
 * one live card rather than a flood of messages. Every tap is recorded as a raw
 * pairwise vote and both cards' Elo is updated (see ranking/elo.ts).
 */
import type { Context } from 'grammy'
import * as repo from '../db/repo.js'
import { config } from '../config.js'
import { updateRatings } from '../ranking/elo.js'
import type { SessionState } from './session.js'
import { copy, escapeHtml } from './copy.js'
import { kb } from './keyboards.js'
import { FOCUS_AREAS, type Card } from '../types.js'

function areaEmoji(slug: string): string {
  return FOCUS_AREAS.find((a) => a.slug === slug)?.emoji ?? '•'
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/** One card rendered as an HTML block for the comparison message. */
function cardBlock(label: '🅰' | '🅱', card: Card, reigning: boolean): string {
  const crown = reigning ? ' 👑 <i>reigning</i>' : ''
  const meta = [areaEmoji(card.area_slug) + ' ' + card.area_label, card.type]
    .filter(Boolean)
    .join(' · ')
  const src = card.source ? ` — <i>${escapeHtml(card.source)}</i>` : ''
  const desc = card.description
    ? `\n${escapeHtml(truncate(card.description, 160))}`
    : ''
  return (
    `${label}${crown}  <code>${escapeHtml(meta)}</code>\n` +
    `<b><a href="${card.href}">${escapeHtml(card.title)}</a></b>${src}${desc}`
  )
}

function comparisonText(
  champion: Card,
  challenger: Card,
  index: number,
  size: number,
  reigning: boolean,
): string {
  return (
    `<b>Match-up ${index} of ${size}</b> — which is the stronger signal?\n\n` +
    `${cardBlock('🅰', champion, reigning)}\n\n` +
    `⚔️\n\n` +
    `${cardBlock('🅱', challenger, false)}`
  )
}

/** Resolve the round size for a curator (their cadence, else the default). */
function roundSizeFor(curatorId: number): number {
  const c = repo.getCurator(curatorId)
  return c?.cadence && c.cadence > 0 ? c.cadence : config.roundSize
}

/** Start a fresh round and render the first match-up. */
export async function startRound(ctx: Context, curatorId: number): Promise<void> {
  const cards = repo.getActiveCards()
  if (cards.length < 2) {
    await ctx.reply(copy.noCards, { parse_mode: 'HTML' })
    return
  }
  repo.touchCurator(curatorId)
  const size = roundSizeFor(curatorId)
  const roundId = repo.startRound(curatorId, size)

  // First match-up: two distinct fresh cards, neither reigning yet.
  const champion = repo.pickChallenger(curatorId, null)!
  const challenger = repo.pickChallenger(curatorId, champion.id)!

  const session: SessionState = {
    flow: 'voting',
    roundId,
    championId: champion.id,
    challengerId: challenger.id,
    comparison: 1,
    cast: 0,
    reigning: false,
  }
  repo.setSession(curatorId, session)

  await ctx.reply(copy.roundIntro(size), { parse_mode: 'HTML' })
  await ctx.reply(comparisonText(champion, challenger, 1, size, false), {
    parse_mode: 'HTML',
    reply_markup: kb.vote(),
    link_preview_options: { is_disabled: true },
  })
}

/** Handle every `vote:*` callback. Returns true if it consumed the callback. */
export async function handleVotingCallback(
  ctx: Context,
  data: string,
): Promise<boolean> {
  if (!data.startsWith('vote:')) return false
  const from = ctx.from
  if (!from) return true
  const action = data.slice('vote:'.length)

  if (action === 'again') {
    await ctx.editMessageReplyMarkup(undefined).catch(() => {})
    await ctx.answerCallbackQuery().catch(() => {})
    await startRound(ctx, from.id)
    return true
  }

  const session = repo.getSession<SessionState>(from.id)
  if (session.flow !== 'voting' || !session.roundId) {
    await ctx.answerCallbackQuery({ text: 'That round has ended.' }).catch(() => {})
    return true
  }

  const champion = repo.getCard(session.championId!)
  const challenger = repo.getCard(session.challengerId!)
  if (!champion || !challenger) {
    await ctx.answerCallbackQuery({ text: 'Cards unavailable.' }).catch(() => {})
    return true
  }

  const size = roundSizeFor(from.id)

  // --- Skip: swap in a new challenger, no vote recorded. ---
  if (action === 'skip') {
    const next = repo.pickChallenger(from.id, champion.id)
    if (next) {
      session.challengerId = next.id
      repo.setSession(from.id, session)
      await ctx.editMessageText(
        comparisonText(champion, next, session.comparison!, size, session.reigning!),
        {
          parse_mode: 'HTML',
          reply_markup: kb.vote(),
          link_preview_options: { is_disabled: true },
        },
      )
    }
    await ctx.answerCallbackQuery({ text: 'Skipped ⏭' }).catch(() => {})
    return true
  }

  // --- A real vote. Determine winner/loser. ---
  const winner = action === 'a' ? champion : challenger
  const loser = action === 'a' ? challenger : champion
  const next = updateRatings(winner.rating, loser.rating)
  repo.recordVote({
    curatorId: from.id,
    winnerId: winner.id,
    loserId: loser.id,
    roundId: session.roundId,
    newWinnerRating: next.winner,
    newLoserRating: next.loser,
  })
  session.cast = (session.cast ?? 0) + 1

  // Round finished?
  if (session.cast >= size) {
    repo.completeRound(session.roundId)
    repo.clearSession(from.id)
    await ctx.editMessageText(
      comparisonText(
        { ...winner, rating: next.winner },
        { ...loser, rating: next.loser },
        session.comparison!,
        size,
        session.reigning!,
      ) + `\n\n<i>✔ You picked ${action === 'a' ? '🅰' : '🅱'}</i>`,
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    )
    await ctx.reply(copy.roundComplete(session.cast), {
      parse_mode: 'HTML',
      reply_markup: kb.another(),
    })
    await ctx.answerCallbackQuery({ text: '🎉 Round complete!' }).catch(() => {})
    return true
  }

  // King of the hill: winner stays, new challenger enters.
  const newChallenger = repo.pickChallenger(from.id, winner.id)
  if (!newChallenger) {
    // Pool exhausted — end early but gracefully.
    repo.completeRound(session.roundId)
    repo.clearSession(from.id)
    await ctx.reply(copy.roundComplete(session.cast), { parse_mode: 'HTML' })
    await ctx.answerCallbackQuery().catch(() => {})
    return true
  }

  session.championId = winner.id
  session.challengerId = newChallenger.id
  session.comparison = (session.comparison ?? 1) + 1
  session.reigning = true
  repo.setSession(from.id, session)

  await ctx.editMessageText(
    comparisonText(
      { ...winner, rating: next.winner },
      newChallenger,
      session.comparison,
      size,
      true,
    ),
    {
      parse_mode: 'HTML',
      reply_markup: kb.vote(),
      link_preview_options: { is_disabled: true },
    },
  )
  await ctx.answerCallbackQuery({ text: '👑 Your pick stays on!' }).catch(() => {})
  return true
}
