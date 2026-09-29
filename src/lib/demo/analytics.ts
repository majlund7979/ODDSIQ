// Model Lab and Performance analytics over the prediction ledger.
//
// Everything here is a pure function of ledger rows, so every figure can be
// traced back to immutable, timestamped predictions and their outcomes.

import { fmtMonth } from "@/lib/format";
import { MIN_SAMPLE_FOR_WARNING, periodOf } from "@/lib/metrics/metric";
import { brierScore, expectedCalibrationError, logLoss, type Scored } from "@/lib/metrics/scoring";
import { simulateFlatStakes, type StakingSummary } from "@/lib/metrics/staking";
import { bonferroniZ, mean, meanDiffZ, psi, PSI_LEVELS, twoSidedP } from "@/lib/metrics/stats";
import { clvPriceRatio } from "@/lib/metrics/clv";
import { expectedValue } from "@/lib/metrics/value";
import { ENSEMBLE_RELEASES } from "./models";
import { isTrackedOpportunity } from "./performance";
import type { LedgerRow } from "./store";

const DAY = 86_400_000;

export const isSettled = (r: LedgerRow) => r.status === "settled" && (r.result === "won" || r.result === "lost");
const won = (r: LedgerRow): 0 | 1 => (r.result === "won" ? 1 : 0);

// ---------------------------------------------------------------------------
// Segments

export interface SegmentStats {
  key: string;
  label: string;
  /** All ledger predictions in the segment, settled or not. */
  predictions: number;
  /** Settled predictions: the sample for accuracy statistics. */
  n: number;
  periodFrom: number | null;
  periodTo: number | null;
  versions: string[];
  meanPredicted: number;
  hitRate: number;
  /** Observed minus predicted win rate, percentage points. Positive = model too low. */
  biasPp: number;
  /** Bias divided by its standard error under the model's own probabilities. */
  biasZ: number;
  brier: number;
  /** Brier of the de-vigged closing market on the same predictions. */
  marketBrier: number;
  logLoss: number;
  /** Expected calibration error over 10 probability bins. */
  calibrationError: number;
  clvN: number;
  avgClv: number;
  positiveClvShare: number;
  /** Simulated flat stakes on tracked opportunities in the segment. */
  opportunities: StakingSummary;
  lowSample: boolean;
}

export function segmentStats(rows: LedgerRow[], key = "all", label = "All predictions"): SegmentStats {
  const settled = rows.filter(isSettled);
  const scored: Scored[] = settled.map((r) => ({ p: r.prediction.probability, y: won(r) }));
  const market: Scored[] = settled.filter((r) => r.closingFairProbability !== undefined).map((r) => ({ p: r.closingFairProbability!, y: won(r) }));
  const sumP = scored.reduce((s, x) => s + x.p, 0);
  const sumY = scored.reduce((s, x) => s + x.y, 0);
  const variance = scored.reduce((s, x) => s + x.p * (1 - x.p), 0);
  const withClv = rows.filter((r) => r.clv !== undefined);
  const opps = settled.filter(isTrackedOpportunity);
  return {
    key,
    label,
    predictions: rows.length,
    n: settled.length,
    ...periodOf(settled.map((r) => r.prediction.createdAt)),
    versions: [...new Set(settled.map((r) => r.prediction.modelVersionId))].sort(),
    meanPredicted: scored.length ? sumP / scored.length : NaN,
    hitRate: scored.length ? sumY / scored.length : NaN,
    biasPp: scored.length ? ((sumY - sumP) / scored.length) * 100 : NaN,
    biasZ: variance > 0 ? (sumY - sumP) / Math.sqrt(variance) : NaN,
    brier: brierScore(scored),
    marketBrier: brierScore(market),
    logLoss: logLoss(scored),
    calibrationError: expectedCalibrationError(scored),
    clvN: withClv.length,
    avgClv: mean(withClv.map((r) => r.clv!)),
    positiveClvShare: withClv.length ? withClv.filter((r) => r.clv! > 0).length / withClv.length : NaN,
    opportunities: simulateFlatStakes(opps.map((r) => ({ at: r.prediction.createdAt, odds: r.prediction.odds, won: r.result === "won" }))),
    lowSample: settled.length < MIN_SAMPLE_FOR_WARNING,
  };
}

