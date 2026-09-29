// Odds <-> probability conversions and bookmaker-margin removal.

export function impliedProbability(decimalOdds: number): number {
  if (!(decimalOdds > 1)) throw new RangeError(`Invalid decimal odds: ${decimalOdds}`);
  return 1 / decimalOdds;
}

export function fairOdds(probability: number): number {
  if (!(probability > 0 && probability < 1)) throw new RangeError(`Invalid probability: ${probability}`);
  return 1 / probability;
}

/** Sum of implied probabilities minus one, e.g. 0.052 for a 5.2% margin. */
export function overround(oddsForAllOutcomes: number[]): number {
  return oddsForAllOutcomes.reduce((s, o) => s + impliedProbability(o), 0) - 1;
}

/**
 * Removes the bookmaker margin proportionally (the "multiplicative" method).
 * Returns fair probabilities that sum to 1, in the same order as the input.
 */
export function devig(oddsForAllOutcomes: number[]): number[] {
  const implied = oddsForAllOutcomes.map(impliedProbability);
  const total = implied.reduce((s, p) => s + p, 0);
  return implied.map((p) => p / total);
}
