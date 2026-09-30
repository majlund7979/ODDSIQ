// Historical performance computed from the prediction ledger only, so every
// number can be traced back to immutable, timestamped predictions.

import { metric, periodOf, type Metric } from "@/lib/metrics/metric";
import { brierScore, calibrationBins, expectedCalibrationError, logLoss, type CalibrationBin, type Scored } from "@/lib/metrics/scoring";
import { simulateFlatStakes, type StakingSummary } from "@/lib/metrics/staking";
import { expectedValue } from "@/lib/metrics/value";
import { ledgerRows, type LedgerRow } from "./store";

/** The published rule for which ledger predictions count as tracked opportunities. */
export const VALUE_RULE = { minEv: 0.03, minConfidence: 50 };
export const VALUE_RULE_TEXT = "Tracked opportunities are ledger predictions with EV ≥ 3% at the recorded price and confidence ≥ 50. The rule is applied mechanically to every prediction; none are hand-picked.";

export function isTrackedOpportunity(r: LedgerRow): boolean {
  return expectedValue(r.prediction.probability, r.prediction.odds) >= VALUE_RULE.minEv && r.prediction.confidence >= VALUE_RULE.minConfidence;
}

export interface PerformanceSummary {
  predictions: Metric;
  settled: Metric;
  brier: Metric;
  logLoss: Metric;
  calibrationError: Metric;
  calibration: CalibrationBin[];
  avgClv: Metric;
  positiveClvShare: Metric;
  opportunityClv: Metric;
  staking: Metric<StakingSummary>;
  byVersion: { versionId: string; n: number; brier: number; clv: number }[];
}

const SOURCE = "ODDSIQ prediction ledger (DEMO DATA)";

export function performanceSummary(now: number, filter?: (r: LedgerRow) => boolean): PerformanceSummary {
  return performanceSummaryOf(ledgerRows(now), SOURCE, filter);
}

/** The same summary over any ledger rows (demo or live). */
export function performanceSummaryOf(rows: LedgerRow[], source: string, filter?: (r: LedgerRow) => boolean): PerformanceSummary {
  const all = rows.filter((r) => (filter ? filter(r) : true));
  const settled = all.filter((r) => r.status === "settled");
  const withClv = all.filter((r) => r.clv !== undefined);
  const scored: Scored[] = settled.map((r) => ({ p: r.prediction.probability, y: r.result === "won" ? 1 : 0 }));
  const versions = [...new Set(settled.map((r) => r.prediction.modelVersionId))].sort();
  const settledPeriod = periodOf(settled.map((r) => r.prediction.createdAt));
  const versionLabel = versions.length === 1 ? versions[0] : versions.length ? `${versions.length} versions` : null;
  const ctx = (n: number, definition: string, basis: "historical" | "simulated" = "historical", period = settledPeriod) => ({
    n,
    ...period,
    modelVersion: versionLabel,
    source,
    definition,
    basis,
  });
  const opps = settled.filter(isTrackedOpportunity);
  const oppClv = withClv.filter(isTrackedOpportunity);
  const staking = simulateFlatStakes(opps.map((r) => ({ at: r.prediction.createdAt, odds: r.prediction.odds, won: r.result === "won" })));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const clvPeriod = periodOf(withClv.map((r) => r.prediction.createdAt));

  return {
    predictions: metric(all.length, ctx(all.length, "Every prediction recorded in the ledger, settled or not.", "historical", periodOf(all.map((r) => r.prediction.createdAt)))),
    settled: metric(settled.length, ctx(settled.length, "Predictions whose event has finished and been settled.")),
    brier: metric(brierScore(scored), ctx(scored.length, "Mean squared difference between predicted probability and outcome (1 = won, 0 = lost). Lower is better; 0.25 equals always guessing 50%.")),
    logLoss: metric(logLoss(scored), ctx(scored.length, "Mean negative log-likelihood of the outcomes. Lower is better; it punishes confident misses heavily.")),
    calibrationError: metric(expectedCalibrationError(scored), ctx(scored.length, "Sample-weighted average gap between predicted probability and observed frequency across 10 probability bins.")),
    calibration: calibrationBins(scored),
    avgClv: metric(mean(withClv.map((r) => r.clv!)), ctx(withClv.length, "Average closing line value across all predictions whose market has closed.", "historical", clvPeriod)),
    positiveClvShare: metric(withClv.length ? withClv.filter((r) => r.clv! > 0).length / withClv.length : NaN, ctx(withClv.length, "Share of closed predictions whose recorded price beat the de-vigged closing price.", "historical", clvPeriod)),
    opportunityClv: metric(mean(oppClv.map((r) => r.clv!)), ctx(oppClv.length, `Average CLV of tracked opportunities. ${VALUE_RULE_TEXT}`, "historical", periodOf(oppClv.map((r) => r.prediction.createdAt)))),
    staking: metric(staking, ctx(opps.length, `Simulated 1-unit flat stake on every tracked opportunity at the recorded price. No stakes were placed. ${VALUE_RULE_TEXT}`, "simulated")),
    byVersion: versions.map((v) => {
      const rows = settled.filter((r) => r.prediction.modelVersionId === v);
      return {
        versionId: v,
        n: rows.length,
        brier: brierScore(rows.map((r) => ({ p: r.prediction.probability, y: r.result === "won" ? 1 : 0 }))),
        clv: mean(rows.filter((r) => r.clv !== undefined).map((r) => r.clv!)),
      };
    }),
  };
}
