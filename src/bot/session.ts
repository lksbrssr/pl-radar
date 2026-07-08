/** Shape of the transient per-curator session state (stored as JSON). */
export type SessionState = {
  /** Which multi-step flow the curator is currently in. */
  flow?: 'onboarding' | 'voting'

  // --- onboarding ---
  /** Focus areas toggled so far in the multi-select step. */
  focus?: string[]

  // --- voting (king-of-the-hill) ---
  roundId?: number
  /** Card id currently holding the throne (slot 🅰). */
  championId?: number
  /** Card id challenging this comparison (slot 🅱). */
  challengerId?: number
  /** 1-based index of the current comparison within the round. */
  comparison?: number
  /** Votes cast so far this round. */
  cast?: number
  /** True once the champion has survived at least one comparison. */
  reigning?: boolean
}
