// Walk-forward backtest on real results. Every forecast uses only matches
// played before its match day: Dixon-Coles is refitted weekly, Elo updates
// after each match, and the Elo outcome mapping is refitted at the start of
// each test season. Scored against the results and against a base-rate
// benchmark (last three seasons' home/draw/away frequencies).

import { brierScore, calibrationBins, logLoss, type CalibrationBin } from "@/lib/metrics/scoring";
import { fitOrderedLogit, newElo, updateElo, eloDiff, type OrderedLogit } from "./elo";
import { forecastMatch } from "./ensemble";
import type { HistMatch } from "./openfootball";
import { fitPoisson, type PoissonFit } from "./poisson";

const DAY = 86_400_000;

export interface ForecastRow {
  date: number;
  home: string;
  away: string;
  outcome: "home" | "draw" | "away";
  goals: number;
  btts: boolean;
  ensemble: [number, number, number];
  poisson: [number, number, number];
  elo: [number, number, number];
  baseRate: [number, number, number];
  over25: number;
  bttsYes: number;
  /** Base-rate benchmarks for the goals markets. */
  baseOver25: number;
  baseBtts: number;
}

export interface ModelScore {
  n: number;
  logLoss: number;
  /** Ranked probability score for the ordered home/draw/away outcome. Lower is better. */
  rps: number;
  brier: number;
}

export interface BacktestResult {
  league: string;
  from: number;
  to: number;
  rows: ForecastRow[];
  scores: Record<"ensemble" | "poisson" | "elo" | "baseRate", ModelScore>;
  goals: { ou25: ModelScore; ou25BaseRate: ModelScore; btts: ModelScore; bttsBaseRate: ModelScore };
  calibration: CalibrationBin[];
}

const IDX = { home: 0, draw: 1, away: 2 } as const;

function score1x2(rows: ForecastRow[], pick: (r: ForecastRow) => [number, number, number]): ModelScore {
  let ll = 0;
  let rps = 0;
  let brier = 0;
  for (const r of rows) {
    const p = pick(r);
    const y = [0, 0, 0];
    y[IDX[r.outcome]] = 1;
    ll -= Math.log(Math.max(1e-12, p[IDX[r.outcome]]));
    const c1 = p[0] - y[0];
    const c2 = p[0] + p[1] - y[0] - y[1];
    rps += (c1 ** 2 + c2 ** 2) / 2;
    brier += p.reduce((s, pi, i) => s + (pi - y[i]) ** 2, 0);
  }
  const n = rows.length;
  return { n, logLoss: ll / n, rps: rps / n, brier: brier / n };
}

function scoreBinary(rows: { p: number; y: 0 | 1 }[]): ModelScore {
  return { n: rows.length, logLoss: logLoss(rows), rps: NaN, brier: brierScore(rows) };
}

const outcomeOf = (m: HistMatch) => (m.hg > m.ag ? "home" : m.hg === m.ag ? "draw" : "away") as ForecastRow["outcome"];

export function backtest(league: string, matches: HistMatch[], testFrom: number, testTo = Infinity): BacktestResult {
  const sorted = [...matches].sort((a, b) => a.date - b.date);
  const elo = newElo();
  const olRows: { diff: number; outcome: ForecastRow["outcome"]; date: number; season: string }[] = [];
  let ol: OrderedLogit | null = null;
  let olSeason: string | null = null;
  let fit: PoissonFit | null = null;
  let baseRate: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];
  let baseGoals = { over25: 0.5, btts: 0.5 };
  const rows: ForecastRow[] = [];

  for (const m of sorted) {
    const testing = m.date >= testFrom && m.date < testTo;
    if (testing) {
      if (!fit || m.date - fit.asOf >= 7 * DAY) {
        fit = fitPoisson(sorted, m.date);
        const recent = sorted.filter((h) => h.date < m.date && h.date >= m.date - 3 * 365 * DAY);
        const rate = (o: ForecastRow["outcome"]) => recent.filter((h) => outcomeOf(h) === o).length / Math.max(1, recent.length);
        baseRate = [rate("home"), rate("draw"), rate("away")];
        const k = Math.max(1, recent.length);
        baseGoals = { over25: recent.filter((h) => h.hg + h.ag > 2.5).length / k, btts: recent.filter((h) => h.hg > 0 && h.ag > 0).length / k };
      }
      if (!ol || olSeason !== m.season) {
        ol = fitOrderedLogit(olRows.filter((r) => r.date < m.date));
        olSeason = m.season;
      }
    }
    // Record the pre-match rating difference before updating (used both for fitting and forecasting).
    const diff = eloDiff(elo, m.home, m.away);
    if (testing && fit && ol) {
      const f = forecastMatch(fit, elo, ol, m.home, m.away);
      const x = f.selections;
      rows.push({
        date: m.date,
        home: m.home,
        away: m.away,
        outcome: outcomeOf(m),
        goals: m.hg + m.ag,
        btts: m.hg > 0 && m.ag > 0,
        ensemble: [x[0].probability, x[1].probability, x[2].probability],
        poisson: [x[0].components.poisson, x[1].components.poisson, x[2].components.poisson],
        elo: [x[0].components.elo!, x[1].components.elo!, x[2].components.elo!],
        baseRate,
        over25: x[3].probability,
        bttsYes: x[5].probability,
        baseOver25: baseGoals.over25,
        baseBtts: baseGoals.btts,
      });
    }
    olRows.push({ diff, outcome: outcomeOf(m), date: m.date, season: m.season });
    updateElo(elo, m);
  }

  const bin = rows.flatMap((r) => (["home", "draw", "away"] as const).map((o) => ({ p: r.ensemble[IDX[o]], y: (r.outcome === o ? 1 : 0) as 0 | 1 })));
  return {
    league,
    from: rows[0]?.date ?? testFrom,
    to: rows.at(-1)?.date ?? testFrom,
    rows,
    scores: {
      ensemble: score1x2(rows, (r) => r.ensemble),
      poisson: score1x2(rows, (r) => r.poisson),
      elo: score1x2(rows, (r) => r.elo),
      baseRate: score1x2(rows, (r) => r.baseRate),
    },
    goals: {
      ou25: scoreBinary(rows.map((r) => ({ p: r.over25, y: (r.goals > 2.5 ? 1 : 0) as 0 | 1 }))),
      ou25BaseRate: scoreBinary(rows.map((r) => ({ p: r.baseOver25, y: (r.goals > 2.5 ? 1 : 0) as 0 | 1 }))),
      btts: scoreBinary(rows.map((r) => ({ p: r.bttsYes, y: (r.btts ? 1 : 0) as 0 | 1 }))),
      bttsBaseRate: scoreBinary(rows.map((r) => ({ p: r.baseBtts, y: (r.btts ? 1 : 0) as 0 | 1 }))),
    },
    calibration: calibrationBins(bin, 10),
  };
}
