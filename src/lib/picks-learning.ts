// Self-learning: each bet type's shown probability is nudged by how its past
// picks actually did. Picks are recorded with the raw (unadjusted) probability,
// so the adjustment is always measured against the model itself and cannot
// chase its own tail.
//
// The adjustment is a shift on the log-odds scale: the gap between the hit
// rate and the average predicted probability, shrunk towards zero while the
// sample is small, and capped so one bad weekend cannot swing the page.

import { metric, periodOf, type Metric } from "@/lib/metrics/metric";
import type { RecordedPick } from "./picks-extra";
import { strengthOf, type Pick } from "./picks";

/** Settled picks a bet type needs before it adjusts at all. */
export const LEARN_MIN = 20;
/** Shrinkage: with n settled picks, n / (n + LEARN_PRIOR) of the measured gap is used. */
export const LEARN_PRIOR = 50;
/** Largest shift on the log-odds scale (about ±12 percentage points at 50 %). */
export const LEARN_MAX_SHIFT = 0.5;
/** How far back the learning looks. */
export const LEARN_DAYS = 90;
export const LEARNING_VERSION = "picks-calibration-v1";

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clampP = (p: number) => Math.min(0.99, Math.max(0.01, p));

export interface CategoryLearning {
  category: string;
  /** Hit rate of the settled picks, with its sample size, period and source. */
  hitRate: Metric;
  /** Average probability the model gave those picks. */
  expected: number;
  /** Shift applied on the log-odds scale; 0 while the sample is too small. */
  shift: number;
  /** What the shift does to a pick the model rates at its average probability, in percentage points. */
  adjustmentPp: number;
  learning: boolean;
}

export type Learning = Map<string, CategoryLearning>;

/** Learns one adjustment per bet type from settled picks. Pure. */
export function learn(records: RecordedPick[], source: string): Learning {
  const out: Learning = new Map();
  const byCat = new Map<string, RecordedPick[]>();
  for (const r of records) if (r.result) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  for (const [category, rs] of byCat) {
    const n = rs.length;
    const won = rs.filter((r) => r.result === "won").length;
    const expected = rs.reduce((s, r) => s + r.probability, 0) / n;
    // Smoothed hit rate, so 0 of 20 or 20 of 20 do not give an infinite gap.
    const observed = (won + 1) / (n + 2);
    const learning = n >= LEARN_MIN;
    const raw = logit(clampP(observed)) - logit(clampP(expected));
    const shift = learning ? Math.max(-LEARN_MAX_SHIFT, Math.min(LEARN_MAX_SHIFT, (raw * n) / (n + LEARN_PRIOR))) : 0;
    out.set(category, {
      category,
      hitRate: metric(won / n, {
        n,
        ...periodOf(rs.map((r) => r.kickoff)),
        modelVersion: LEARNING_VERSION,
        source,
        definition: "Share of settled picks of this bet type that won",
        basis: "historical",
      }),
      expected,
      shift,
      adjustmentPp: (sigmoid(logit(clampP(expected)) + shift) - expected) * 100,
      learning,
    });
  }
  return out;
}

/** A probability after the bet type's learned adjustment. */
export function adjusted(p: number, l: CategoryLearning | undefined): number {
  if (!l || l.shift === 0) return p;
  return clampP(sigmoid(logit(clampP(p)) + l.shift));
}

/** Applies the learned adjustment to bet-type picks, keeping fair odds and strength in step. Order is unchanged: the shift is monotone. */
export function applyLearning<T extends { probability: number; fairOdds: number; strength: Pick["strength"] }>(picks: T[], l: CategoryLearning | undefined): T[] {
  if (!l || l.shift === 0) return picks;
  return picks.map((p) => {
    const probability = adjusted(p.probability, l);
    return { ...p, probability, fairOdds: 1 / probability, strength: strengthOf(probability) };
  });
}

/** The same for goal-market picks, which also carry the value tag and the list of what moved the percentage. */
export function applyLearningToPicks(picks: Pick[], l: CategoryLearning | undefined): Pick[] {
  if (!l || l.shift === 0) return picks;
  return applyLearning(picks, l).map((p, i) => {
    const before = picks[i].probability;
    return {
      ...p,
      value: !p.marketOnly && p.row.bestOdds * p.probability > 1,
      factors: [...p.factors, { label: "Læring fra resultater", pp: (p.probability - before) * 100, detail: learningDetail(l) }],
    };
  });
}

/** One plain sentence on what the learning saw. */
export function learningDetail(l: CategoryLearning): string {
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  return `${l.hitRate.n} afgjorte bets af denne type ramte ${pct(l.hitRate.value)}, mod forventet ${pct(l.expected)}, så procenten ${l.shift > 0 ? "hæves" : "sænkes"} lidt`;
}