const SIDE_LABEL: Record<string, string> = { home: "Home", draw: "Draw", away: "Away", over: "Over 2.5", under: "Under 2.5", yes: "BTTS yes", no: "BTTS no" };

export const ODDS_BANDS = [1, 1.5, 2, 3, 4.5, 7, Infinity];
export const CONFIDENCE_BANDS = [0, 60, 70, 75, 80, 101];

function band(edges: number[], x: number, fmt: (a: number, b: number) => string): { key: string; label: string } {
  const i = Math.max(0, edges.findIndex((e, j) => x >= e && x < edges[j + 1]));
  return { key: String(i).padStart(2, "0"), label: fmt(edges[i], edges[i + 1]) };
}

export const oddsBand = (odds: number) => band(ODDS_BANDS, odds, (a, b) => (b === Infinity ? `${a.toFixed(2)}+` : `${a.toFixed(2)}–${b.toFixed(2)}`));
export const confidenceBand = (c: number) => band(CONFIDENCE_BANDS, c, (a, b) => (a === 0 ? `< ${b}` : b > 100 ? `${a}+` : `${a}–${b - 1}`));

export type DimensionId = "market" | "league" | "sport" | "side" | "odds" | "confidence" | "month" | "version";

export interface Dimension {
  id: DimensionId;
  label: string;
  /** Natural order (odds, confidence, month) rather than by sample size. */
  ordered: boolean;
  of: (r: LedgerRow) => { key: string; label: string };
}

export const DIMENSIONS: Dimension[] = [
  { id: "market", label: "Market", ordered: false, of: (r) => ({ key: r.marketName, label: r.marketName }) },
  { id: "league", label: "League", ordered: false, of: (r) => ({ key: r.event.leagueId, label: r.event.leagueName }) },
  { id: "sport", label: "Sport", ordered: false, of: (r) => ({ key: r.event.sportId, label: r.event.sportName }) },
  { id: "side", label: "Selection", ordered: false, of: (r) => ({ key: r.side, label: SIDE_LABEL[r.side] ?? r.side }) },
  { id: "odds", label: "Odds range", ordered: true, of: (r) => oddsBand(r.prediction.odds) },
  { id: "confidence", label: "Confidence", ordered: true, of: (r) => confidenceBand(r.prediction.confidence) },
  {
    id: "month",
    label: "Month",
    ordered: true,
    of: (r) => ({ key: new Date(r.prediction.createdAt).toISOString().slice(0, 7), label: fmtMonth(r.prediction.createdAt) }),
  },
  { id: "version", label: "Model version", ordered: true, of: (r) => ({ key: r.prediction.modelVersionId, label: r.prediction.modelVersionId }) },
];

export function dimension(id: string | undefined): Dimension {
  return DIMENSIONS.find((d) => d.id === id) ?? DIMENSIONS[0];
}

export function breakdown(rows: LedgerRow[], dim: Dimension): SegmentStats[] {
  const groups = new Map<string, { label: string; rows: LedgerRow[] }>();
  for (const r of rows) {
    const g = dim.of(r);
    const bucket = groups.get(g.key);
    if (bucket) bucket.rows.push(r);
    else groups.set(g.key, { label: g.label, rows: [r] });
  }
  const out = [...groups.entries()].map(([key, g]) => segmentStats(g.rows, key, g.label));
  return dim.ordered ? out.sort((a, b) => (a.key < b.key ? -1 : 1)) : out.sort((a, b) => b.n - a.n);
}

// ---------------------------------------------------------------------------
// Error patterns

