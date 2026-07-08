/**
 * Elo rating for pairwise preferences.
 *
 * Every "A beat B" vote nudges A's rating up and B's down by an amount that
 * depends on how *surprising* the result was (beating a much stronger card
 * moves the needle more). Aggregated over many curators and many comparisons,
 * the ratings converge to a stable ranking of the whole card pool — this is the
 * same maths behind chess ratings, and a close cousin of the Bradley-Terry
 * model used in preference learning.
 *
 * We keep a live Elo cache on each card for instant leaderboards, but the raw
 * `votes` table is the source of truth and the ranking can always be recomputed
 * from scratch (see recomputeElo below) if we change K or seed a new pool.
 */

/** K-factor: how much a single comparison can move a rating. */
export const K_FACTOR = 24

/** Expected score for A against B given their current ratings (0..1). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

/**
 * Given the current ratings of the winner and loser, return their new ratings.
 */
export function updateRatings(
  winnerRating: number,
  loserRating: number,
  k: number = K_FACTOR,
): { winner: number; loser: number } {
  const expectedWinner = expectedScore(winnerRating, loserRating)
  const expectedLoser = 1 - expectedWinner
  return {
    winner: winnerRating + k * (1 - expectedWinner),
    loser: loserRating + k * (0 - expectedLoser),
  }
}

/**
 * Recompute every card's Elo from the full vote history (chronological).
 * Useful after changing K, importing votes, or resetting the pool. Returns a
 * map of cardId -> rating.
 */
export function recomputeElo(
  votes: { winner_card_id: number; loser_card_id: number }[],
  cardIds: number[],
  k: number = K_FACTOR,
): Map<number, number> {
  const ratings = new Map<number, number>()
  for (const id of cardIds) ratings.set(id, 1500)
  for (const v of votes) {
    const w = ratings.get(v.winner_card_id) ?? 1500
    const l = ratings.get(v.loser_card_id) ?? 1500
    const next = updateRatings(w, l, k)
    ratings.set(v.winner_card_id, next.winner)
    ratings.set(v.loser_card_id, next.loser)
  }
  return ratings
}
