/** Expected value of a 1-unit stake at the given odds, as a fraction (0.152 = +15.2%). */
export function expectedValue(modelProbability: number, decimalOdds: number): number {
  return modelProbability * decimalOdds - 1;
}
