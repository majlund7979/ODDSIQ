// Calibration: do our 70 % picks win 70 % of the time? Settled picks are
// grouped by the probability we showed, and each group's hit rate is set
// against what we said and against the bookmakers' implied chance (1 / best
// odds, which still carries some margin, so it is an estimate).

import type { RecordedPick } from "./picks-extra";

export const CALIBRATION_VERSION = "kalibrering-v1";
/** Groups smaller than this are flagged as too few to judge. */
export const CALIBRATION_MIN = 20;
export const BUCKETS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

export interface CalibrationRow {
  from: number;
  to: number;
  n: number;
  /** Average probability we showed. */
  stated: number;
  /** Share that won. */
  hitRate: number;
  /** Average 1 / best odds over the picks with odds, and how many had odds. */
  market: number;
  withOdds: number;
}

export function calibration(picks: RecordedPick[]): CalibrationRow[] {
  const settled = picks.filter((p) => p.result);
  return BUCKETS.map((from, i) => {
    const to = BUCKETS[i + 1] ?? 1.0001;
    const g = settled.filter((p) => p.probability >= from && p.probability < to);
    const odds = g.filter((p) => p.odds && p.odds > 1);
    return {
      from,
      to: Math.min(to, 1),
      n: g.length,
      stated: g.length ? g.reduce((s, p) => s + p.probability, 0) / g.length : NaN,
      hitRate: g.length ? g.filter((p) => p.result === "won").length / g.length : NaN,
      market: odds.length ? odds.reduce((s, p) => s + 1 / p.odds!, 0) / odds.length : NaN,
      withOdds: odds.length,
    };
  }).filter((r) => r.n > 0);
}

/** Brier score (mean squared error of the probabilities; lower is better) for us and for 1 / best odds, over picks that have odds. */
export function brier(picks: RecordedPick[]): { n: number; ours: number; market: number } | null {
  const g = picks.filter((p) => p.result && p.odds && p.odds > 1);
  if (!g.length) return null;
  const y = (p: RecordedPick) => (p.result === "won" ? 1 : 0);
  return {
    n: g.length,
    ours: g.reduce((s, p) => s + (p.probability - y(p)) ** 2, 0) / g.length,
    market: g.reduce((s, p) => s + (1 / p.odds! - y(p)) ** 2, 0) / g.length,
  };
}
