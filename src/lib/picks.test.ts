import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import type { TeamNews } from "@/lib/stats/news";
import { absences, analysePick, bothScore, countPicks, couponCandidates, dailyPicks, isNationalTeams, marketPicks, goalsProbability, headToHead, MARKET_WEIGHT, outcomeLabel, recentForm, strengthOf } from "./picks";

const now = Date.UTC(2026, 9, 2, 12);
const row = (o: Partial<MarketRow>): MarketRow =>
  ({ selectionId: "s", eventId: "e1", sportId: "football", movement: 0, marketType: "1X2", side: "home", selection: "Arsenal", match: "Arsenal vs Chelsea", status: "scheduled", kickoff: now + 3_600_000, modelProbability: 0.5, marketProbability: 0.5, bestOdds: 2, ...o }) as MarketRow;
const news = (o: Partial<TeamNews>): TeamNews => ({ provider: "t", syncedAt: now, lineups: [], lineupsAt: null, injuries: [], injuriesAt: now, xg: null, form: { home: null, away: null }, referee: null, ...o });
const ctx = (n: TeamNews | null) => ({ expectedGoals: { home: 1.6, away: 1.1 }, news: n });

describe("dailyPicks", () => {
  it("keeps the most likely outcome per match and ranks matches by it", () => {
    const picks = dailyPicks(
      [
        row({ selectionId: "a", eventId: "e1", modelProbability: 0.55, marketProbability: 0.55 }),
        row({ selectionId: "b", eventId: "e1", marketType: "OU25", side: "over", modelProbability: 0.62, marketProbability: 0.62 }),
        row({ selectionId: "c", eventId: "e2", modelProbability: 0.7, marketProbability: 0.7 }),
        row({ selectionId: "d", eventId: "e3", modelProbability: 0.4, marketProbability: 0.4 }),
      ],
      now,
      2,
    );
    expect(picks.map((p) => p.row.selectionId)).toEqual(["c", "b"]);
  });

  it("falls back to the bookmakers' price alone where the league has no results history", () => {
    const [p] = dailyPicks([row({ modelProbability: null, marketProbability: 0.6, bestOdds: 1.8 })], now, 5);
    expect(p.marketOnly).toBe(true);
    expect(p.probability).toBeCloseTo(0.6);
    expect(p.value).toBe(false);
    expect(p.factors.map((f) => f.label)).toEqual(["Bookmakerne"]);
  });

  it("skips matches without any price, already started, or beyond 24 hours", () => {
    const picks = dailyPicks(
      [row({ eventId: "e1", modelProbability: null, marketProbability: Number.NaN }), row({ eventId: "e2", status: "live" }), row({ eventId: "e3", kickoff: now + 25 * 3_600_000 }), row({ eventId: "e4", kickoff: now - 1 })],
      now,
      10,
    );
    expect(picks).toEqual([]);
  });

  it("blends the model with the bookmakers' margin-free price", () => {
    const [p] = dailyPicks([row({ modelProbability: 0.7, marketProbability: 0.5, bestOdds: 1.9 })], now, 5);
    expect(p.probability).toBeCloseTo((1 - MARKET_WEIGHT) * 0.7 + MARKET_WEIGHT * 0.5);
    expect(p.value).toBe(true);
    expect(p.fairOdds).toBeCloseTo(1 / p.probability);
  });

  it("labels outcomes in Danish", () => {
    expect(outcomeLabel(row({}))).toBe("Arsenal vinder");
    expect(outcomeLabel(row({ side: "draw" }))).toBe("Uafgjort");
    expect(outcomeLabel(row({ marketType: "OU25", side: "under" }))).toBe("Under 2,5 mål");
    expect(outcomeLabel(row({ marketType: "BTTS", side: "yes" }))).toBe("Begge hold scorer");
  });
});