export interface ErrorPattern {
  segment: SegmentStats;
  filters: { label: string; value: string }[];
  pValue: number;
  direction: "underestimates" | "overestimates";
  byVersion: { versionId: string; n: number; biasPp: number }[];
  /** Simulated flat stake on every prediction in the segment at the recorded price. */
  allStakes: StakingSummary;
  possibleExplanations: string[];
}

export interface ErrorScan {
  patterns: ErrorPattern[];
  segmentsTested: number;
  segmentsBelowMinimum: number;
  criticalZ: number;
  minSample: number;
  settled: number;
  periodFrom: number | null;
  periodTo: number | null;
}

type PatternDim = { label: string; of: (r: LedgerRow) => { key: string; label: string } };

const SELECTION: PatternDim = {
  label: "Selection",
  of: (r) => ({ key: `${r.event.sportId}:${r.marketType}:${r.side}`, label: `${r.event.sportName} ${r.marketName}: ${SIDE_LABEL[r.side] ?? r.side}` }),
};
const LEAGUE: PatternDim = { label: "League", of: DIMENSIONS[1].of };
const ODDS: PatternDim = { label: "Odds", of: DIMENSIONS[4].of };

/** Segment combinations the scan tests. Fixed in advance so the number of tests is known. */
const PATTERN_DIMENSIONS: PatternDim[][] = [
  [SELECTION],
  [SELECTION, ODDS],
  [LEAGUE, SELECTION],
  [LEAGUE, SELECTION, ODDS],
  [LEAGUE, { label: "Market", of: DIMENSIONS[0].of }],
  [{ label: "Confidence", of: DIMENSIONS[5].of }],
];

function explanations(filters: { label: string; value: string }[], direction: ErrorPattern["direction"]): string[] {
  const low = direction === "underestimates";
  const out = [
    `Calibration is fitted across all leagues and markets, so a segment-specific offset may be missing.`,
    `A feature that matters in this segment may be ${low ? "under" : "over"}-weighted, or missing from the feature set.`,
    `The training window may pre-date a change in this competition (schedule, tempo, squad turnover or rule changes).`,
  ];
  if (filters.some((f) => f.label === "Odds")) out.push(`Price-dependent effects: the market opening price is a model feature, so errors can concentrate in one odds range.`);
  out.push(`Chance: the scan tests many segments. The significance bar is corrected for that, but a false pattern is still possible.`);
  return out;
}

/**
 * Scans pre-defined segment combinations for systematic miscalibration. A
 * segment is tested only with at least `minSample` settled predictions, and
 * reported only if its bias clears a Bonferroni-corrected threshold.
 */
export function scanErrorPatterns(rows: LedgerRow[], minSample = MIN_SAMPLE_FOR_WARNING, alpha = 0.05): ErrorScan {
  const settled = rows.filter(isSettled);
  const candidates: { filters: { label: string; value: string }[]; key: string; rows: LedgerRow[] }[] = [];
  let belowMinimum = 0;
  for (const dims of PATTERN_DIMENSIONS) {
    const groups = new Map<string, { filters: { label: string; value: string }[]; rows: LedgerRow[] }>();
    for (const r of settled) {
      const parts = dims.map((d) => ({ label: d.label, g: d.of(r) }));
      const key = parts.map((p) => `${p.label}=${p.g.key}`).join("&");
      const bucket = groups.get(key);
      if (bucket) bucket.rows.push(r);
      else groups.set(key, { filters: parts.map((p) => ({ label: p.label, value: p.g.label })), rows: [r] });
    }
    for (const [key, g] of groups) {
      if (g.rows.length >= minSample) candidates.push({ key, ...g });
      else belowMinimum++;
    }
  }
  const criticalZ = bonferroniZ(candidates.length, alpha);
  const patterns: ErrorPattern[] = [];
  for (const c of candidates) {
    const segment = segmentStats(c.rows, c.key, c.filters.map((f) => f.value).join(" · "));
    if (!(Math.abs(segment.biasZ) >= criticalZ)) continue;
    const direction = segment.biasPp > 0 ? "underestimates" : "overestimates";
    patterns.push({
      segment,
      filters: c.filters,
      pValue: twoSidedP(segment.biasZ),
      direction,
      byVersion: segment.versions.map((v) => {
        const s = segmentStats(c.rows.filter((r) => r.prediction.modelVersionId === v));
        return { versionId: v, n: s.n, biasPp: s.biasPp };
      }),
      allStakes: simulateFlatStakes(c.rows.map((r) => ({ at: r.prediction.createdAt, odds: r.prediction.odds, won: r.result === "won" }))),
      possibleExplanations: explanations(c.filters, direction),
    });
  }
  patterns.sort((a, b) => Math.abs(b.segment.biasZ) - Math.abs(a.segment.biasZ));
  return {
    patterns,
    segmentsTested: candidates.length,
    segmentsBelowMinimum: belowMinimum,
    criticalZ,
    minSample,
    settled: settled.length,
    ...periodOf(settled.map((r) => r.prediction.createdAt)),
  };
}

