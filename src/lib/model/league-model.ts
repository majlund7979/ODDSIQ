// Everything the real model needs for one league as of a moment: the
// Dixon-Coles fit, Elo ratings, the Elo outcome mapping and the team names it
// knows. Shared by the ledger pipeline and the live snapshot behind the picks.

import { eloDiff, fitOrderedLogit, newElo, updateElo, type EloState, type OrderedLogit } from "./elo";
import { forecastMatch, type MatchForecast } from "./ensemble";
import type { HistMatch } from "./openfootball";
import { fitPoisson, type PoissonFit } from "./poisson";
import { matchTeam } from "./teams";

const DAY = 86_400_000;
export const MIN_OUTCOME_ROWS = 200;

export interface LeagueModel {
  asOf: number;
  fit: PoissonFit | null;
  elo: EloState;
  ol: OrderedLogit;
  names: string[];
  ready: boolean;
  /** Latest result date the model has seen. */
  dataThrough: number | null;
  /** League frequencies over the last three years, the benchmark for "why" factors. */
  baseRates: { home: number; draw: number; away: number; over15: number; over25: number; bttsYes: number };
  /** Results before asOf, oldest first, for form and head-to-head views. */
  history: HistMatch[];
}

export function buildLeagueModel(history: HistMatch[], asOf: number): LeagueModel {
  const past = history.filter((m) => m.date < asOf).sort((a, b) => a.date - b.date);
  const fit = fitPoisson(past, asOf);
  const elo = newElo();
  const rows: { diff: number; outcome: "home" | "draw" | "away" }[] = [];
  const warmUp = (past[0]?.date ?? asOf) + 180 * DAY;
  for (const m of past) {
    const diff = eloDiff(elo, m.home, m.away);
    if (m.date >= warmUp) rows.push({ diff, outcome: m.hg > m.ag ? "home" : m.hg === m.ag ? "draw" : "away" });
    updateElo(elo, m);
  }
  const names = [...new Set(past.filter((m) => m.date >= asOf - 400 * DAY).flatMap((m) => [m.home, m.away]))];
  const recent = past.filter((m) => m.date >= asOf - 3 * 365 * DAY);
  const share = (f: (m: HistMatch) => boolean) => (recent.length ? recent.filter(f).length / recent.length : NaN);
  const baseRates = {
    home: share((m) => m.hg > m.ag),
    draw: share((m) => m.hg === m.ag),
    away: share((m) => m.hg < m.ag),
    over15: share((m) => m.hg + m.ag > 1.5),
    over25: share((m) => m.hg + m.ag > 2.5),
    bttsYes: share((m) => m.hg > 0 && m.ag > 0),
  };
  return { asOf, fit, elo, ol: fitOrderedLogit(rows), names, ready: Boolean(fit) && rows.length >= MIN_OUTCOME_ROWS, dataThrough: past.at(-1)?.date ?? null, baseRates, history: past };
}

export type ForecastResult = { ok: true; forecast: MatchForecast; home: string; away: string } | { ok: false; reason: string };

export function forecastFor(model: LeagueModel, homeName: string, awayName: string, leagueName: string): ForecastResult {
  if (!model.ready || !model.fit) return { ok: false, reason: `Not enough ${leagueName} results to fit the model` };
  const home = matchTeam(homeName, model.names);
  const away = matchTeam(awayName, model.names);
  if (!home || !away) return { ok: false, reason: `Team name not matched to results data: ${[!home && homeName, !away && awayName].filter(Boolean).join(", ")}` };
  return { ok: true, forecast: forecastMatch(model.fit, model.elo, model.ol, home, away), home, away };
}
