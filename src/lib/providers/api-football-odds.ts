// Odds from API-Football v3 (https://www.api-football.com) for the
// competitions The Odds API's small monthly allowance cannot cover:
// internationals and the rest of Europe's bigger leagues. Every call costs one
// request from the daily allowance (7,500 on Pro); prices update every few
// hours and are offered from a few days before kickoff.
//
// Competition keys reuse The Odds API's names where one exists, so the
// results model (keyed by those names) covers the leagues it has history for.

import { apiFootballGet } from "@/lib/stats/api-football";
import type { FeedCompetition, FeedEvent, FeedPrice, FeedQuota, FeedResponse, FeedResult, OddsFeed } from "./types";

export const API_FOOTBALL_ODDS = "api-football-odds";
const DAY = 86_400_000;

/** Competition key → API-Football league id and the name the site shows. */
export const AF_COMPETITIONS: { key: string; leagueId: number; name: string }[] = [
  { key: "soccer_uefa_nations_league", leagueId: 5, name: "UEFA Nations League" },
  { key: "soccer_fifa_world_cup_qualifiers_europe", leagueId: 32, name: "VM-kvalifikation (Europa)" },
  { key: "soccer_uefa_euro_qualification", leagueId: 960, name: "EM-kvalifikation" },
  { key: "soccer_international_friendlies", leagueId: 10, name: "Landskampe (venskab)" },
  { key: "soccer_uefa_europa_league", leagueId: 3, name: "UEFA Europa League" },
  { key: "soccer_uefa_europa_conference_league", leagueId: 848, name: "UEFA Conference League" },
  { key: "soccer_efl_champ", leagueId: 40, name: "Championship" },
  { key: "soccer_germany_bundesliga2", leagueId: 79, name: "2. Bundesliga" },
  { key: "soccer_italy_serie_b", leagueId: 136, name: "Serie B" },
  { key: "soccer_spain_segunda_division", leagueId: 141, name: "LaLiga 2" },
  { key: "soccer_france_ligue_two", leagueId: 62, name: "Ligue 2" },
  { key: "soccer_netherlands_eredivisie", leagueId: 88, name: "Eredivisie" },
  { key: "soccer_portugal_primeira_liga", leagueId: 94, name: "Primeira Liga" },
  { key: "soccer_belgium_first_div", leagueId: 144, name: "Jupiler Pro League" },
  { key: "soccer_spl", leagueId: 179, name: "Skotsk Premiership" },
  { key: "soccer_turkey_super_league", leagueId: 203, name: "Süper Lig" },
  { key: "soccer_austria_bundesliga", leagueId: 218, name: "Østrigsk Bundesliga" },
  { key: "soccer_switzerland_superleague", leagueId: 207, name: "Schweizisk Super League" },
  { key: "soccer_greece_super_league", leagueId: 197, name: "Græsk Super League" },
  { key: "soccer_norway_eliteserien", leagueId: 103, name: "Eliteserien" },
  { key: "soccer_sweden_allsvenskan", leagueId: 113, name: "Allsvenskan" },
  { key: "soccer_poland_ekstraklasa", leagueId: 106, name: "Ekstraklasa" },
  { key: "soccer_denmark_first_division", leagueId: 120, name: "1. division" },
];

/** Bookmakers kept (API-Football id → key), so the snapshot table grows by a handful of prices per match, not dozens. */
export const AF_BOOKMAKERS: Record<number, string> = { 8: "bet365", 16: "unibet", 4: "pinnacle", 6: "bwin", 3: "betfair", 7: "williamhill" };

interface RawLeague {
  league: { id: number; name: string };
  seasons: { year: number; current: boolean }[];
}
export interface RawAfFixture {
  fixture: { id: number; timestamp: number; status: { short: string } };
  league: { id: number; season: number };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  score?: { fulltime?: { home: number | null; away: number | null } };
}
export interface RawAfOdds {
  fixture: { id: number };
  update: string;
  bookmakers: { id: number; name: string; bets: { id: number; name: string; values: { value: string; odd: string }[] }[] }[];
}

const FINISHED = new Set(["FT", "AET", "PEN"]);
const OVER_UNDER = /^(Over|Under) 2\.5$/;

/** Match Winner → 1X2 and Goals Over/Under 2.5 → OU25, for the kept bookmakers. */
export function normalizeAfOdds(raw: RawAfOdds): FeedPrice[] {
  const lastUpdate = Date.parse(raw.update);
  return raw.bookmakers.flatMap((b) => {
    const key = AF_BOOKMAKERS[b.id];
    if (!key) return [];
    return b.bets.flatMap((bet) =>
      bet.values.flatMap((v): FeedPrice[] => {
        const odds = parseFloat(v.odd);
        if (!(odds > 1)) return [];
        const base = { bookmakerKey: key, bookmakerName: b.name, lastUpdate: Number.isNaN(lastUpdate) ? 0 : lastUpdate, odds };
        if (bet.name === "Match Winner") {
          const selection = { Home: "home", Draw: "draw", Away: "away" }[v.value];
          return selection ? [{ ...base, market: "1X2", selection }] : [];
        }
        if (bet.name === "Goals Over/Under" && OVER_UNDER.test(v.value)) return [{ ...base, market: "OU25", selection: v.value.startsWith("Over") ? "over" : "under" }];
        return [];
      }),
    );
  });
}

/** 1X2 and totals settle on the score after 90 minutes, so extra time and penalties are left out. */
export function normalizeAfResult(f: RawAfFixture, competitionKey: string): FeedResult {
  const ft = f.score?.fulltime;
  const pick = (x: number | null | undefined, y: number | null) => (x === undefined || x === null ? y : x);
  return {
    externalId: String(f.fixture.id),
    competitionKey,
    kickoff: f.fixture.timestamp * 1000,
    completed: FINISHED.has(f.fixture.status.short),
    home: f.teams.home.name,
    away: f.teams.away.name,
    homeScore: pick(ft?.home, f.goals.home),
    awayScore: pick(ft?.away, f.goals.away),
  };
}