describe("team news and form", () => {
  it("prices goal markets with a Poisson model", () => {
    const h = goalsProbability("1X2", "home", 1.6, 1.1)!;
    const d = goalsProbability("1X2", "draw", 1.6, 1.1)!;
    const a = goalsProbability("1X2", "away", 1.6, 1.1)!;
    expect(h + d + a).toBeCloseTo(1, 4);
    expect(h).toBeGreaterThan(a);
    expect(goalsProbability("ML", "home", 1, 1)).toBeNull();
  });

  it("lowers a team's chance when its players are out, but not for a player in the confirmed XI", () => {
    const injuries = [
      { side: "home" as const, team: "Arsenal", player: "Saka", status: "out" as const, reason: "Injury" },
      { side: "home" as const, team: "Arsenal", player: "Rice", status: "doubtful" as const, reason: "Knock" },
    ];
    expect(absences(news({ injuries })).home.weight).toBe(1.5);
    const lineups = [{ side: "home" as const, team: "Arsenal", formation: null, coach: null, startXI: [{ name: "Rice", number: 41, pos: "M" }], substitutes: [] }];
    expect(absences(news({ injuries, lineups })).home.weight).toBe(1);

    const base = analysePick(row({}), ctx(news({})))!;
    const hurt = analysePick(row({}), ctx(news({ injuries })))!;
    expect(hurt.probability).toBeLessThan(base.probability);
    expect(hurt.factors.find((f) => f.label === "Skader og karantæner")!.detail).toContain("Arsenal mangler 2");
  });

  it("moves expected goals toward recent xG form", () => {
    const form = { home: { n: 5, xgFor: 2.4, xgAgainst: 0.7 }, away: { n: 5, xgFor: 0.8, xgAgainst: 2.0 } };
    const base = analysePick(row({}), ctx(news({})))!;
    const strong = analysePick(row({}), ctx(news({ form })))!;
    expect(strong.probability).toBeGreaterThan(base.probability);
    const few = analysePick(row({}), ctx(news({ form: { home: { ...form.home, n: 2 }, away: form.away } })))!;
    expect(few.probability).toBeCloseTo(base.probability);
  });
});

describe("match facts", () => {
  const m = (home: string, away: string, hg: number, ag: number, d: number) => ({ league: "x", season: "s", date: d, home, away, hg, ag });
  const history = [m("Arsenal", "Chelsea", 2, 0, 1), m("Chelsea", "Arsenal", 1, 1, 2), m("Arsenal", "Spurs", 0, 1, 3), m("Leeds", "Chelsea", 0, 3, 4)];

  it("lists a team's latest results newest first", () => {
    expect(recentForm("Arsenal", history).map((g) => `${g.result}${g.score}`)).toEqual(["T0-1", "U1-1", "V2-0"]);
  });

  it("counts head-to-head from today's home team", () => {
    expect(headToHead("Chelsea", "Arsenal", history)).toMatchObject({ home: 0, draw: 1, away: 1 });
    expect(headToHead("Leeds", "Spurs", history)).toBeNull();
  });

  it("only picks football and names the strength", () => {
    expect(dailyPicks([row({ sportId: "tennis" })], now, 5)).toEqual([]);
    expect(strengthOf(0.8)).toBe("Meget stærk");
    expect(strengthOf(0.5)).toBe("Middel");
  });
});

describe("bet types", () => {
  it("keeps one market when split by type", () => {
    const rows = [row({ selectionId: "a", modelProbability: 0.7, marketProbability: 0.7, marketType: "OU25", side: "over" }), row({ selectionId: "b", modelProbability: 0.5 })];
    expect(marketPicks(rows, now, 5, "1X2").map((p) => p.row.selectionId)).toEqual(["b"]);
  });

  it("ranks corner suggestions likeliest first", () => {
    const f = (probability: number, vsLeague: number) => ({ suggestion: { side: "over", line: 8.5, probability, vsLeague } }) as never;
    // e1 is further from the league average, but e2 goes home more often.
    const ctx = (id: string) => ({ expectedGoals: { home: 1, away: 1 }, news: null, counts: { corners: id === "e1" ? f(0.68, 0.3) : f(0.74, 0.05) } });
    const picks = countPicks([row({ eventId: "e1" }), row({ eventId: "e2" })], now, 5, "corners", ctx);
    expect(picks.map((p) => p.row.eventId)).toEqual(["e2", "e1"]);
    expect(picks[1].outcome).toBe("Over 8,5 hjørnespark");
  });
});

