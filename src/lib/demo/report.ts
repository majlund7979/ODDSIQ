// Weekly Model Report (spec §46). Assembled from the ledger with fixed rules;
// findings are phrased as "potential issue detected" with their sample sizes,
// never as verdicts on the model.

import { fmtPct, fmtPp, fmtSignedPct } from "@/lib/format";
import { MIN_SAMPLE_FOR_WARNING } from "@/lib/metrics/metric";
import { mean, meanDiffZ } from "@/lib/metrics/stats";
import { breakdown, dimension, driftReport, isSettled, segmentStats, weekStart, type DriftReport, type SegmentStats } from "./analytics";
import type { LedgerRow, MarketRow } from "./store";

const DAY = 86_400_000;
export const REPORT_BASELINE_WEEKS = 12;
/** Market ranking uses the last four weeks so each segment has a usable sample. */
export const REPORT_MARKET_WEEKS = 4;
export const REPORT_MIN_MARKET_N = 100;

export type Severity = "info" | "watch" | "issue";

export interface Finding {
  severity: Severity;
  area: string;
  text: string;
}

export interface Miss {
  row: LedgerRow;
  errorPp: number;
}

export interface WeeklyReport {
  weekStart: number;
  weekEnd: number;
  week: SegmentStats;
  baseline: SegmentStats;
  pending: number;
  skillZ: number;
  clvZ: number;
  markets: { strongest: SegmentStats[]; weakest: SegmentStats[]; from: number };
  misses: Miss[];
  drift: DriftReport;
  dataQuality: { avgScore: number; completeness: number; staleOdds: number; markets: number };
  findings: Finding[];
}

const won = (r: LedgerRow) => (r.result === "won" ? 1 : 0);
const skillOf = (xs: LedgerRow[]) => xs.filter((r) => r.closingFairProbability !== undefined).map((r) => (r.prediction.probability - won(r)) ** 2 - (r.closingFairProbability! - won(r)) ** 2);
const clvOf = (xs: LedgerRow[]) => xs.filter((r) => r.clv !== undefined).map((r) => r.clv!);

/** Weeks (Monday 00:00 UTC) that have settled predictions, newest first. */
export function reportWeeks(rows: LedgerRow[], limit = 8): number[] {
  return [...new Set(rows.filter(isSettled).map((r) => weekStart(r.prediction.createdAt)))].sort((a, b) => b - a).slice(0, limit);
}

