// "Why" factors for a real-model forecast: an exact split of the ensemble
// probability's distance from the league base rate into the parts each
// component contributes. They describe the model, not the match.

import type { ExplanationFactor } from "@/lib/domain/types";
import { eloDiff } from "./elo";
import { REAL_MODEL, type MatchForecast } from "./ensemble";
import type { LeagueModel } from "./league-model";
import { forecastGoals } from "./poisson";

export function explainSelection(model: LeagueModel, home: string, away: string, f: MatchForecast, market: string, selection: string): ExplanationFactor[] {
  const fit = model.fit!;
  const s = f.selections.find((x) => x.market === market && x.selection === selection);
  if (!s) return [];
  const w = REAL_MODEL.weights;
  if (market === "1X2") {
    const key = selection as "home" | "draw" | "away";
    const base = model.baseRates[key];
    const neutral = forecastGoals({ ...fit, home: 1 }, home, away)[key];
    const dc = s.components.poisson;
    const elo = s.components.elo ?? base;
    const diff = Math.round(eloDiff(model.elo, home, away));
    return [
      { label: "Attack and defence ratings (goals model)", value: `expected goals ${f.expectedGoals.home.toFixed(2)}–${f.expectedGoals.away.toFixed(2)}`, contributionPp: w.poisson * (neutral - base) * 100 },
      { label: "Home advantage (goals model)", value: `home scoring ×${fit.home.toFixed(2)}`, contributionPp: w.poisson * (dc - neutral) * 100 },
      { label: "Elo rating difference", value: `${diff >= 0 ? "+" : "−"}${Math.abs(diff)} points incl. home advantage`, contributionPp: w.elo * (elo - base) * 100 },
    ].sort((a, b) => Math.abs(b.contributionPp) - Math.abs(a.contributionPp));
  }
  const base = market === "OU15" ? model.baseRates.over15 : market === "OU25" ? model.baseRates.over25 : model.baseRates.bttsYes;
  const yes = selection === "over" || selection === "yes";
  return [
    {
      label: market === "OU15" || market === "OU25" ? "Expected total goals" : "Both sides' expected goals",
      value: `${f.expectedGoals.home.toFixed(2)} + ${f.expectedGoals.away.toFixed(2)}`,
      contributionPp: (s.probability - (yes ? base : 1 - base)) * 100,
    },
  ];
}
