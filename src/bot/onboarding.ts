/**
 * The onboarding wizard: a friendly 3-step flow that (a) makes joining
 * effortless and (b) captures the segment tags (role + focus areas) that power
 * the "who values what" analysis. Every step edits the same message in place
 * and shows a progress bar, so it feels like one smooth card, not a wall of
 * messages.
 */
import type { Context } from 'grammy'
import * as repo from '../db/repo.js'
import type { SessionState } from './session.js'
import { copy } from './copy.js'
import { kb } from './keyboards.js'
import { FOCUS_AREAS } from '../types.js'
import { startRound } from './voting.js'
import { webVoteUrl } from './links.js'

/** Entry point — /start. Registers the curator and shows the welcome card. */
export async function beginOnboarding(ctx: Context): Promise<void> {
  const from = ctx.from
  if (!from) return
  repo.upsertCurator({
    id: from.id,
    username: from.username,
    first_name: from.first_name,
  })
  repo.setSession(from.id, { flow: 'onboarding' } satisfies SessionState)
  await ctx.reply(copy.welcome(from.first_name), {
    parse_mode: 'HTML',
    reply_markup: kb.welcome(),
  })
}

/** Handle every `ob:*` callback. Returns true if it consumed the callback. */
export async function handleOnboardingCallback(
  ctx: Context,
  data: string,
): Promise<boolean> {
  if (!data.startsWith('ob:')) return false
  const from = ctx.from
  if (!from) return true
  const [, action, arg] = data.split(':')
  const session = repo.getSession<SessionState>(from.id)

  switch (action) {
    case 'start': {
      // Move from welcome → step 1 (role).
      await ctx.editMessageText(copy.onboardingIntro, { parse_mode: 'HTML' })
      await ctx.reply(copy.askRole(), {
        parse_mode: 'HTML',
        reply_markup: kb.roles(),
      })
      break
    }

    case 'role': {
      repo.setCuratorRole(from.id, arg!)
      // Step 1 done → step 2 (focus areas, multi-select).
      session.focus = []
      repo.setSession(from.id, session)
      await ctx.editMessageText(copy.askFocus([]), {
        parse_mode: 'HTML',
        reply_markup: kb.focus([]),
      })
      break
    }

    case 'focus': {
      if (arg === 'done') {
        repo.setFocusAreas(from.id, session.focus ?? [])
        // Step 2 done → finished. There's no pair-count step any more (curators
        // just vote as long as they like and tap Done).
        repo.completeOnboarding(from.id)
        repo.clearSession(from.id)
        const curator = repo.getCurator(from.id)
        const focusCount = repo.getFocusAreas(from.id).length
        await ctx.editMessageText(copy.done(curator?.role ?? null, focusCount), {
          parse_mode: 'HTML',
          reply_markup: kb.begin(webVoteUrl(from.id)),
        })
      } else {
        // Toggle a focus area in place.
        const set = new Set(session.focus ?? [])
        if (set.has(arg!)) set.delete(arg!)
        else if (FOCUS_AREAS.some((a) => a.slug === arg)) set.add(arg!)
        session.focus = [...set]
        repo.setSession(from.id, session)
        await ctx.editMessageText(copy.askFocus(session.focus), {
          parse_mode: 'HTML',
          reply_markup: kb.focus(session.focus),
        })
      }
      break
    }

    case 'begin': {
      await ctx.editMessageReplyMarkup(undefined).catch(() => {})
      await startRound(ctx, from.id)
      break
    }
  }

  await ctx.answerCallbackQuery().catch(() => {})
  return true
}
