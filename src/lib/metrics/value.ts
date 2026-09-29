import { impliedProbability } from "./probability";

/** Model probability minus market probability, in percentage points. */
export function edgePp(modelProbability: number, marketProbability: number): number {
  return (modelProbability - marketProbability) * 100;
}

/** Expected value of a 1-unit stake at the given odds, as a fraction (0.152 = +15.2%). */
export function expectedValue(modelProbability: number, decimalOdds: number): number {
  return modelProbability * decimalOdds - 1;
}

/** Price change from `from` to `to` as a fraction (-0.0818 = -8.18%). */
export function priceChange(from: number, to: number): number {
  return to / from - 1;
}

/** Change in implied probability, percentage points. */
export function impliedMovePp(fromOdds: number, toOdds: number): number {
  return (impliedProbability(toOdds) - impliedProbability(fromOdds)) * 100;
}

export type DisagreementLevel = "LOW" | "MODERATE" | "HIGH";

export function disagreementLevel(absEdgePp: number): DisagreementLevel {
  const a = Math.abs(absEdgePp);
  if (a >= 5) return "HIGH";
  if (a >= 2.5) return "MODERATE";
  return "LOW";
}
