// Historical results from openfootball/football.json (CC0 1.0, public domain),
// updated daily for the current season. Used to train and backtest the model.

export const OPENFOOTBALL_SOURCE = "openfootball/football.json (CC0)";
const RAW = "https://raw.githubusercontent.com/openfootball/football.json/master";

/** openfootball league code → The Odds API sport key and display name. */
export const RESULT_LEAGUES: { code: string; oddsKey: string; name: string }[] = [
  { code: "en.1", oddsKey: "soccer_epl", name: "English Premier League" },
  { code: "en.2", oddsKey: "soccer_efl_champ", name: "EFL Championship" },
  { code: "de.1", oddsKey: "soccer_germany_bundesliga", name: "Bundesliga" },
  { code: "es.1", oddsKey: "soccer_spain_la_liga", name: "La Liga" },
  { code: "it.1", oddsKey: "soccer_italy_serie_a", name: "Serie A" },
  { code: "fr.1", oddsKey: "soccer_france_ligue_one", name: "Ligue 1" },
  { code: "nl.1", oddsKey: "soccer_netherlands_eredivisie", name: "Eredivisie" },
  { code: "pt.1", oddsKey: "soccer_portugal_primeira_liga", name: "Primeira Liga" },
  { code: "be.1", oddsKey: "soccer_belgium_first_div", name: "Belgian First Division" },
  { code: "at.1", oddsKey: "soccer_austria_bundesliga", name: "Austrian Bundesliga" },
  // National teams, one model for all of them (src/lib/model/international.ts).
  { code: "intl", oddsKey: "soccer_uefa_nations_league", name: "Landskampe" },
  { code: "intl", oddsKey: "soccer_fifa_world_cup_qualifiers_europe", name: "Landskampe" },
  { code: "intl", oddsKey: "soccer_uefa_euro_qualification", name: "Landskampe" },
  { code: "intl", oddsKey: "soccer_international_friendlies", name: "Landskampe" },
];

export const leagueForOddsKey = (oddsKey: string) => RESULT_LEAGUES.find((l) => l.oddsKey === oddsKey) ?? null;

export interface HistMatch {
  league: string;
  season: string;
  /** Match day, 12:00 UTC (kickoff times in the source are local). */
  date: number;
  home: string;
  away: string;
  hg: number;
  ag: number;
}

interface RawMatch {
  date: string;
  team1: string;
  team2: string;
  score?: { ft?: [number, number] } | unknown[];
}

export function parseSeason(league: string, season: string, raw: { matches: RawMatch[] }): HistMatch[] {
  const out: HistMatch[] = [];
  for (const m of raw.matches ?? []) {
    const ft = m.score && !Array.isArray(m.score) ? m.score.ft : undefined;
    if (!ft || ft.length !== 2 || !Number.isInteger(ft[0]) || !Number.isInteger(ft[1])) continue;
    const date = Date.parse(`${m.date}T12:00:00Z`);
    if (Number.isNaN(date)) continue;
    out.push({ league, season, date, home: m.team1, away: m.team2, hg: ft[0], ag: ft[1] });
  }
  return out;
}

/** Season label ("2025-26") that contains a timestamp; seasons start in July. */
export function seasonOf(t: number): string {
  const d = new Date(t);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function recentSeasons(now: number, count: number): string[] {
  const first = Number(seasonOf(now).slice(0, 4));
  return Array.from({ length: count }, (_, i) => {
    const y = first - i;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  });
}

export async function fetchSeason(league: string, season: string, fetchImpl: typeof fetch = fetch): Promise<HistMatch[] | null> {
  const res = await fetchImpl(`${RAW}/${season}/${league}.json`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`openfootball ${season}/${league} returned ${res.status}`);
  return parseSeason(league, season, await res.json());
}

/** Parses the committed CSV fixture (season,date,home,away,hg,ag). */
export function parseResultsCsv(league: string, csv: string): HistMatch[] {
  return csv
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("season,"))
    .map((l) => {
      const [season, date, home, away, hg, ag] = l.split(",");
      return { league, season, date: Date.parse(`${date}T12:00:00Z`), home, away, hg: Number(hg), ag: Number(ag) };
    });
}
