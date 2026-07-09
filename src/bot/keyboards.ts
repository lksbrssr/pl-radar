/**
 * Inline keyboard builders. Callback-data convention: "<flow>:<action>[:arg]".
 */
import { InlineKeyboard } from 'grammy'
import { ROLES, FOCUS_AREAS } from '../types.js'

export const kb = {
  welcome: () =>
    new InlineKeyboard().text("I'm in — let's go", 'ob:start'),

  roles: () => {
    const k = new InlineKeyboard()
    ROLES.forEach((r, i) => {
      k.text(r.label, `ob:role:${r.key}`)
      // Two-column layout reads well on a phone.
      if (i % 2 === 1) k.row()
    })
    return k
  },

  /** Multi-select focus areas; selected items get a check mark. */
  focus: (selected: string[]) => {
    const k = new InlineKeyboard()
    FOCUS_AREAS.forEach((a) => {
      const on = selected.includes(a.slug)
      k.text(`${on ? '✓ ' : ''}${a.label}`, `ob:focus:${a.slug}`).row()
    })
    k.text('Done', 'ob:focus:done')
    return k
  },

  /** After onboarding: web voter (bigger cards) up top, in-chat as a fallback. */
  begin: (webUrl: string) =>
    new InlineKeyboard()
      .url('Open the web voter', webUrl)
      .row()
      .text('Or vote here in chat', 'ob:begin'),

  /** The two-option vote, a skip, and a done. Slot A is the (reigning) champion.
   *  There's no fixed round length — curators vote as long as they like and tap
   *  Done to stop. */
  vote: () =>
    new InlineKeyboard()
      .text('Pick A', 'vote:a')
      .text('Pick B', 'vote:b')
      .row()
      .text('Skip', 'vote:skip')
      .text('Done', 'vote:done'),

  another: (webUrl: string) =>
    new InlineKeyboard()
      .url('Vote on the web', webUrl)
      .row()
      .text('Another round in chat', 'vote:again'),

  /** Weekly nudge CTA: web voter (bigger cards) or a quick in-chat round. */
  nudge: (webUrl: string) =>
    new InlineKeyboard()
      .url('Vote on the web', webUrl)
      .row()
      .text('Vote in chat', 'vote:again'),
}
