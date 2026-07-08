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

  cadence: () =>
    new InlineKeyboard()
      .text('2 / day', 'ob:cadence:2')
      .text('3 / day', 'ob:cadence:3')
      .text('5 / day', 'ob:cadence:5')
      .row()
      .text('🎲 Surprise me', 'ob:cadence:0'),

  begin: () =>
    new InlineKeyboard().text('Start my first round ▶', 'ob:begin'),

  /** The two-option vote plus a skip. Slot A is the (reigning) champion. */
  vote: () =>
    new InlineKeyboard()
      .text('🅰 This one', 'vote:a')
      .text('🅱 This one', 'vote:b')
      .row()
      .text('⏭ Skip', 'vote:skip'),

  another: () =>
    new InlineKeyboard().text('▶ Another round', 'vote:again'),
}
