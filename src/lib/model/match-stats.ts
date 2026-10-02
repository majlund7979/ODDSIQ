// Corners, cards and fouls (free kicks) per match, and a count model that
// sets a fair line for each. History comes from football-data.co.uk's
// season CSVs (free for non-commercial use), which carry per-team corners,
// yellow and red cards and fouls for the main European leagues.
//
// Model: each team's rate for and against, relative to the league's home or
// away average over its last matches, shrunk toward 1; the match total is
// negative binomial, with the league's own overdispersion.

import { matchTeam, teamKey } from "./teams";

export const FOOTBALL_DATA_SOURCE = "football-data.co.uk";
const BASE = "https://www.football-data.co.uk/mmz4281";

/** openfootball league code → football-data.co.uk division. */
export const FOOTBALL_DATA_DIVISIONS: Record<string, string> = {
  "en.1": "E0",
  "en.2": "E1",
  "de.1": "D1",
  "es.1": "SP1",
  "it.1": "I1",
  "fr.1": "F1",
  "nl.1": "N1",
  "pt.1": "P1",
  "be.1": "B1",
};

export type CountStat = "corners" | "cards" | "fouls";
export const COUNT_STATS: CountStat[] = ["corners", "cards", "fouls"];

export interface StatMatch {
  league: string;
  season: string;
  date: number;
  home: string;
  away: string;
  corners: [number, number] | null;
  /** Yellow plus red cards. */
  cards: [number, number] | null;
  fouls: [number, number] | null;
}

/** "2025-26" → "2526". */
export const footballDataSeason = (season: string) => `${season.slice(2, 4)}${season.slice(5, 7)}`;

function parseDate(s: string): number {
  const [d, m, y] = s.split("/").map(Number);
  if (!d || !m || !y) return NaN;
  return Date.UTC(y < 100 ? 2000 + y : y, m - 1, d, 12);
}

/** Parses a football-data.co.uk results CSV by header name. Rows without a date or teams are skipped. */
export function parseFootballDataCsv(league: string, season: string, csv: string): StatMatch[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(",").map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const idx = { date: col("Date"), home: col("HomeTeam"), away: col("AwayTeam"), hc: col("HC"), ac: col("AC"), hy: col("HY"), ay: col("AY"), hr: col("HR"), ar: col("AR"), hf: col("HF"), af: col("AF") };
  if (idx.date < 0 || idx.home < 0 || idx.away < 0) return [];
  const out: StatMatch[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const num = (i: number) => (i >= 0 && c[i] !== undefined && c[i].trim() !== "" && Number.isFinite(Number(c[i])) ? Number(c[i]) : null);
    const pair = (a: number, b: number): [number, number] | null => {
      const x = num(a);
      const y = num(b);
      return x === null || y === null ? null : [x, y];
    };
    const date = parseDate(c[idx.date] ?? "");
    const home = c[idx.home]?.trim();
    const away = c[idx.away]?.trim();
    if (!Number.isFinite(date) || !home || !away) continue;
    const yellow = pair(idx.hy, idx.ay);
    const red = pair(idx.hr, idx.ar);
    out.push({
      league,
      season,
      date,
      home,
      away,
      corners: pair(idx.hc, idx.ac),
      cards: yellow ? [yellow[0] + (red?.[0] ?? 0), yellow[1] + (red?.[1] ?? 0)] : null,
      fouls: pair(idx.hf, idx.af),
    });
  }
  return out;
}

export async function fetchFootballData(league: string, season: string, fetchImpl: typeof fetch = fetch): Promise<StatMatch[] | null> {
  const div = FOOTBALL_DATA_DIVISIONS[league];
  if (!div) return null;
  const res = await fetchImpl(`${BASE}/${footballDataSeason(season)}/${div}.csv`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`football-data.co.uk ${season}/${div} returned ${res.status}`);
  return parseFootballDataCsv(league, season, await res.text());
}

// ---------------------------------------------------------------------------
// Count model

export const FORM_MATCHES = 20;
/** Pseudo-matches pulling a team's rate toward the league average. */
export const SHRINK = 6;
const LEAGUE_WINDOW_MS = 365 * 86_400_000;

export interface CountModel {
  stat: CountStat;
  homeMean: number;
  awayMean: number;
  /** Negative binomial size; Infinity means Poisson. */
  size: number;
  matches: number;
  history: StatMatch[];
}

/** League averages and dispersion for one stat, from matches before `asOf`. */
export function buildCountModel(stat: CountStat, history: StatMatch[], asOf: number): CountModel | null {
  const past = history.filter((m) => m.date < asOf && m[stat]).sort((a, b) => a.date - b.date);
  const recent = past.filter((m) => m.date >= asOf - LEAGUE_WINDOW_MS);
  if (recent.length < 50) return null;
  const mean = (f: (m: StatMatch) => number) => recent.reduce((s, m) => s + f(m), 0) / recent.length;
  const homeMean = mean((m) => m[stat]![0]);
  const awayMean = mean((m) => m[stat]![1]);
  const total = homeMean + awayMean;
  const variance = mean((m) => (m[stat]![0] + m[stat]![1] - total) ** 2);
  const size = variance > total * 1.02 ? (total * total) / (variance - total) : Infinity;
  return { stat, homeMean, awayMean, size, matches: recent.length, history: past };
}

