// Elo ratings with home advantage and a goal-difference multiplier (in the
// style of the World Football Elo ratings). Ratings update after every match;
// the rating difference is turned into home/draw/away probabilities by an
// ordered-logit fitted on earlier matches.

import type { HistMatch } from "./openfootball";

export interface EloParams {
  k: number;
  homeAdvantage: number;
  /** Rating given to a team seen for the first time (below the 1500 average: usually a promoted side). */
  newTeam: number;
  /** Share of the way each rating moves back towards 1500 at the start of a season. */
  seasonRegression: number;
}

export const ELO_DEFAULTS: EloParams = { k: 20, homeAdvantage: 65, newTeam: 1420, seasonRegression: 0.2 };

export interface EloState {
  ratings: Map<string, number>;
  games: Map<string, number>;
  season: string | null;
  params: EloParams;
}

export const newElo = (params: EloParams = ELO_DEFAULTS): EloState => ({ ratings: new Map(), games: new Map(), season: null, params });

export const rating = (s: EloState, team: string) => s.ratings.get(team) ?? s.params.newTeam;

/** Home rating minus away rating, including home advantage. */
export const eloDiff = (s: EloState, home: string, away: string) => rating(s, home) + s.params.homeAdvantage - rating(s, away);

function gdMultiplier(gd: number): number {
  const n = Math.abs(gd);
  return n <= 1 ? 1 : n === 2 ? 1.5 : (11 + n) / 8;
}

export function updateElo(s: EloState, m: HistMatch): void {
  if (s.season !== null && m.season !== s.season) {
    for (const [t, r] of s.ratings) s.ratings.set(t, r + (1500 - r) * s.params.seasonRegression);
  }
  s.season = m.season;
  const dr = eloDiff(s, m.home, m.away);
  const expected = 1 / (1 + 10 ** (-dr / 400));
  const result = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0;
  const delta = s.params.k * gdMultiplier(m.hg - m.ag) * (result - expected);
  s.ratings.set(m.home, rating(s, m.home) + delta);
  s.ratings.set(m.away, rating(s, m.away) - delta);
  s.games.set(m.home, (s.games.get(m.home) ?? 0) + 1);
  s.games.set(m.away, (s.games.get(m.away) ?? 0) + 1);
}

/** P(away) = σ(c1 − x), P(away or draw) = σ(c2 − x), with x = scale × rating difference / 400. */
export interface OrderedLogit {
  c1: number;
  c2: number;
  scale: number;
  n: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function outcomeProbs(ol: OrderedLogit, diff: number): { home: number; draw: number; away: number } {
  const x = (ol.scale * diff) / 400;
  const away = sigmoid(ol.c1 - x);
  const notHome = sigmoid(ol.c2 - x);
  return { home: 1 - notHome, draw: Math.max(1e-6, notHome - away), away };
}

/** Fits the ordered logit by gradient descent on (rating difference, outcome) pairs. */
export function fitOrderedLogit(rows: { diff: number; outcome: "home" | "draw" | "away" }[]): OrderedLogit {
  let c1 = -1;
  let c2 = 0.2;
  let scale = 2.5;
  const lr = 0.5;
  for (let iter = 0; iter < 400; iter++) {
    let g1 = 0;
    let g2 = 0;
    let gs = 0;
    for (const r of rows) {
      const x = (scale * r.diff) / 400;
      const s1 = sigmoid(c1 - x);
      const s2 = sigmoid(c2 - x);
      const dx = r.diff / 400;
      // Gradients of the negative log-likelihood.
      if (r.outcome === "away") {
        g1 -= 1 - s1;
        gs += (1 - s1) * dx;
      } else if (r.outcome === "home") {
        g2 += s2;
        gs -= s2 * dx;
      } else {
        const p = Math.max(1e-9, s2 - s1);
        const d1 = s1 * (1 - s1);
        const d2 = s2 * (1 - s2);
        g1 += d1 / p;
        g2 -= d2 / p;
        gs -= (-d2 + d1) * dx / p;
      }
    }
    const n = rows.length || 1;
    c1 -= (lr * g1) / n;
    c2 -= (lr * g2) / n;
    scale -= (lr * gs) / n;
    if (c2 < c1 + 0.05) c2 = c1 + 0.05;
  }
  return { c1, c2, scale, n: rows.length };
}
