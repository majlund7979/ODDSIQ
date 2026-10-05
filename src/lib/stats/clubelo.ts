// Club strength across leagues from ClubElo (clubelo.com): one Elo rating per
// European club, comparable between countries, updated daily. Used where our
// own results model has no data (Champions League, Europa League, Superliga):
// the analysis shows both ratings, and on 1X2 the rating gap is blended into
// the bookmakers' price as an estimate. Free, no key: one CSV per day.

import { matchTeam } from "@/lib/model/teams";

export const CLUBELO_SOURCE = "ClubElo (clubelo.com)";
export const CLUBELO_MODEL = "clubelo-v1";

/** Home advantage in Elo points; ClubElo's own estimate is usually 50–70. */
export const CLUBELO_HOME = 60;
/** Share of the 1X2 probability taken from the ClubElo estimate on market-only matches; the rest is the market's. */
export const CLUBELO_WEIGHT = 0.3;

export interface ClubRating {
  club: string;
  country: string;
  level: number;
  elo: number;
}

export interface ClubEloPair {
  home: ClubRating;
  away: ClubRating;
  /** Day of the ratings (UTC midnight). */
  date: number;
  /** "DEMO DATA" in demo mode. */
  source: string;
}

/** Parses ClubElo's CSV (Rank,Club,Country,Level,Elo,From,To). Bad lines are skipped. */
export function parseClubElo(csv: string): ClubRating[] {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines.shift()?.split(",").map((h) => h.trim().toLowerCase()) ?? [];
  const at = (k: string) => head.indexOf(k);
  const [ci, co, le, el] = [at("club"), at("country"), at("level"), at("elo")];
  if (ci < 0 || co < 0 || el < 0) return [];
  const out: ClubRating[] = [];
  for (const line of lines) {
    const f = line.split(",");
    const elo = Number(f[el]);
    if (!f[ci] || !Number.isFinite(elo)) continue;
    out.push({ club: f[ci].trim(), country: f[co].trim(), level: Number(f[le]) || 0, elo });
  }
  return out;
}

/** ClubElo country code per odds-feed competition key; UEFA club competitions look across all countries. */
const COUNTRY: Record<string, string | null> = {
  soccer_epl: "ENG",
  soccer_efl_champ: "ENG",
  soccer_spain_la_liga: "ESP",
  soccer_spain_segunda_division: "ESP",
  soccer_germany_bundesliga: "GER",
  soccer_germany_bundesliga2: "GER",
  soccer_italy_serie_a: "ITA",
  soccer_italy_serie_b: "ITA",
  soccer_france_ligue_one: "FRA",
  soccer_france_ligue_two: "FRA",
  soccer_denmark_superliga: "DEN",
  soccer_denmark_first_division: "DEN",
  soccer_netherlands_eredivisie: "NED",
  soccer_portugal_primeira_liga: "POR",
  soccer_belgium_first_div: "BEL",
  soccer_spl: "SCO",
  soccer_turkey_super_league: "TUR",
  soccer_austria_bundesliga: "AUT",
  soccer_switzerland_superleague: "SUI",
  soccer_greece_super_league: "GRE",
  soccer_norway_eliteserien: "NOR",
  soccer_sweden_allsvenskan: "SWE",
  soccer_poland_ekstraklasa: "POL",
  soccer_uefa_champs_league: null,
  soccer_uefa_europa_league: null,
  soccer_uefa_europa_conference_league: null,
};

/** Whether ClubElo covers a competition (club football in Europe), from its league id ("<feed>-<key>"). */
export const clubEloCovers = (leagueId: string) => leagueId.slice(leagueId.indexOf("-") + 1) in COUNTRY;

/** Finds one team among the ratings: within the league's country when it has one, else across Europe. */
export function findClub(name: string, leagueId: string, ratings: ClubRating[]): ClubRating | null {
  const country = COUNTRY[leagueId.slice(leagueId.indexOf("-") + 1)];
  if (country === undefined) return null;
  const pool = country ? ratings.filter((r) => r.country === country) : ratings;
  const hit = matchTeam(name, pool.map((r) => r.club));
  return hit ? pool.find((r) => r.club === hit)! : null;
}

export function clubPair(home: string, away: string, leagueId: string, ratings: ClubRating[], date: number, source = CLUBELO_SOURCE): ClubEloPair | null {
  const h = findClub(home, leagueId, ratings);
  const a = findClub(away, leagueId, ratings);
  return h && a ? { home: h, away: a, date, source } : null;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
// Ordered logit on the rating gap. At an even gap: 36,5 % / 27 % / 36,5 %; the scale (ln 10) keeps
// ClubElo's own win expectancy, 1 / (1 + 10^(−gap/400)), for home win plus half the draw.
const C = 0.553;
const SCALE = Math.LN10;

/** Home, draw and away from the two ratings plus home advantage (estimated, clubelo-v1). */
export function clubEloProbs(home: number, away: number, homeAdvantage = CLUBELO_HOME): { home: number; draw: number; away: number } {
  const x = (SCALE * (home + homeAdvantage - away)) / 400;
  const pAway = sigmoid(-C - x);
  const notHome = sigmoid(C - x);
  return { home: 1 - notHome, draw: notHome - pAway, away: pAway };
}

const DAY = 86_400_000;
const RETRY_MS = 3_600_000;
let memo: { day: number; ratings: ClubRating[] } | null = null;
let failedAt = -Infinity;

/** Today's ratings (yesterday's while ClubElo cannot be reached); null without any. Cached for the day on this server and in Next's data cache. */
export async function clubEloRatings(now: number): Promise<{ date: number; ratings: ClubRating[] } | null> {
  const day = Math.floor(now / DAY) * DAY;
  if (memo?.day === day) return { date: day, ratings: memo.ratings };
  // After a failed fetch, wait an hour before asking again, so a slow ClubElo never slows the pages.
  if (now - failedAt < RETRY_MS) return memo ? { date: memo.day, ratings: memo.ratings } : null;
  failedAt = now;
  try {
    const res = await fetch(`http://api.clubelo.com/${new Date(day).toISOString().slice(0, 10)}`, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(4000),
    } as RequestInit);
    if (!res.ok) return null;
    const ratings = parseClubElo(await res.text());
    if (!ratings.length) return null;
    memo = { day, ratings };
    failedAt = -Infinity;
    return { date: day, ratings };
  } catch {
    return null;
  }
}