/** Current seasons change once a year; one lookup per competition a day is plenty (kept while the server instance lives). */
const SEASON_TTL_MS = DAY;
const seasonCache = new Map<number, { season: number | null; at: number }>();

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export class ApiFootballOddsFeed implements OddsFeed {
  readonly provider = API_FOOTBALL_ODDS;
  readonly providerName = "API-Football";
  /** Current season per competition key, filled by competitions(); also used by the statistics run. */
  readonly seasons = new Map<string, number>();
  private readonly fixtures = new Map<string, RawAfFixture[]>();

  constructor(private readonly opts: { apiKey: string; keys: string[]; fetchImpl?: typeof fetch; now?: () => number; wait?: (ms: number) => Promise<void> }) {}

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  private async get<T>(path: string, params: Record<string, string | number>): Promise<FeedResponse<T[]> & { pages: number }> {
    const { body, headers } = await apiFootballGet<T>(path, params, this.opts);
    const n = (k: string) => {
      const v = headers.get(k);
      return v === null || v === "" ? null : Number(v);
    };
    const remaining = n("x-ratelimit-requests-remaining");
    const limit = n("x-ratelimit-requests-limit");
    return { data: body.response ?? [], quota: { used: remaining !== null && limit !== null ? limit - remaining : null, remaining, last: 1 }, pages: body.paging?.total ?? 1 };
  }

  private league(key: string) {
    const c = AF_COMPETITIONS.find((x) => x.key === key);
    if (!c) throw new Error(`No API-Football league for ${key}.`);
    return c;
  }

  /** The configured competitions that have a current season; one request each. */
  async competitions(): Promise<FeedResponse<FeedCompetition[]>> {
    const out: FeedCompetition[] = [];
    let quota: FeedQuota = { used: null, remaining: null, last: null };
    for (const key of this.opts.keys) {
      const c = AF_COMPETITIONS.find((x) => x.key === key);
      if (!c) continue;
      const hit = seasonCache.get(c.leagueId);
      let season: number | null | undefined = hit && this.now() - hit.at < SEASON_TTL_MS ? hit.season : undefined;
      if (season === undefined) {
        const r = await this.get<RawLeague>("/leagues", { id: c.leagueId, current: "true" });
        quota = r.quota;
        season = r.data[0]?.seasons.find((s) => s.current)?.year ?? null;
        seasonCache.set(c.leagueId, { season, at: this.now() });
      }
      if (season === null) continue;
      this.seasons.set(key, season);
      out.push({ key, sportId: "football", name: c.name, group: "Soccer", active: true });
    }
    return { data: out, quota };
  }

  private async scheduled(key: string): Promise<{ data: RawAfFixture[]; quota: FeedQuota | null }> {
    const cached = this.fixtures.get(key);
    if (cached) return { data: cached, quota: null };
    const now = this.now();
    const r = await this.get<RawAfFixture>("/fixtures", { league: this.league(key).leagueId, season: this.seasons.get(key) ?? new Date(now).getUTCFullYear(), from: isoDay(now), to: isoDay(now + 3 * DAY) });
    const data = r.data.filter((f) => ["NS", "TBD"].includes(f.fixture.status.short) && f.fixture.timestamp * 1000 > now);
    this.fixtures.set(key, data);
    return { data, quota: r.quota };
  }

  async upcoming(key: string): Promise<FeedResponse<number[]>> {
    const r = await this.scheduled(key);
    return { data: r.data.map((f) => f.fixture.timestamp * 1000), quota: r.quota ?? { used: null, remaining: null, last: 0 } };
  }

  /** Prices for the scheduled matches of the next two days: one request per day and page of ten matches. */
  async odds(key: string): Promise<FeedResponse<FeedEvent[]>> {
    const s = await this.scheduled(key);
    let quota = s.quota ?? { used: null, remaining: null, last: 0 };
    const now = this.now();
    const soon = s.data.filter((f) => f.fixture.timestamp * 1000 <= now + 2 * DAY);
    const byId = new Map(soon.map((f) => [f.fixture.id, f]));
    const days = [...new Set(soon.map((f) => isoDay(f.fixture.timestamp * 1000)))];
    const events: FeedEvent[] = [];
    for (const date of days) {
      for (let page = 1, total = 1; page <= total && page <= 5; page++) {
        const r = await this.get<RawAfOdds>("/odds", { league: this.league(key).leagueId, season: this.seasons.get(key) ?? soon[0].league.season, date, page });
        quota = r.quota;
        total = r.pages;
        for (const o of r.data) {
          const f = byId.get(o.fixture.id);
          if (!f) continue;
          const prices = normalizeAfOdds(o);
          if (prices.length) events.push({ externalId: String(f.fixture.id), competitionKey: key, kickoff: f.fixture.timestamp * 1000, home: f.teams.home.name, away: f.teams.away.name, prices });
        }
      }
    }
    return { data: events, quota };
  }

  async results(key: string, daysFrom: number): Promise<FeedResponse<FeedResult[]>> {
    const now = this.now();
    const r = await this.get<RawAfFixture>("/fixtures", { league: this.league(key).leagueId, season: this.seasons.get(key) ?? new Date(now).getUTCFullYear(), from: isoDay(now - daysFrom * DAY), to: isoDay(now) });
    return { data: r.data.map((f) => normalizeAfResult(f, key)), quota: r.quota };
  }
}
