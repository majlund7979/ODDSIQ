import { describe, expect, it } from "vitest";
import { ApiFootballFeed, normalizeFixtures, normalizeInjuries, normalizeLineups, normalizeStatistics, seasonFor, type RawFixture } from "./api-football";
import { statsConfig, STATS_DEFAULT_BUDGET } from "./config";
import { effectiveBudget, PAID_PLAN_BUDGET } from "./ingest";
import data from "./fixtures/api-football.json";
import { StatsFixtureFeed } from "./fixture-feed";
import { teamNews, xgForm, type StoredFixture } from "./news";
import { dataQuality } from "@/lib/metrics/quality";

const [ars, liv] = normalizeFixtures(data.fixtures as RawFixture[]);
const KO = ars.kickoff;
const H = 3_600_000;

describe("API-Football adapter", () => {
  it("normalizes fixtures, status and goals", () => {
    expect(ars).toMatchObject({ id: "1208001", leagueId: 39, home: "Arsenal", away: "Chelsea", status: "finished", homeGoals: 2, awayGoals: 1 });
    expect(new Date(ars.kickoff).toISOString()).toBe("2026-10-03T14:00:00.000Z");
    expect(liv.status).toBe("scheduled");
  });

  it("maps lineups, absences and xG to sides", () => {
    const l = normalizeLineups(data.lineups["1208001"] as never, ars);
    expect(l.map((x) => [x.side, x.formation, x.startXI.length])).toEqual([["home", "4-3-3", 11], ["away", "4-2-3-1", 11]]);
    const i = normalizeInjuries(data.injuries["1208001"] as never, ars);
    expect(i.map((x) => [x.side, x.status])).toEqual([["home", "out"], ["away", "doubtful"], ["away", "out"]]);
    const s = normalizeStatistics(data.statistics["1208001"] as never, ars);
    expect(s).toEqual([
      { side: "home", team: "Arsenal", xg: 1.84, shots: 15, shotsOnTarget: 6, possession: 0.58 },
      { side: "away", team: "Chelsea", xg: 0.97, shots: 9, shotsOnTarget: 3, possession: 0.42 },
    ]);
  });

  it("drops injuries listed for another fixture and missing xG stays null", () => {
    expect(normalizeInjuries(data.injuries["1208001"] as never, liv)).toEqual([]);
    const noXg = normalizeStatistics([{ team: { id: 1, name: "Arsenal" }, statistics: [{ type: "Total Shots", value: 4 }] }], ars);
    expect(noXg[0].xg).toBeNull();
  });

  it("names seasons by their starting year", () => {
    expect(seasonFor(Date.parse("2026-10-03T00:00:00Z"))).toBe(2026);
    expect(seasonFor(Date.parse("2027-03-01T00:00:00Z"))).toBe(2026);
  });

  it("sends the key, reads the quota and surfaces plan errors", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fake = (body: unknown) =>
      (async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        return new Response(JSON.stringify(body), { headers: { "x-ratelimit-requests-remaining": "97", "x-ratelimit-requests-limit": "100" } });
      }) as unknown as typeof fetch;
    const ok = new ApiFootballFeed({ apiKey: "k", fetchImpl: fake({ errors: [], results: 2, response: data.fixtures }) });
    const r = await ok.fixtures(39, 2026, "2026-10-02", "2026-10-06");
    expect(r.quota).toEqual({ remaining: 97, limit: 100 });
    expect(r.data).toHaveLength(2);
    expect(calls[0][0]).toBe("https://v3.football.api-sports.io/fixtures?league=39&season=2026&from=2026-10-02&to=2026-10-06");
    expect((calls[0][1]?.headers as Record<string, string>)["x-apisports-key"]).toBe("k");
    const denied = new ApiFootballFeed({ apiKey: "k", fetchImpl: fake({ errors: { plan: "Free plans do not have access to this season." }, results: 0, response: [] }) });
    await expect(denied.fixtures(39, 2026, "a", "b")).rejects.toThrow("Free plans do not have access to this season.");
  });
});

