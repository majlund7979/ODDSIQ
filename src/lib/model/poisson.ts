// Dixon-Coles goals model (Dixon & Coles, 1997). Each team gets an attack and
// a defence strength; home goals ~ Poisson(attack_home × defence_away × home
// advantage), away goals ~ Poisson(attack_away × defence_home), with the
// low-score correction rho. Older matches count less (exponential time decay),
// and every team is shrunk towards the league average by a few pseudo-matches
// so that teams with little data are not given extreme strengths.

import type { HistMatch } from "./openfootball";

const DAY = 86_400_000;

export interface PoissonParams {
  /** Time-decay rate per day; 0.0019 halves a match's weight in about a year. */
  xi: number;
  /** Pseudo-matches pulling each team towards the league average. */
  shrink: number;
  /** Matches older than this are ignored. */
  windowDays: number;
  /** Strength assumed for a team with no matches in the window (typically a promoted side). */
  newTeam: { attack: number; defence: number };
}

export const POISSON_DEFAULTS: PoissonParams = { xi: 0.0019, shrink: 3, windowDays: 3 * 365, newTeam: { attack: 0.8, defence: 1.2 } };

export interface PoissonFit {
  attack: Map<string, number>;
  defence: Map<string, number>;
  /** Weighted matches per team, for the uncertainty estimate. */
  weight: Map<string, number>;
  home: number;
  rho: number;
  /** League-average goals per team per match. */
  base: number;
  asOf: number;
  matches: number;
  params: PoissonParams;
}

function tau(x: number, y: number, lambda: number, mu: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Fits on matches strictly before `asOf`. */
export function fitPoisson(all: HistMatch[], asOf: number, params: PoissonParams = POISSON_DEFAULTS): PoissonFit | null {
  const rows = all
    .filter((m) => m.date < asOf && m.date >= asOf - params.windowDays * DAY)
    .map((m) => ({ ...m, w: Math.exp(-params.xi * ((asOf - m.date) / DAY)) }));
  if (rows.length < 50) return null;

  const teams = [...new Set(rows.flatMap((m) => [m.home, m.away]))];
  const idx = new Map(teams.map((t, i) => [t, i]));
  const T = teams.length;
  const n = rows.length;
  const hi = Int32Array.from(rows, (m) => idx.get(m.home)!);
  const ai = Int32Array.from(rows, (m) => idx.get(m.away)!);
  const w = Float64Array.from(rows, (m) => m.w);
  const hg = Float64Array.from(rows, (m) => m.hg);
  const ag = Float64Array.from(rows, (m) => m.ag);
  const att = new Float64Array(T).fill(1);
  const def = new Float64Array(T).fill(1);
  const wt = new Float64Array(T);
  let W = 0;
  let goals = 0;
  let homeGoals = 0;
  for (let j = 0; j < n; j++) {
    W += w[j];
    goals += w[j] * (hg[j] + ag[j]);
    homeGoals += w[j] * hg[j];
    wt[hi[j]] += w[j];
    wt[ai[j]] += w[j];
  }
  const base = goals / (2 * W);
  let home = homeGoals / (goals - homeGoals);
  const k = params.shrink;
  const num = new Float64Array(T);
  const den = new Float64Array(T);

  for (let iter = 0; iter < 60; iter++) {
    num.fill(k * base);
    den.fill(k * base);
    for (let j = 0; j < n; j++) {
      num[hi[j]] += w[j] * hg[j];
      den[hi[j]] += w[j] * base * def[ai[j]] * home;
      num[ai[j]] += w[j] * ag[j];
      den[ai[j]] += w[j] * base * def[hi[j]];
    }
    for (let t = 0; t < T; t++) att[t] = num[t] / den[t];

    num.fill(k * base);
    den.fill(k * base);
    for (let j = 0; j < n; j++) {
      num[ai[j]] += w[j] * hg[j];
      den[ai[j]] += w[j] * base * att[hi[j]] * home;
      num[hi[j]] += w[j] * ag[j];
      den[hi[j]] += w[j] * base * att[ai[j]];
    }
    for (let t = 0; t < T; t++) def[t] = num[t] / den[t];

    let hDen = 0;
    for (let j = 0; j < n; j++) hDen += w[j] * base * att[hi[j]] * def[ai[j]];
    home = homeGoals / hDen;

    // Keep the average attack at 1 so base carries the goal level.
    let meanA = 0;
    for (let t = 0; t < T; t++) meanA += att[t] / T;
    for (let t = 0; t < T; t++) att[t] /= meanA;
  }
  const attack = new Map(teams.map((t, i) => [t, att[i]]));
  const defence = new Map(teams.map((t, i) => [t, def[i]]));
  const weight = new Map(teams.map((t, i) => [t, wt[i]]));

  // rho by grid search on the weighted likelihood of low scores.
  let rho = 0;
  let best = -Infinity;
  for (let r = -0.2; r <= 0.1001; r += 0.01) {
    let ll = 0;
    for (const m of rows) {
      if (m.hg > 1 || m.ag > 1) continue;
      const lambda = base * attack.get(m.home)! * defence.get(m.away)! * home;
      const mu = base * attack.get(m.away)! * defence.get(m.home)!;
      const t = tau(m.hg, m.ag, lambda, mu, r);
      if (t <= 0) {
        ll = -Infinity;
        break;
      }
      ll += m.w * Math.log(t);
    }
    if (ll > best) {
      best = ll;
      rho = Math.round(r * 100) / 100;
    }
  }
  return { attack, defence, weight, home, rho, base, asOf, matches: rows.length, params };
}

export interface GoalsForecast {
  lambda: number;
  mu: number;
  home: number;
  draw: number;
  away: number;
  over25: number;
  bttsYes: number;
  /** Weighted matches behind the two teams' strengths. */
  support: number;
  /** Teams with no matches in the window, given the new-team strength. */
  unknownTeams: string[];
}

const MAX_GOALS = 10;

function poissonPmf(k: number, l: number): number {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

export function forecastGoals(fit: PoissonFit, home: string, away: string): GoalsForecast {
  const unknownTeams = [home, away].filter((t) => !fit.attack.has(t));
  const a = (t: string) => fit.attack.get(t) ?? fit.params.newTeam.attack;
  const d = (t: string) => fit.defence.get(t) ?? fit.params.newTeam.defence;
  const lambda = fit.base * a(home) * d(away) * fit.home;
  const mu = fit.base * a(away) * d(home);
  let pH = 0;
  let pD = 0;
  let pA = 0;
  let over = 0;
  let btts = 0;
  let total = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      const p = poissonPmf(x, lambda) * poissonPmf(y, mu) * tau(x, y, lambda, mu, fit.rho);
      total += p;
      if (x > y) pH += p;
      else if (x === y) pD += p;
      else pA += p;
      if (x + y > 2.5) over += p;
      if (x > 0 && y > 0) btts += p;
    }
  }
  return {
    lambda,
    mu,
    home: pH / total,
    draw: pD / total,
    away: pA / total,
    over25: over / total,
    bttsYes: btts / total,
    support: (fit.weight.get(home) ?? 0) + (fit.weight.get(away) ?? 0),
    unknownTeams,
  };
}
