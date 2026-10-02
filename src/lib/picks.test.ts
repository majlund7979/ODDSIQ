import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import type { TeamNews } from "@/lib/stats/news";
import { absences, analysePick, dailyPicks, goalsProbability, MARKET_WEIGHT, outcomeLabel } from "./picks";

const now = Date.UTC(2026, 9, 2, 12);
const row = (o: Partial<MarketRow>): MarketRow =>
  ({ selectionId: "s", eventId: "e1", marketType: "1X2", side: "home", selection: "Arsenal", match: "Arsenal vs Chelsea", status: "scheduled", kickoff: now + 3_600_000, modelProbability: 0.5, marketProbability: 0.5, bestOdds: 2, ...o }) as MarketRow;
const news = (o: Partial<TeamNews>): TeamNews => ({ provider: "t", syncedAt: now, lineups: [], lineupsAt: null, injuries: [], injuriesAt: now, xg: null, form: { home: null, away: null }, ...o });
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

  it("skips matches without a forecast, already started, or beyond 24 hours", () => {
    const picks = dailyPicks(
      [row({ eventId: "e1", modelProbability: null }), row({ eventId: "e2", status: "live" }), row({ eventId: "e3", kickoff: now + 25 * 3_600_000 }), row({ eventId: "e4", kickoff: now - 1 })],
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