// ---------------------------------------------------------------------------
// Time series and drift

export interface WeekPoint {
  weekStart: number;
  n: number;
  brier: number;
  marketBrier: number;
  biasPp: number;
  avgClv: number;
  meanPredicted: number;
}

/** Monday 00:00 UTC of the week containing t. */
export function weekStart(t: number): number {
  const day = Math.floor(t / DAY);
  // 1970-01-01 was a Thursday; Monday-based weekday index.
  const weekday = (day + 3) % 7;
  return (day - weekday) * DAY;
}

export function weeklySeries(rows: LedgerRow[]): WeekPoint[] {
  const groups = new Map<number, LedgerRow[]>();
  for (const r of rows) {
    if (!isSettled(r)) continue;
    const w = weekStart(r.prediction.createdAt);
    const g = groups.get(w);
    if (g) g.push(r);
    else groups.set(w, [r]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, g]) => {
      const s = segmentStats(g);
      return { weekStart: w, n: s.n, brier: s.brier, marketBrier: s.marketBrier, biasPp: s.biasPp, avgClv: s.avgClv, meanPredicted: s.meanPredicted };
    });
}

export type DriftStatus = "STABLE" | "WATCH" | "DRIFT";

export interface DriftCheck {
  id: string;
  label: string;
  definition: string;
  baseline: number;
  recent: number;
  /** Test statistic: z for mean comparisons, PSI for the distribution check. */
  statistic: number;
  statisticLabel: string;
  status: DriftStatus;
  nBaseline: number;
  nRecent: number;
  format: "brier" | "pp" | "pct" | "prob";
}

export interface DriftReport {
  recentFrom: number;
  baselineFrom: number;
  to: number;
  checks: DriftCheck[];
  status: DriftStatus;
}

export const DRIFT_WINDOWS = { recentDays: 28, baselineDays: 84 };

