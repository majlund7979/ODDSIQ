// Closing Line Value.
//
// Methodology (shown in the UI):
//   CLV = taken_odds × closing_fair_probability − 1
// where closing_fair_probability is the de-vigged consensus probability of the
// selection at kickoff. It is the expected return of the price we recorded,
// valued at the market's final, margin-free estimate. Positive CLV means the
// recorded price was better than where the market closed. It says nothing
// certain about any single result.

export const CLV_METHODOLOGY =
  "CLV = odds at prediction × de-vigged closing probability − 1. It measures whether the recorded price beat the market's final, margin-free price. Positive CLV over a large sample is associated with long-run edge, but it does not guarantee that any individual prediction wins.";

export function clv(takenOdds: number, closingFairProbability: number): number {
  return takenOdds * closingFairProbability - 1;
}

/** Simpler price-ratio variant, shown alongside for transparency. */
export function clvPriceRatio(takenOdds: number, closingOdds: number): number {
  return takenOdds / closingOdds - 1;
}
