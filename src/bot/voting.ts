/**
 * King-of-the-hill voting flow (slot-based, image-first).
 *
 * A round is a series of pairwise match-ups rendered as ONE composite image
 * (🅰 top, 🅱 bottom) that looks like the public Radar. When you tap the
 * stronger card, that card **stays in the slot it was in** and a fresh
 * challenger drops into the other slot — so you keep watching your pick defend
 * its position (the NYT-style hook). The image is swapped in place via
 * editMessageMedia, so a whole round is one live message.
 *
 * Every tap is recorded as a raw pairwise vote and both cards' Elo is updated.
 */
import { InputFile, type Context } from 'grammy'
import * as repo from '../db/repo.js'
import { config } from '../config.js'
import { updateRatings } from '../ranking/elo.js'
import type { SessionState } from './session.js'
import { copy, escapeHtml } from './copy.js'
import { kb } from './keyboards.js'
import { renderMatchup } from './cardImage.js'
import type { Card } from '../types.js'

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/** Short HTML caption with tappable links so curators can open the sources. */
function caption(
  top: Card,
  bottom: Card,
  index: number,
  size: number,
): string {
  return (
    `<b>Match-up ${index} of ${size}</b> — tap the stronger signal. ` +
    `👑 your pick stays put.\n\n` +
    `🅰 <a href="${top.href}">${escapeHtml(truncate(top.title, 90))}</a>\n` +
    `🅱 <a href="${bottom.href}">${escapeHtml(truncate(bottom.title, 90))}</a>`
  )
}

function roundSizeFor(curatorId: number): number {
  const c = repo.getCurator(curatorId)
  return c?.cadence && c.cadence > 0 ? c.cadence : config.roundSize
}

/** Render + send the current match-up as a fresh photo message. */
async function sendMatchup(
  ctx: Context,
  s: SessionState,
  index: number,
  size: number,
): Promise<void> {
  const top = repo.getCard(s.slotAId!)!
  const bottom = repo.getCard(s.slotBId!)!
  const png = await renderMatchup(top, bottom, s.championSlot ?? null)
  await ctx.replyWithPhoto(new InputFile(png), {
    caption: caption(top, bottom, index, size),
    parse_mode: 'HTML',
    reply_markup: kb.vote(),
  })
}

/** Render + swap the current match-up into the existing photo message. */
async function editMatchup(
  ctx: Context,
  s: SessionState,
  index: number,
  size: number,
  withButtons = true,
  suffix = '',
): Promise<void> {
  const top = repo.getCard(s.slotAId!)!
  const bottom = repo.getCard(s.slotBId!)!
  const png = await renderMatchup(top, bottom, s.championSlot ?? null)
  await ctx.editMessageMedia(
    {
      type: 'photo',
      media: new InputFile(png),
      caption: caption(top, bottom, index, size) + suffix,
      parse_mode: 'HTML',
    },
    withButtons ? { reply_markup: kb.vote() } : {},
  )
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

  const a = repo.pickChallenger(curatorId, null)!
  const b = repo.pickChallenger(curatorId, a.id)!

  const s: SessionState = {
    flow: 'voting',
    roundId,
    slotAId: a.id,
    slotBId: b.id,
    championSlot: null, // first match-up: nobody reigns yet
    comparison: 1,
    cast: 0,
  }
  repo.setSession(curatorId, s)

  await ctx.reply(copy.roundIntro(size), { parse_mode: 'HTML' })
  await sendMatchup(ctx, s, 1, size)
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

  const s = repo.getSession<SessionState>(from.id)
  if (s.flow !== 'voting' || !s.roundId) {
    await ctx.answerCallbackQuery({ text: 'That round has ended.' }).catch(() => {})
    return true
  }

  const size = roundSizeFor(from.id)
  const index = s.comparison ?? 1

  // --- Skip: swap a new card into the non-reigning slot, no vote. ---
  if (action === 'skip') {
    // Replace slot B by default; if A reigns keep A, if B reigns replace A.
    const replaceSlot: 'a' | 'b' = s.championSlot === 'b' ? 'a' : 'b'
    const keepId = replaceSlot === 'a' ? s.slotBId! : s.slotAId!
    const next = repo.pickChallenger(from.id, keepId)
    if (next) {
      if (replaceSlot === 'a') s.slotAId = next.id
      else s.slotBId = next.id
      repo.setSession(from.id, s)
      await editMatchup(ctx, s, index, size)
    }
    await ctx.answerCallbackQuery({ text: 'Skipped ⏭' }).catch(() => {})
    return true
  }

  if (action !== 'a' && action !== 'b') {
    await ctx.answerCallbackQuery().catch(() => {})
    return true
  }

  // --- A real vote. The picked slot's card wins and STAYS in its slot. ---
  const winnerSlot: 'a' | 'b' = action
  const loserSlot: 'a' | 'b' = action === 'a' ? 'b' : 'a'
  const winner = repo.getCard(winnerSlot === 'a' ? s.slotAId! : s.slotBId!)
  const loser = repo.getCard(loserSlot === 'a' ? s.slotAId! : s.slotBId!)
  if (!winner || !loser) {
    await ctx.answerCallbackQuery({ text: 'Cards unavailable.' }).catch(() => {})
    return true
  }

  const rated = updateRatings(winner.rating, loser.rating)
  repo.recordVote({
    curatorId: from.id,
    winnerId: winner.id,
    loserId: loser.id,
    roundId: s.roundId,
    newWinnerRating: rated.winner,
    newLoserRating: rated.loser,
  })
  s.cast = (s.cast ?? 0) + 1
  s.championSlot = winnerSlot // the winner now reigns, in its current slot

  // Round finished?
  if (s.cast >= size) {
    repo.completeRound(s.roundId)
    await editMatchup(
      ctx,
      s,
      index,
      size,
      false,
      `\n\n<i>✔ You picked ${winnerSlot === 'a' ? '🅰' : '🅱'}</i>`,
    )
    repo.clearSession(from.id)
    await ctx.reply(copy.roundComplete(s.cast), {
      parse_mode: 'HTML',
      reply_markup: kb.another(),
    })
    await ctx.answerCallbackQuery({ text: '🎉 Round complete!' }).catch(() => {})
    return true
  }

  // King of the hill: winner stays in its slot; challenger enters the loser's.
  const challenger = repo.pickChallenger(from.id, winner.id)
  if (!challenger) {
    repo.completeRound(s.roundId)
    repo.clearSession(from.id)
    await ctx.reply(copy.roundComplete(s.cast), { parse_mode: 'HTML' })
    await ctx.answerCallbackQuery().catch(() => {})
    return true
  }
  if (loserSlot === 'a') s.slotAId = challenger.id
  else s.slotBId = challenger.id
  s.comparison = index + 1
  repo.setSession(from.id, s)

  await editMatchup(ctx, s, s.comparison, size)
  await ctx.answerCallbackQuery({ text: '👑 Your pick stays on!' }).catch(() => {})
  return true
}