describe("begge hold scorer", () => {
  // Both teams scored in all five of their last matches, unless `blank` names a team that drew a blank in one.
  const history = (blank?: string) =>
    Array.from({ length: 6 }, (_, i) => [
      { league: "E0", season: "2026", date: i * 2, home: "Arsenal", away: `X${i}`, hg: blank === "Arsenal" && i === 5 ? 0 : 2, ag: 1 },
      { league: "E0", season: "2026", date: i * 2 + 1, home: `Y${i}`, away: "Chelsea", hg: 1, ag: blank === "Chelsea" && i === 4 ? 0 : 1 },
    ]).flat();
  const withTeams = (blank?: string) => () => ({ expectedGoals: { home: 1.6, away: 1.3 }, news: null, teams: { home: "Arsenal", away: "Chelsea", homeElo: 1500, awayElo: 1500, history: history(blank) } });
  const btts = row({ selectionId: "y", marketType: "BTTS", side: "yes", modelProbability: 0.66, marketProbability: 0.66, bestOdds: 1.7 });
  const win = row({ selectionId: "h", modelProbability: 0.5, marketProbability: 0.5, bestOdds: 2.1 });

  it("is only suggested when both teams scored in each of their last five matches", () => {
    expect(bothScore(withTeams()())).toMatchObject({ home: 5, away: 5, n: 5, every: true });
    expect(bothScore(withTeams("Chelsea")())).toMatchObject({ home: 5, away: 4, every: false });
    expect(dailyPicks([btts, win], now, 5, withTeams())[0].outcome).toBe("Begge hold scorer");
    expect(dailyPicks([btts, win], now, 5, withTeams("Arsenal"))[0].outcome).toBe("Arsenal vinder");
    // Without the teams' results (a market-only league) it is never suggested.
    expect(dailyPicks([btts, win], now, 5, () => ctx(null))[0].outcome).toBe("Arsenal vinder");
    expect(marketPicks([btts], now, 5, "BTTS", withTeams("Arsenal"))).toEqual([]);
  });

  it("gives way to over 2,5 mål at about the same odds when that goes home more often", () => {
    const over = row({ selectionId: "o", marketType: "OU25", side: "over", modelProbability: 0.68, marketProbability: 0.68, bestOdds: 1.6 });
    const o15 = row({ selectionId: "o15", marketType: "OU15", side: "over", modelProbability: 0.85, marketProbability: 0.85, bestOdds: 1.2 });
    // 68 % beats 66 %, and 1.6 is within 25 % of 1.7: the likelier bet wins, whatever it pays.
    const [p] = dailyPicks([btts, over, o15, win], now, 5, withTeams());
    expect(p.outcome).toBe("Over 2,5 mål");
    expect(p.goals!.map((g) => g.outcome)).toEqual(["Over 1,5 mål", "Over 2,5 mål", "Begge hold scorer"]);
    // On its own tab it stays, with the better bet named.
    const [b] = marketPicks([btts, over, win], now, 5, "BTTS", withTeams());
    expect(b.outcome).toBe("Begge hold scorer");
    expect(b.instead).toMatchObject({ outcome: "Over 2,5 mål", odds: 1.6 });
    // A less likely bet never replaces it, even when it pays more.
    expect(dailyPicks([btts, { ...over, bestOdds: 1.85, modelProbability: 0.62, marketProbability: 0.62 }], now, 5, withTeams())[0].outcome).toBe("Begge hold scorer");
  });

  it("lets over 1,5 mål onto the mixed list only from odds 1,40", () => {
    const o15 = row({ selectionId: "o15", marketType: "OU15", side: "over", modelProbability: 0.85, marketProbability: 0.85, bestOdds: 1.2 });
    expect(dailyPicks([o15, win], now, 5)[0].outcome).toBe("Arsenal vinder");
    expect(dailyPicks([{ ...o15, bestOdds: 1.4 }, win], now, 5)[0].outcome).toBe("Over 1,5 mål");
    expect(marketPicks([o15, win], now, 5, "OU15")[0].outcome).toBe("Over 1,5 mål");
    expect(goalsProbability("OU15", "over", 1.4, 1.1)).toBeCloseTo(1 - Math.exp(-2.5) * (1 + 2.5), 6);
  });
});

