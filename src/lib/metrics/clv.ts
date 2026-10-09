// Closing Line Value.
//
// Methodology:
//   CLV = taken_odds × closing_fair_probability − 1
// where closing_fair_probability is the de-vigged consensus probability of the
// selection at kickoff. It is the expected return of the price we recorded,
// valued at the market's final, margin-free estimate. Positive CLV means the
// recorded price was better than where the market closed. It says nothing
// certain about any single result.

export function clv(takenOdds: number, closingFairProbability: number): number {
  return takenOdds * closingFairProbability - 1;
}

/** Simpler price-ratio variant, shown alongside for transparency. */
export function clvPriceRatio(takenOdds: number, closingOdds: number): number {
  return takenOdds / closingOdds - 1;
}