/** Compares the most recent settled window with the one before it. */
export function driftReport(rows: LedgerRow[], now: number): DriftReport {
  const settled = rows.filter(isSettled);
  const to = settled.length ? Math.max(...settled.map((r) => r.prediction.createdAt)) : now;
  const recentFrom = to - DRIFT_WINDOWS.recentDays * DAY;
  const baselineFrom = recentFrom - DRIFT_WINDOWS.baselineDays * DAY;
  const recent = settled.filter((r) => r.prediction.createdAt > recentFrom);
  const baseline = settled.filter((r) => r.prediction.createdAt > baselineFrom && r.prediction.createdAt <= recentFrom);
  const zStatus = (z: number, worseIsPositive: boolean): DriftStatus => {
    const worse = worseIsPositive ? z : -z;
    return worse >= 3 ? "DRIFT" : worse >= 2 ? "WATCH" : "STABLE";
  };

  const skill = (xs: LedgerRow[]) => xs.filter((r) => r.closingFairProbability !== undefined).map((r) => (r.prediction.probability - won(r)) ** 2 - (r.closingFairProbability! - won(r)) ** 2);
  // Across a whole market the probabilities sum to 1 and exactly one selection
  // wins, so the overall bias is zero by construction. Calibration drift is
  // therefore measured on favourites (p ≥ 50%), where it can actually move.
  const residual = (xs: LedgerRow[]) => xs.filter((r) => r.prediction.probability >= 0.5).map((r) => won(r) - r.prediction.probability);
  const absResidualZ = (a: LedgerRow[], b: LedgerRow[]) => {
    // Direction-agnostic: flags when the absolute gap widens.
    const z = meanDiffZ(residual(a), residual(b));
    return Math.abs(mean(residual(b))) >= Math.abs(mean(residual(a))) ? Math.abs(z) : -Math.abs(z);
  };
  const clvOf = (xs: LedgerRow[]) => xs.filter((r) => r.clv !== undefined).map((r) => r.clv!);
  const probs = (xs: LedgerRow[]) => xs.map((r) => r.prediction.probability);

  const zSkill = meanDiffZ(skill(baseline), skill(recent));
  const zCal = absResidualZ(baseline, recent);
  const zClv = meanDiffZ(clvOf(baseline), clvOf(recent));
  const psiValue = psi(probs(baseline), probs(recent));

  const checks: DriftCheck[] = [
    {
      id: "skill",
      label: "Accuracy vs closing market",
      definition: "Mean per-prediction Brier score minus the closing market's Brier score on the same outcome. Lower is better; a rise means the model lost ground against the market.",
      baseline: mean(skill(baseline)),
      recent: mean(skill(recent)),
      statistic: zSkill,
      statisticLabel: "z",
      status: zStatus(zSkill, true),
      nBaseline: baseline.length,
      nRecent: recent.length,
      format: "brier",
    },
    {
      id: "calibration",
      label: "Calibration bias, favourites",
      definition: "Observed win rate minus mean predicted probability for predictions of 50% or more, in percentage points. Flags when the absolute gap widens.",
      baseline: mean(residual(baseline)) * 100,
      recent: mean(residual(recent)) * 100,
      statistic: zCal,
      statisticLabel: "z",
      status: zStatus(zCal, true),
      nBaseline: residual(baseline).length,
      nRecent: residual(recent).length,
      format: "pp",
    },
    {
      id: "clv",
      label: "Closing line value",
      definition: "Average CLV of predictions. A fall means recorded prices beat the close less often.",
      baseline: mean(clvOf(baseline)),
      recent: mean(clvOf(recent)),
      statistic: zClv,
      statisticLabel: "z",
      status: zStatus(zClv, false),
      nBaseline: clvOf(baseline).length,
      nRecent: clvOf(recent).length,
      format: "pct",
    },
    {
      id: "inputs",
      label: "Prediction distribution",
      definition: "Population Stability Index of predicted probabilities, recent vs baseline. Below 0.10 is stable, 0.10–0.25 a moderate shift, above 0.25 a large shift. A shift can come from a new model version or a different fixture mix, not only from a fault.",
      baseline: mean(probs(baseline)),
      recent: mean(probs(recent)),
      statistic: psiValue,
      statisticLabel: "PSI",
      status: psiValue >= PSI_LEVELS.large ? "DRIFT" : psiValue >= PSI_LEVELS.moderate ? "WATCH" : "STABLE",
      nBaseline: baseline.length,
      nRecent: recent.length,
      format: "prob",
    },
  ];
  const status: DriftStatus = checks.some((c) => c.status === "DRIFT") ? "DRIFT" : checks.some((c) => c.status === "WATCH") ? "WATCH" : "STABLE";
  return { recentFrom, baselineFrom, to, checks, status };
}

/** Ensemble release dates, for regime markers on time-series charts. */
export const VERSION_MARKERS = ENSEMBLE_RELEASES.map((r) => ({ at: r.releasedAt, label: `v${r.version}` }));

// ---------------------------------------------------------------------------
// Backtest of selection rules