describe("couponCandidates", () => {
  it("offers every bet type per match, including double chance from our 1X2 chances", () => {
    const c = couponCandidates(
      [
        row({ selectionId: "h", side: "home", modelProbability: 0.5, marketProbability: 0.5, bestOdds: 2.1 }),
        row({ selectionId: "d", side: "draw", selection: "Draw", modelProbability: 0.25, marketProbability: 0.25, bestOdds: 3.6 }),
        row({ selectionId: "a", side: "away", selection: "Chelsea", modelProbability: 0.25, marketProbability: 0.25, bestOdds: 4 }),
        row({ selectionId: "o", marketType: "OU25", side: "over", modelProbability: 0.6, marketProbability: 0.6, bestOdds: 1.8 }),
        row({ selectionId: "x", marketType: "DC", side: "1x", modelProbability: null, marketProbability: 0.75, bestOdds: 1.4 }),
        row({ selectionId: "y", marketType: "BTTS", side: "yes", modelProbability: 0.7, marketProbability: 0.7, bestOdds: 1.6 }),
      ],
      now,
    );
    const dc = c.find((p) => p.row.marketType === "DC")!;
    expect(dc.outcome).toBe("Arsenal eller uafgjort");
    expect(dc.probability).toBeCloseTo(0.75);
    expect(dc.value).toBe(true);
    // Sorted by chance; begge hold scorer is left out without five scoring matches in a row for both teams.
    expect(c.map((p) => p.row.selectionId)).toEqual(["x", "o", "h", "d", "a"]);
  });
});

describe("landskampe", () => {
  const intl = "apf-soccer_international_friendlies";
  // Liechtenstein scored in `lie` and Gibraltar in `gib` of their last five matches.
  const history = (lie: number, gib: number) =>
    Array.from({ length: 5 }, (_, i) => [
      { league: "intl", season: "2026", date: i * 2, home: "Liechtenstein", away: `X${i}`, hg: i < lie ? 1 : 0, ag: 3 },
      { league: "intl", season: "2026", date: i * 2 + 1, home: `Y${i}`, away: "Gibraltar", hg: 3, ag: i < gib ? 1 : 0 },
    ]).flat();
  const teams = (lie: number, gib: number) => () => ({ expectedGoals: { home: 1.4, away: 1.2 }, news: null, teams: { home: "Liechtenstein", away: "Gibraltar", homeElo: 1100, awayElo: 1050, history: history(lie, gib) } });
  const over = row({ selectionId: "o", leagueId: intl, match: "Liechtenstein vs Gibraltar", marketType: "OU15", side: "over", modelProbability: 0.75, marketProbability: 0.55, bestOdds: 1.73 });
  const under = row({ selectionId: "u", leagueId: intl, match: "Liechtenstein vs Gibraltar", marketType: "OU15", side: "under", modelProbability: 0.25, marketProbability: 0.45, bestOdds: 2.1 });

  it("gives the bookmakers 75 % in national-team matches", () => {
    expect(isNationalTeams(intl)).toBe(true);
    expect(isNationalTeams("apf-soccer_epl")).toBe(false);
    const a = analysePick(over, teams(5, 5)())!;
    expect(a.probability).toBeCloseTo(0.25 * 0.75 + 0.75 * 0.55, 6);
  });

  it("drops over-bets when a team scored in fewer than 3 of its last 5", () => {
    expect(marketPicks([over, under], now, 5, "OU15", teams(1, 1)).map((p) => p.row.side)).toEqual(["under"]);
    expect(marketPicks([over, under], now, 5, "OU15", teams(3, 4)).map((p) => p.row.side)).toEqual(["over"]);
    expect(couponCandidates([over], now, teams(1, 1))).toEqual([]);
    // Club football keeps over-bets regardless.
    expect(marketPicks([{ ...over, leagueId: "apf-soccer_epl" }], now, 5, "OU15", teams(1, 1))).toHaveLength(1);
  });
});
