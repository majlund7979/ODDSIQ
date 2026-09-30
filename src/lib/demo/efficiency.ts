// Market efficiency analytics over settled markets. The efficiency score is
// an ODDSIQ construct with a published formula, not an objective measure.

import { BOOKMAKERS, leagueById, SPORTS } from "./catalog";
import { mean } from "@/lib/metrics/stats";
import { oddsBand } from "./analytics";
import { HORIZON_HOURS, ledgerRows, settledSelections, type LedgerRow, type SettledSelection } from "./store";

export const EFFICIENCY_WEIGHTS = { accuracy: 0.6, stability: 0.4 };
/** Closing skill at which the accuracy component reaches 100. */
export const SKILL_FULL = 0.15;
/** Late movement (pp, last 6h) at which the stability component reaches 0. */
export const LATE_MOVE_ZERO_PP = 3;

export const EFFICIENCY_DEFINITION =
  `Efficiency score (0–100), an ODDSIQ definition: ${EFFICIENCY_WEIGHTS.accuracy * 100}% closing accuracy plus ${EFFICIENCY_WEIGHTS.stability * 100}% late stability. ` +
  `Closing accuracy = closing skill ÷ ${SKILL_FULL}, capped at 1, where closing skill = 1 − (Brier score of the margin-free closing price ÷ Brier score of an uninformed forecast that gives each selection type, such as home win or over 2.5, its historical win rate in the same group). ` +
  `Late stability = 1 − (average absolute change in market probability over the last 6 hours before kickoff ÷ ${LATE_MOVE_ZERO_PP} pp), floored at 0. ` +
  `A high score means closing prices forecast results well and little information arrived late. It is one reasonable way to summarise efficiency, not an objective truth.`;

export interface EfficiencyRow {
  key: string;
  label: string;
  n: number;
  closingBrier: number;
  closingSkill: number;
  /** Mean |p_close − p_open|, percentage points. */
  openToCloseMovePp: number;
  /** Mean |p_close − p_6h|, percentage points. */
  lateMovePp: number;
  score: number;
  /** From the prediction ledger: mean |model − market| at prediction, pp. */
  modelMarketDiffPp: number;
  ledgerN: number;
  avgClv: number;
  clvN: number;
}

function brier(rows: { p: number; y: number }[]) {
  return mean(rows.map((r) => (r.p - r.y) ** 2));
}

export function efficiencyScore(closingSkill: number, lateMovePp: number): number {
  const accuracy = Math.min(1, Math.max(0, closingSkill) / SKILL_FULL);
  const stability = 1 - Math.min(1, lateMovePp / LATE_MOVE_ZERO_PP);
  return Math.round(100 * (EFFICIENCY_WEIGHTS.accuracy * accuracy + EFFICIENCY_WEIGHTS.stability * stability));
}

const H6 = HORIZON_HOURS.indexOf(6);
const CLOSE = HORIZON_HOURS.indexOf(0);

/** Brier of the uninformed reference: each selection type's own historical win rate within the group. */
function referenceBrier(sel: SettledSelection[]): number {
  const rate = new Map<string, { n: number; y: number }>();
  const key = (s: SettledSelection) => `${s.marketType}:${s.selectionId.slice(s.selectionId.lastIndexOf("-") + 1)}`;
  for (const s of sel) {
    const r = rate.get(key(s)) ?? rate.set(key(s), { n: 0, y: 0 }).get(key(s))!;
    r.n++;
    r.y += s.won;
  }
  return brier(sel.map((s) => ({ p: rate.get(key(s))!.y / rate.get(key(s))!.n, y: s.won })));
}

function row(key: string, label: string, sel: SettledSelection[], ledger: LedgerRow[]): EfficiencyRow {
  const closingBrier = brier(sel.map((s) => ({ p: s.horizons[CLOSE], y: s.won })));
  const closingSkill = 1 - closingBrier / referenceBrier(sel);
  const lateMovePp = mean(sel.map((s) => Math.abs(s.horizons[CLOSE] - s.horizons[H6]) * 100));
  const withClv = ledger.filter((r) => r.clv !== undefined);
  return {
    key,
    label,
    n: sel.length,
    closingBrier,
    closingSkill,
    openToCloseMovePp: mean(sel.map((s) => Math.abs(s.horizons[CLOSE] - s.horizons[0]) * 100)),
    lateMovePp,
    score: efficiencyScore(closingSkill, lateMovePp),
    modelMarketDiffPp: mean(ledger.map((r) => Math.abs(r.prediction.probability - r.marketProbabilityAtPrediction) * 100)),
    ledgerN: ledger.length,
    avgClv: mean(withClv.map((r) => r.clv!)),
    clvN: withClv.length,
  };
}

