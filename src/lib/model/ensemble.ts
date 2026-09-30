// ODDSIQ football model v1: an equal-weight blend of the Dixon-Coles goals
// model and Elo for match result (1X2); goals markets (over/under 2.5, both
// teams to score) come from Dixon-Coles alone. Trained only on match results.

import { modelConsensus, predictionConfidence } from "@/lib/metrics/consensus";
import { eloDiff, outcomeProbs, type EloState, type OrderedLogit } from "./elo";
import { forecastGoals, type PoissonFit } from "./poisson";

export const REAL_MODEL = {
  ensemble: { id: "football-real-ensemble-v1.0", family: "real-ensemble", version: "1.0" },
  poisson: { id: "football-real-dixon-coles-v1.0", family: "real-dixon-coles", version: "1.0" },
  elo: { id: "football-real-elo-v1.0", family: "real-elo", version: "1.0" },
  weights: { poisson: 0.5, elo: 0.5 },
  features: ["match results (goals) only", "home advantage", "time-decayed team attack and defence", "Elo rating difference"],
  notes:
    "Equal-weight blend of Dixon-Coles and Elo for 1X2; Dixon-Coles alone for over/under 2.5 and both teams to score. Refitted on the last three seasons of results before every prediction. Uses no lineups, injuries, xG or market prices.",
};

export const UNCERTAINTY_NOTE =
  "Approximate 95% range: combines the spread between the two component models with a term that shrinks as more recent matches of both teams are available. It is not a formal confidence interval.";

export type Outcome1x2 = "home" | "draw" | "away";

export interface SelectionForecast {
  market: "1X2" | "OU25" | "BTTS";
  selection: string;
  probability: number;
  ciLow: number;
  ciHigh: number;
  confidence: number;
  components: { poisson: number; elo: number | null };
}

export interface MatchForecast {
  selections: SelectionForecast[];
  expectedGoals: { home: number; away: number };
  support: number;
  unknownTeams: string[];
}

function interval(p: number, spread: number, support: number) {
  const sampling = Math.sqrt((p * (1 - p)) / Math.max(support, 4));
  const half = 1.96 * Math.sqrt(spread ** 2 + sampling ** 2);
  return { ciLow: Math.max(0.001, p - half), ciHigh: Math.min(0.999, p + half) };
}

export function forecastMatch(fit: PoissonFit, elo: EloState, ol: OrderedLogit, home: string, away: string): MatchForecast {
  const g = forecastGoals(fit, home, away);
  const e = outcomeProbs(ol, eloDiff(elo, home, away));
  const w = REAL_MODEL.weights;
  const blend = (k: Outcome1x2) => w.poisson * g[k] + w.elo * e[k];
  const total = blend("home") + blend("draw") + blend("away");
  const selections: SelectionForecast[] = (["home", "draw", "away"] as const).map((k) => {
    const p = blend(k) / total;
    const spread = modelConsensus([g[k], e[k]]).stdevPp / 100;
    const ci = interval(p, spread, g.support);
    return { market: "1X2", selection: k, probability: p, ...ci, confidence: predictionConfidence({ ...ci, modelStdevPp: spread * 100, dataQuality: g.unknownTeams.length ? 60 : 100 }), components: { poisson: g[k], elo: e[k] } };
  });
  for (const [market, sel, p] of [
    ["OU25", "over", g.over25],
    ["OU25", "under", 1 - g.over25],
    ["BTTS", "yes", g.bttsYes],
    ["BTTS", "no", 1 - g.bttsYes],
  ] as const) {
    const ci = interval(p, 0, g.support);
    selections.push({ market, selection: sel, probability: p, ...ci, confidence: predictionConfidence({ ...ci, modelStdevPp: 0, dataQuality: g.unknownTeams.length ? 60 : 100 }), components: { poisson: p, elo: null } });
  }
  return { selections, expectedGoals: { home: g.lambda, away: g.mu }, support: g.support, unknownTeams: g.unknownTeams };
}
