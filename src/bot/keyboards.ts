/**
 * Inline keyboard builders. Callback-data convention: "<flow>:<action>[:arg]".
 */
import { InlineKeyboard } from 'grammy'
import { ROLES, FOCUS_AREAS } from '../types.js'

export const kb = {
  welcome: () =>
    new InlineKeyboard().text("I'm in — let's go ▶", 'ob:start'),

  roles: () => {
    const k = new InlineKeyboard()
    ROLES.forEach((r, i) => {
      k.text(`${r.emoji} ${r.label}`, `ob:role:${r.key}`)
      // Two-column layout reads well on a phone.
      if (i % 2 === 1) k.row()
    })
    return k
  },

  /** Multi-select focus areas; selected items get a checkmark. */
  focus: (selected: string[]) => {
    const k = new InlineKeyboard()
    FOCUS_AREAS.forEach((a) => {
      const on = selected.includes(a.slug)
      k.text(`${on ? '✅' : a.emoji} ${a.label}`, `ob:focus:${a.slug}`).row()
    })
    k.text('Done ▶', 'ob:focus:done')
    return k
  },

  begin: () =>
    new InlineKeyboard().text('Start my first round ▶', 'ob:begin'),

  /** The two-option vote, a skip, and a done. Slot A is the (reigning) champion.
   *  There's no fixed round length — curators vote as long as they like and tap
   *  ✓ Done to stop. */
  vote: () =>
    new InlineKeyboard()
      .text('🅰 This one', 'vote:a')
      .text('🅱 This one', 'vote:b')
      .row()
      .text('⏭ Skip', 'vote:skip')
      .text('✓ Done', 'vote:done'),

  another: () =>
    new InlineKeyboard().text('▶ Another round', 'vote:again'),
}