export function weeklyReport(rows: LedgerRow[], week: number, current: MarketRow[]): WeeklyReport {
  const weekEnd = week + 7 * DAY;
  const inWeek = rows.filter((r) => r.prediction.createdAt >= week && r.prediction.createdAt < weekEnd);
  const weekRows = inWeek.filter(isSettled);
  const baseRows = rows.filter((r) => isSettled(r) && r.prediction.createdAt >= week - REPORT_BASELINE_WEEKS * 7 * DAY && r.prediction.createdAt < week);
  const w = segmentStats(weekRows, "week", "This week");
  const b = segmentStats(baseRows, "baseline", `Previous ${REPORT_BASELINE_WEEKS} weeks`);
  const skillZ = meanDiffZ(skillOf(baseRows), skillOf(weekRows));
  const clvZ = meanDiffZ(clvOf(baseRows), clvOf(weekRows));

  const marketFrom = weekEnd - REPORT_MARKET_WEEKS * 7 * DAY;
  const marketRowsSettled = rows.filter((r) => isSettled(r) && r.prediction.createdAt >= marketFrom && r.prediction.createdAt < weekEnd);
  const bySegment = breakdown(marketRowsSettled, dimension("league"))
    .concat(breakdown(marketRowsSettled, dimension("market")))
    .filter((s) => s.n >= REPORT_MIN_MARKET_N);
  const skill = (s: SegmentStats) => s.marketBrier - s.brier;
  const ranked = [...bySegment].sort((a, c) => skill(c) - skill(a));

  const misses = weekRows
    .map((row) => ({ row, errorPp: (won(row) - row.prediction.probability) * 100 }))
    .sort((a, c) => Math.abs(c.errorPp) - Math.abs(a.errorPp))
    .filter((m, i, all) => all.findIndex((x) => x.row.event.id === m.row.event.id) === i)
    .slice(0, 3);

  const drift = driftReport(rows.filter((r) => r.prediction.createdAt < weekEnd), weekEnd);

  const pre = current.filter((r) => r.status === "scheduled");
  const dataQuality = {
    avgScore: mean(pre.map((r) => r.dataQuality.score)),
    completeness: mean(pre.map((r) => r.dataQuality.completeness)),
    staleOdds: pre.filter((r) => r.dataQuality.odds === "Stale" || r.dataQuality.odds === "Missing").length,
    markets: pre.length,
  };

  const findings: Finding[] = [];
  const small = w.n < MIN_SAMPLE_FOR_WARNING;
  if (small) findings.push({ severity: "info", area: "Sample", text: `Only ${w.n} predictions settled this week (below ${MIN_SAMPLE_FOR_WARNING}); weekly figures are noisy and should be read with the ${REPORT_BASELINE_WEEKS}-week baseline.` });
  if (skillZ >= 2) findings.push({ severity: skillZ >= 3 ? "issue" : "watch", area: "Accuracy", text: `Potential issue detected: accuracy against the closing market was worse than the baseline (z = ${skillZ.toFixed(1)}, n = ${w.n}). Investigate whether one league or market accounts for it.` });
  if (clvZ <= -2) findings.push({ severity: clvZ <= -3 ? "issue" : "watch", area: "CLV", text: `Potential issue detected: average CLV fell to ${fmtSignedPct(w.avgClv)} from ${fmtSignedPct(b.avgClv)} (z = ${clvZ.toFixed(1)}, n = ${w.clvN}). Recorded prices beat the close less often than usual.` });
  if (Math.abs(w.biasZ) >= 2 && !small) findings.push({ severity: "watch", area: "Calibration", text: `Observed win rate differed from the mean predicted probability by ${fmtPp(w.biasPp)} (z = ${w.biasZ.toFixed(1)}). Check the calibration curve for the affected probability range.` });
  for (const c of drift.checks.filter((x) => x.status !== "STABLE")) findings.push({ severity: c.status === "DRIFT" ? "issue" : "watch", area: "Drift", text: `Drift monitor: ${c.label.toLowerCase()} is on ${c.status.toLowerCase()} (${c.statisticLabel} = ${c.statistic.toFixed(2)}, recent n = ${c.nRecent}). Potential issue detected; see the Drift Monitor.` });
  const weakest = ranked.at(-1);
  if (weakest && skill(weakest) < 0) findings.push({ severity: "watch", area: "Markets", text: `${weakest.label} scored worse than the closing market over the last ${REPORT_MARKET_WEEKS} weeks (Brier ${weakest.brier.toFixed(3)} vs ${weakest.marketBrier.toFixed(3)}, n = ${weakest.n}). A candidate for investigation, not a conclusion.` });
  if (dataQuality.staleOdds > 0) findings.push({ severity: "info", area: "Data", text: `${dataQuality.staleOdds} of ${dataQuality.markets} open markets currently have stale or missing odds.` });
  if (!findings.some((f) => f.severity !== "info")) findings.push({ severity: "info", area: "Overall", text: "No potential issues crossed the report's thresholds this week." });

  return {
    weekStart: week,
    weekEnd,
    week: w,
    baseline: b,
    pending: inWeek.length - weekRows.length,
    skillZ,
    clvZ,
    markets: { strongest: ranked.slice(0, 3), weakest: ranked.slice(-3).reverse(), from: marketFrom },
    misses,
    drift,
    dataQuality,
    findings,
  };
}

/** Plain-language summary line for the report header. */
export function reportHeadline(r: WeeklyReport): string {
  const issues = r.findings.filter((f) => f.severity === "issue").length;
  const watch = r.findings.filter((f) => f.severity === "watch").length;
  const state = issues ? `${issues} potential issue${issues === 1 ? "" : "s"} detected` : watch ? `${watch} item${watch === 1 ? "" : "s"} to watch` : "no potential issues detected";
  return `${r.week.n} predictions settled, hit rate ${fmtPct(r.week.hitRate)} against ${fmtPct(r.week.meanPredicted)} predicted, average CLV ${fmtSignedPct(r.week.avgClv)}: ${state}.`;
}