export type EfficiencyDim = "sport" | "league" | "market" | "odds";

export const EFFICIENCY_DIMS: { id: EfficiencyDim; label: string; sel: (s: SettledSelection) => { key: string; label: string }; led: (r: LedgerRow) => string; ordered: boolean }[] = [
  { id: "sport", label: "Sport", sel: (s) => ({ key: s.sportId, label: s.sportName ?? SPORTS.find((x) => x.id === s.sportId)?.name ?? s.sportId }), led: (r) => r.event.sportId, ordered: false },
  { id: "league", label: "League", sel: (s) => ({ key: s.leagueId, label: s.leagueName ?? leagueById.get(s.leagueId)?.name ?? s.leagueId }), led: (r) => r.event.leagueId, ordered: false },
  { id: "market", label: "Market", sel: (s) => ({ key: s.marketName, label: s.marketName }), led: (r) => r.marketName, ordered: false },
  { id: "odds", label: "Odds range", sel: (s) => oddsBand(s.closingOdds), led: (r) => oddsBand(r.closingOdds ?? r.prediction.odds).key, ordered: true },
];

export function efficiencyBy(now: number, dimId: string | undefined) {
  return efficiencyOf(settledSelections(now), ledgerRows(now), dimId);
}

export function efficiencyOf(sel: SettledSelection[], allLedger: LedgerRow[], dimId: string | undefined): { dim: (typeof EFFICIENCY_DIMS)[number]; rows: EfficiencyRow[]; total: EfficiencyRow } {
  const dim = EFFICIENCY_DIMS.find((d) => d.id === dimId) ?? EFFICIENCY_DIMS[0];
  const ledger = allLedger.filter((r) => r.status === "settled");
  const groups = new Map<string, { label: string; sel: SettledSelection[]; ledger: LedgerRow[] }>();
  for (const s of sel) {
    const g = dim.sel(s);
    const b = groups.get(g.key) ?? groups.set(g.key, { label: g.label, sel: [], ledger: [] }).get(g.key)!;
    b.sel.push(s);
  }
  for (const r of ledger) groups.get(dim.led(r))?.ledger.push(r);
  const rows = [...groups.entries()].map(([k, g]) => row(k, g.label, g.sel, g.ledger));
  rows.sort(dim.ordered ? (a, b) => (a.key < b.key ? -1 : 1) : (a, b) => b.n - a.n);
  return { dim, rows, total: row("total", "All markets", sel, ledger) };
}

export interface HorizonRow {
  hours: number;
  n: number;
  brier: number;
  skill: number;
}

/** How well the margin-free market forecasts results at each point before kickoff. */
export function accuracyByHorizon(now: number): HorizonRow[] {
  return accuracyByHorizonOf(settledSelections(now));
}

export function accuracyByHorizonOf(sel: SettledSelection[]): HorizonRow[] {
  if (!sel.length) return [];
  const ref = referenceBrier(sel);
  return HORIZON_HOURS.map((hours, i) => {
    const b = brier(sel.map((s) => ({ p: s.horizons[i], y: s.won })));
    return { hours, n: sel.length, brier: b, skill: 1 - b / ref };
  });
}

export interface BookmakerRow {
  bookmakerId: string;
  name: string;
  n: number;
  closingBrier: number;
  closingSkill: number;
  avgMargin: number;
  /** Mean |book probability − consensus probability| at close, pp. */
  deviationPp: number;
}

export function bookmakerEfficiency(now: number): BookmakerRow[] {
  return bookmakerEfficiencyOf(settledSelections(now), BOOKMAKERS);
}

export function bookmakerEfficiencyOf(sel: SettledSelection[], bookmakers: { id: string; name: string }[]): BookmakerRow[] {
  return bookmakers.map((b) => {
    const rows = sel.flatMap((s) => {
      const q = s.books.find((x) => x.bookmakerId === b.id);
      return q ? [{ s, q }] : [];
    });
    const closingBrier = brier(rows.map(({ s, q }) => ({ p: q.probability, y: s.won })));
    return {
      bookmakerId: b.id,
      name: b.name,
      n: rows.length,
      closingBrier,
      closingSkill: 1 - closingBrier / referenceBrier(rows.map(({ s }) => s)),
      avgMargin: mean(rows.map(({ q }) => q.margin)),
      deviationPp: mean(rows.map(({ s, q }) => Math.abs(q.probability - s.horizons[CLOSE]) * 100)),
    };
  })
    .filter((b) => b.n > 0)
    .sort((a, b) => a.closingBrier - b.closingBrier);
}