describe("statistics fixture feed", () => {
  it("releases lineups an hour before kickoff and statistics after full time", async () => {
    const early = new StatsFixtureFeed(KO - 2 * H);
    const [f] = (await early.fixtures(39)).data;
    expect(f.status).toBe("scheduled");
    expect((await early.lineups(f)).data).toEqual([]);
    const later = new StatsFixtureFeed(KO - H);
    expect((await later.lineups(f)).data).toHaveLength(2);
    const after = new StatsFixtureFeed(KO + 3 * H);
    const [done] = (await after.fixtures(39)).data;
    expect(done.status).toBe("finished");
    expect((await after.statistics(done)).data[0].xg).toBe(1.84);
  });
});

describe("team news", () => {
  const fx = (home: string, away: string, day: number, hx: number | null, ax: number | null): StoredFixture => ({
    provider: "api-football",
    kickoff: new Date(KO - day * 24 * H),
    home,
    away,
    homeXg: hx,
    awayXg: ax,
    syncedAt: new Date(KO),
    lineupsAt: null,
    injuriesAt: null,
    lineups: [],
    injuries: [],
  });
  const history = [fx("Arsenal", "Everton", 7, 2.0, 0.5), fx("Leeds United", "Arsenal", 14, 1.0, 1.5), fx("Arsenal", "Fulham", 21, null, null), fx("Arsenal", "Burnley", -7, 3, 0)];

  it("averages xG for and against over past matches only", () => {
    expect(xgForm("Arsenal", history, KO)).toEqual({ n: 2, xgFor: 1.75, xgAgainst: 0.75 });
    expect(xgForm("Chelsea", history, KO)).toBeNull();
  });

  it("orders absences by side and exposes match xG", () => {
    const n = teamNews(
      {
        ...fx("Arsenal", "Chelsea", 0, 1.84, 0.97),
        injuriesAt: new Date(KO - 5 * H),
        injuries: [
          { side: "away", team: "Chelsea", player: "B", status: "out", reason: "Suspended" },
          { side: "home", team: "Arsenal", player: "A", status: "doubtful", reason: "Knock" },
        ],
      },
      history,
    );
    expect(n.injuries.map((i) => i.player)).toEqual(["A", "B"]);
    expect(n.xg).toEqual({ home: 1.84, away: 0.97 });
    expect(n.form.home?.n).toBe(2);
  });
});

describe("configuration and data quality", () => {
  it("fetches nothing without a key and caps requests per run", () => {
    expect(statsConfig({})).toEqual({ apiKey: null, budget: STATS_DEFAULT_BUDGET });
    expect(statsConfig({ STATS_API_KEY: "x", STATS_MAX_REQUESTS_PER_RUN: "5" })).toEqual({ apiKey: "x", budget: 5 });
    expect(statsConfig({ STATS_MAX_REQUESTS_PER_RUN: "-1" }).budget).toBe(STATS_DEFAULT_BUDGET);
  });

  it("scores confirmed lineups and fresh injury lists higher", () => {
    const base = { now: KO - 30 * 60_000, oddsUpdatedAt: KO - 31 * 60_000, hoursToKickoff: 0.5, sourceReliability: 0.9, booksQuoting: 4, booksTracked: 4 };
    const without = dataQuality(base);
    const withNews = dataQuality({ ...base, injuriesUpdatedAt: KO - 60 * 60_000, lineupConfirmedAt: KO - 45 * 60_000 });
    expect(without.lineup).toBe("Expected");
    expect(withNews.lineup).toBe("Confirmed");
    expect(withNews.injuries).toBe("Fresh");
    expect(withNews.score).toBeGreaterThan(without.score);
  });
});

describe("statistics request budget", () => {
  it("keeps the configured cap on the free plan and raises it on a paid plan", () => {
    expect(effectiveBudget(20, { remaining: null, limit: null })).toBe(20);
    expect(effectiveBudget(20, { remaining: 80, limit: 100 })).toBe(20);
    expect(effectiveBudget(20, { remaining: 7400, limit: 7500 })).toBe(PAID_PLAN_BUDGET);
    expect(effectiveBudget(500, { remaining: 7400, limit: 7500 })).toBe(500);
  });
});
