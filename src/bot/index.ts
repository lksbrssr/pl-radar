/**
 * Bot wiring: commands + callback routing. Business logic lives in
 * onboarding.ts / voting.ts; this file just dispatches.
 */
import { Bot, type Context } from 'grammy'
import { config, isAdmin } from '../config.js'
import * as repo from '../db/repo.js'
import { copy } from './copy.js'
import { kb } from './keyboards.js'
import { beginOnboarding, handleOnboardingCallback } from './onboarding.js'
import { startRound, handleVotingCallback } from './voting.js'
import { globalLeaderboard, attributeWinRates } from '../ranking/segments.js'

export const bot = new Bot(config.botToken)

// --- Commands ---------------------------------------------------------------

bot.command('start', async (ctx) => {
  await beginOnboarding(ctx)
})

bot.command('help', async (ctx) => {
  await ctx.reply(copy.help, { parse_mode: 'HTML' })
})

bot.command('vote', async (ctx) => {
  if (!ctx.from) return
  const curator = repo.getCurator(ctx.from.id)
  if (!curator?.onboarded_at) {
    await beginOnboarding(ctx)
    return
  }
  await startRound(ctx, ctx.from.id)
})

bot.command('settings', async (ctx) => {
  // Re-runs the wizard; existing answers are simply overwritten.
  await ctx.reply('Let’s update your preferences.')
  await beginOnboarding(ctx)
})

bot.command('pause', async (ctx) => {
  if (!ctx.from) return
  repo.setCuratorStatus(ctx.from.id, 'paused')
  await ctx.reply(copy.paused, { parse_mode: 'HTML' })
})

bot.command('resume', async (ctx) => {
  if (!ctx.from) return
  repo.setCuratorStatus(ctx.from.id, 'active')
  await ctx.reply(copy.resumed, { parse_mode: 'HTML' })
})

// --- Admin commands ---------------------------------------------------------

bot.command('stats', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) return
  await ctx.reply(
    `<b>Radar curation stats</b>\n` +
      `Curators onboarded: <b>${repo.countCurators()}</b>\n` +
      `Active cards: <b>${repo.getActiveCards().length}</b>\n` +
      `Total votes: <b>${repo.totalVotes()}</b>`,
    { parse_mode: 'HTML' },
  )
})

bot.command('leaderboard', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) return
  const top = globalLeaderboard().slice(0, 10)
  const lines = top.map(
    (c, i) => `${i + 1}. <b>${Math.round(c.rating)}</b> — ${c.title}`,
  )
  const areas = attributeWinRates('area_slug')
    .map((a) => `  ${a.value}: ${(a.winRate * 100).toFixed(0)}%`)
    .join('\n')
  await ctx.reply(
    `<b>Top cards (Elo)</b>\n${lines.join('\n') || '(no votes yet)'}\n\n` +
      `<b>Win-rate by focus area</b>\n${areas || '(n/a)'}`,
    { parse_mode: 'HTML' },
  )
})

// --- Callback routing -------------------------------------------------------

bot.on('callback_query:data', async (ctx: Context) => {
  const data = ctx.callbackQuery?.data
  if (!data) return
  if (await handleOnboardingCallback(ctx, data)) return
  if (await handleVotingCallback(ctx, data)) return
  await ctx.answerCallbackQuery().catch(() => {})
})

// --- Fallback for free-text: nudge toward the buttons -----------------------

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return
  const curator = ctx.from ? repo.getCurator(ctx.from.id) : undefined
  if (!curator?.onboarded_at) {
    await beginOnboarding(ctx)
  } else {
    await ctx.reply('Tap /vote for a round, or /help to see what I can do.')
  }
})

// Register the slash-command menu shown in Telegram's UI.
export async function registerCommands(): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'vote', description: 'Start a round of match-ups' },
    { command: 'settings', description: 'Change role & focus areas' },
    { command: 'pause', description: 'Pause weekly nudges' },
    { command: 'resume', description: 'Resume daily nudges' },
    { command: 'help', description: 'What can this bot do?' },
  ])
}