export interface TeamRate {
  /** Matches behind the rate. */
  n: number;
  /** Average per match, raw. */
  forAvg: number;
  againstAvg: number;
  /** Relative to the league average, shrunk toward 1. */
  forRatio: number;
  againstRatio: number;
}

export function teamRate(model: CountModel, team: string): TeamRate {
  const key = teamKey(team);
  const rows: { f: number; a: number; fm: number; am: number }[] = [];
  for (let i = model.history.length - 1; i >= 0 && rows.length < FORM_MATCHES; i--) {
    const m = model.history[i];
    if (teamKey(m.home) === key) rows.push({ f: m[model.stat]![0], a: m[model.stat]![1], fm: model.homeMean, am: model.awayMean });
    else if (teamKey(m.away) === key) rows.push({ f: m[model.stat]![1], a: m[model.stat]![0], fm: model.awayMean, am: model.homeMean });
  }
  const n = rows.length;
  const sum = (g: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + g(r), 0);
  return {
    n,
    forAvg: n ? sum((r) => r.f) / n : NaN,
    againstAvg: n ? sum((r) => r.a) / n : NaN,
    forRatio: (sum((r) => r.f / r.fm) + SHRINK) / (n + SHRINK),
    againstRatio: (sum((r) => r.a / r.am) + SHRINK) / (n + SHRINK),
  };
}

function logGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** P(total = k) for a negative binomial with this mean and size (Poisson when size is infinite). */
export function countPmf(k: number, mean: number, size: number): number {
  if (!Number.isFinite(size)) return Math.exp(k * Math.log(mean) - mean - logGamma(k + 1));
  const p = size / (size + mean);
  return Math.exp(logGamma(k + size) - logGamma(size) - logGamma(k + 1) + size * Math.log(p) + k * Math.log(1 - p));
}

export function overProbability(line: number, mean: number, size: number): number {
  let under = 0;
  for (let k = 0; k <= Math.floor(line); k++) under += countPmf(k, mean, size);
  return Math.min(1, Math.max(0, 1 - under));
}

export interface LineRow {
  line: number;
  over: number;
  under: number;
}

export interface CountForecast {
  stat: CountStat;
  expected: { home: number; away: number; total: number };
  rates: { home: TeamRate; away: TeamRate };
  league: { homeMean: number; awayMean: number; matches: number };
  /** The x.5 line where over and under are closest to even. */
  fairLine: number;
  lines: LineRow[];
  /**
   * The suggested play: over when the match should produce more than an average
   * league match, under when fewer, one line on the safe side of the fair line.
   * vsLeague is the expected total relative to the league average (0.1 = 10% more).
   */
  suggestion: { side: "over" | "under"; line: number; probability: number; vsLeague: number };
}

/** Teams are the names used in the stats history (match them first). */
export function forecastCount(model: CountModel, home: string, away: string): CountForecast | null {
  const h = teamRate(model, home);
  const a = teamRate(model, away);
  if (h.n < 5 || a.n < 5) return null;
  const eh = model.homeMean * h.forRatio * a.againstRatio;
  const ea = model.awayMean * a.forRatio * h.againstRatio;
  const total = eh + ea;
  let fairLine = Math.floor(total) + 0.5;
  for (let l = Math.max(0.5, fairLine - 3); l <= fairLine + 3; l++) {
    if (Math.abs(overProbability(l, total, model.size) - 0.5) < Math.abs(overProbability(fairLine, total, model.size) - 0.5)) fairLine = l;
  }
  const lines: LineRow[] = [];
  for (let l = Math.max(0.5, fairLine - 3); l <= fairLine + 3; l++) {
    const over = overProbability(l, total, model.size);
    lines.push({ line: l, over, under: 1 - over });
  }
  // Lean the way this match differs from an average league match, one line on the safe side of the fair line.
  const leagueTotal = model.homeMean + model.awayMean;
  const side: "over" | "under" = total >= leagueTotal ? "over" : "under";
  const line = side === "over" ? Math.max(0.5, fairLine - 1) : fairLine + 1;
  const pOver = overProbability(line, total, model.size);
  const suggestion = { side, line, probability: side === "over" ? pOver : 1 - pOver, vsLeague: total / leagueTotal - 1 };
  return { stat: model.stat, expected: { home: eh, away: ea, total }, rates: { home: h, away: a }, league: { homeMean: model.homeMean, awayMean: model.awayMean, matches: model.matches }, fairLine, lines, suggestion };
}

export type CountModels = Partial<Record<CountStat, CountModel>>;
export type CountForecasts = Partial<Record<CountStat, CountForecast>>;

export function buildCountModels(history: StatMatch[], asOf: number): CountModels {
  const out: CountModels = {};
  for (const s of COUNT_STATS) {
    const m = buildCountModel(s, history, asOf);
    if (m) out[s] = m;
  }
  return out;
}

/** Forecasts for a fixture named as another source names it; teams not found in the stats history give none. */
export function forecastCounts(models: CountModels, homeName: string, awayName: string): CountForecasts {
  const out: CountForecasts = {};
  for (const s of COUNT_STATS) {
    const m = models[s];
    if (!m) continue;
    const names = [...new Set(m.history.slice(-400).flatMap((x) => [x.home, x.away]))];
    const home = matchTeam(homeName, names);
    const away = matchTeam(awayName, names);
    const f = home && away ? forecastCount(m, home, away) : null;
    if (f) out[s] = f;
  }
  return out;
}
