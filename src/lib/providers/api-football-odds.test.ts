import { describe, expect, it } from "vitest";
import { AF_COMPETITIONS, ApiFootballOddsFeed, normalizeAfOdds, normalizeAfResult, type RawAfFixture, type RawAfOdds } from "./api-football-odds";
import { afOddsConfig } from "./config";
import { STATS_LEAGUES } from "@/lib/stats/leagues";

const NOW = Date.parse("2026-10-09T10:00:00Z");
const fixture = (id: number, at: string, status = "NS"): RawAfFixture => ({
  fixture: { id, timestamp: Date.parse(at) / 1000, status: { short: status } },
  league: { id: 5, season: 2026 },
  teams: { home: { name: "Denmark" }, away: { name: "Scotland" } },
  goals: { home: null, away: null },
});
const odds = (id: number): RawAfOdds => ({
  fixture: { id },
  update: "2026-10-09T08:00:00+00:00",
  bookmakers: [
    {
      id: 8,
      name: "Bet365",
      bets: [
        { id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }, { value: "Draw", odd: "3.60" }, { value: "Away", odd: "4.75" }] },
        { id: 5, name: "Goals Over/Under", values: [{ value: "Over 1.5", odd: "1.30" }, { value: "Over 2.5", odd: "2.05" }, { value: "Under 2.5", odd: "1.75" }] },
        { id: 8, name: "Both Teams Score", values: [{ value: "Yes", odd: "1.90" }, { value: "No", odd: "1.85" }] },
        { id: 12, name: "Double Chance", values: [{ value: "Home/Draw", odd: "1.22" }, { value: "Home/Away", odd: "1.30" }, { value: "Draw/Away", odd: "2.10" }] },
        { id: 10, name: "Exact Score", values: [{ value: "1:0", odd: "7.00" }] },
      ],
    },
    { id: 99, name: "Unknown book", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.9" }] }] },
  ],
});

describe("API-Football odds", () => {
  it("keeps 1X2, over/under 1.5 and 2.5, both teams score and double chance from the kept bookmakers", () => {
    const p = normalizeAfOdds(odds(1));
    expect(p.map((x) => `${x.bookmakerKey} ${x.market} ${x.selection} ${x.odds}`)).toEqual([
      "bet365 1X2 home 1.8",
      "bet365 1X2 draw 3.6",
      "bet365 1X2 away 4.75",
      "bet365 OU15 over 1.3",
      "bet365 OU25 over 2.05",
      "bet365 OU25 under 1.75",
      "bet365 BTTS yes 1.9",
      "bet365 BTTS no 1.85",
      "bet365 DC 1x 1.22",
      "bet365 DC 12 1.3",
      "bet365 DC x2 2.1",
    ]);
    expect(p[0].lastUpdate).toBe(Date.parse("2026-10-09T08:00:00Z"));
  });

  it("settles on the score after 90 minutes", () => {
    const f = { ...fixture(2, "2026-10-08T18:45:00Z", "AET"), goals: { home: 2, away: 1 }, score: { fulltime: { home: 1, away: 1 } } };
    expect(normalizeAfResult(f, "soccer_uefa_nations_league")).toMatchObject({ externalId: "2", completed: true, homeScore: 1, awayScore: 1 });
  });

  it("reads the current season, upcoming kickoffs and prices", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      const path = new URL(url).pathname;
      const body =
        path === "/leagues"
          ? { errors: [], response: [{ league: { id: 5, name: "Nations League" }, seasons: [{ year: 2026, current: true }] }] }
          : path === "/fixtures"
            ? { errors: [], response: [fixture(10, "2026-10-09T18:45:00Z"), fixture(11, "2026-10-11T16:00:00Z"), fixture(12, "2026-10-08T18:45:00Z", "FT")] }
            : { errors: [], response: [odds(10)], paging: { current: 1, total: 1 } };
      return new Response(JSON.stringify(body), { headers: { "x-ratelimit-requests-remaining": "7400", "x-ratelimit-requests-limit": "7500" } });
    }) as unknown as typeof fetch;
    const feed = new ApiFootballOddsFeed({ apiKey: "k", keys: ["soccer_uefa_nations_league", "not_a_league"], fetchImpl: fake, now: () => NOW });
    const comps = await feed.competitions();
    expect(comps.data.map((c) => c.key)).toEqual(["soccer_uefa_nations_league"]);
    expect(comps.quota).toEqual({ used: 100, remaining: 7400, last: 1 });
    expect(feed.seasons.get("soccer_uefa_nations_league")).toBe(2026);
    expect((await feed.upcoming("soccer_uefa_nations_league")).data).toEqual([Date.parse("2026-10-09T18:45:00Z"), Date.parse("2026-10-11T16:00:00Z")]);
    const ev = (await feed.odds("soccer_uefa_nations_league")).data;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ externalId: "10", home: "Denmark", away: "Scotland", kickoff: Date.parse("2026-10-09T18:45:00Z") });
    // One fixtures call is shared by upcoming() and odds(); the 11 Oct match is outside two days.
    expect(urls.filter((u) => u.includes("/fixtures"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/odds"))).toEqual(["https://v3.football.api-sports.io/odds?league=5&season=2026&date=2026-10-09&page=1"]);
  });

  it("leaves out leagues The Odds API already covers and turns off on request", () => {
    const keys = afOddsConfig({ STATS_API_KEY: "k", ODDS_API_KEY: "o", ODDS_SPORTS: "soccer_epl,soccer_efl_champ" }).keys;
    expect(keys).not.toContain("soccer_efl_champ");
    expect(keys).toContain("soccer_uefa_nations_league");
    expect(afOddsConfig({ STATS_API_KEY: "k", STATS_ODDS: "off" }).enabled).toBe(false);
    expect(afOddsConfig({}).enabled).toBe(false);
  });

  it("maps every competition to its statistics league", () => {
    for (const c of AF_COMPETITIONS) expect(STATS_LEAGUES[c.key]).toBe(c.leagueId);
    expect(new Set(AF_COMPETITIONS.map((c) => c.key)).size).toBe(AF_COMPETITIONS.length);
  });
});

describe("API-Football per-minute limit", () => {
  it("waits and retries when the minute's requests are used up", async () => {
    let calls = 0;
    const waits: number[] = [];
    const fake = (async () => {
      calls++;
      const body = calls < 3 ? { errors: { rateLimit: "Too many requests. You have exceeded the limit of requests per minute of your subscription." }, response: [] } : { errors: [], response: [{ league: { id: 3, name: "Europa League" }, seasons: [{ year: 2026, current: true }] }] };
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    const feed = new ApiFootballOddsFeed({ apiKey: "k", keys: ["soccer_uefa_europa_league"], fetchImpl: fake, now: () => NOW, wait: async (ms) => void waits.push(ms) });
    expect((await feed.competitions()).data.map((c) => c.key)).toEqual(["soccer_uefa_europa_league"]);
    expect(calls).toBe(3);
    expect(waits).toEqual([8_000, 16_000]);
  });
});