export interface RuleResult {
  minEv: number;
  minConfidence: number;
  published: boolean;
  staking: StakingSummary;
  avgClv: number;
  clvN: number;
}

export const RULE_GRID = { ev: [0, 0.02, 0.03, 0.05, 0.08], confidence: [0, 50, 65] };

export function backtestRules(rows: LedgerRow[], published: { minEv: number; minConfidence: number }): RuleResult[] {
  const settled = rows.filter(isSettled);
  const out: RuleResult[] = [];
  for (const minConfidence of RULE_GRID.confidence) {
    for (const minEv of RULE_GRID.ev) {
      const pick = settled.filter((r) => expectedValue(r.prediction.probability, r.prediction.odds) >= minEv && r.prediction.confidence >= minConfidence);
      const clvs = pick.filter((r) => r.clv !== undefined).map((r) => r.clv!);
      out.push({
        minEv,
        minConfidence,
        published: minEv === published.minEv && minConfidence === published.minConfidence,
        staking: simulateFlatStakes(pick.map((r) => ({ at: r.prediction.createdAt, odds: r.prediction.odds, won: r.result === "won" }))),
        avgClv: mean(clvs),
        clvN: clvs.length,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLV analysis

export interface HistogramBin {
  from: number;
  to: number;
  n: number;
}

export function histogram(xs: number[], from: number, to: number, bins: number): HistogramBin[] {
  const w = (to - from) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ from: from + i * w, to: from + (i + 1) * w, n: 0 }));
  // Values outside the range are clamped into the edge bins.
  for (const x of xs) out[Math.min(bins - 1, Math.max(0, Math.floor((x - from) / w)))].n++;
  return out;
}

export const CLV_BUCKETS = [-Infinity, -0.05, 0, 0.05, Infinity];

export interface ClvBucket {
  label: string;
  n: number;
  avgClv: number;
  staking: StakingSummary;
}

/** Simulated flat-stake returns grouped by CLV bucket: does beating the close line up with results? */
export function clvBuckets(rows: LedgerRow[]): ClvBucket[] {
  const settled = rows.filter((r) => isSettled(r) && r.clv !== undefined);
  const label = (a: number, b: number) => (a === -Infinity ? `below ${fmtSigned(b)}` : b === Infinity ? `above ${fmtSigned(a)}` : `${fmtSigned(a)} to ${fmtSigned(b)}`);
  return CLV_BUCKETS.slice(0, -1).map((a, i) => {
    const b = CLV_BUCKETS[i + 1];
    const pick = settled.filter((r) => r.clv! >= a && r.clv! < b);
    return {
      label: label(a, b),
      n: pick.length,
      avgClv: mean(pick.map((r) => r.clv!)),
      staking: simulateFlatStakes(pick.map((r) => ({ at: r.prediction.createdAt, odds: r.prediction.odds, won: r.result === "won" }))),
    };
  });
}

function fmtSigned(x: number) {
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(0)}%`;
}

export function avgPriceRatioClv(rows: LedgerRow[]): { value: number; n: number } {
  const xs = rows.filter((r) => r.closingOdds !== undefined).map((r) => clvPriceRatio(r.prediction.odds, r.closingOdds!));
  return { value: mean(xs), n: xs.length };
}

// ---------------------------------------------------------------------------
// CLV history by segment, for the scanner

export const clvSegmentKey = (leagueId: string, marketType: string) => `${leagueId}|${marketType}`;

/** Historical average CLV of ledgered predictions per league and market type. */
export function clvHistoryBySegment(rows: LedgerRow[]): Map<string, { avg: number; n: number }> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.clv === undefined) continue;
    const k = clvSegmentKey(r.event.leagueId, r.marketType);
    const a = acc.get(k) ?? acc.set(k, { sum: 0, n: 0 }).get(k)!;
    a.sum += r.clv;
    a.n++;
  }
  return new Map([...acc.entries()].map(([k, a]) => [k, { avg: a.sum / a.n, n: a.n }]));
}
