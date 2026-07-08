/** Shape of the transient per-curator session state (stored as JSON). */
export type SessionState = {
  /** Which multi-step flow the curator is currently in. */
  flow?: 'onboarding' | 'voting'

  // --- onboarding ---
  /** Focus areas toggled so far in the multi-select step. */
  focus?: string[]

  // --- voting (king-of-the-hill, slot-based) ---
  // The winner STAYS in the slot it was picked in; the fresh challenger drops
  // into the other slot. So we track the card in each fixed slot plus which
  // slot currently reigns.
  roundId?: number
  /** Card id in the top slot (🅰). */
  slotAId?: number
  /** Card id in the bottom slot (🅱). */
  slotBId?: number
  /** Which slot holds the reigning champion (null on the first comparison). */
  championSlot?: 'a' | 'b' | null
  /** Consecutive wins by the current champion (exposure cap; see config.reignCap). */
  reign?: number
  /** 1-based index of the current comparison within the round. */
  comparison?: number
  /** Votes cast so far this round. */
  cast?: number
}
