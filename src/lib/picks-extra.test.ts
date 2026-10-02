import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import { coupons, doubleChancePicks, halfTime, scoreGrid, settle, summarise } from "./picks-extra";
import type { Pick } from "./picks";

const none = { goals: null, ht: null, corners: null, cards: null, fouls: null };

describe("settling recorded picks", () => {
  it("settles goal, double chance, correct score, half-time and count bets", () => {
    const o = { goals: [2, 1] as [number, number], ht: [0, 0] as [number, number], corners: [6, 5] as [number, number], cards: [2, 1] as [number, number], fouls: null };
    expect(settle("1X2:home", o)).toBe("won");
    expect(settle("OU:over:2.5", o)).toBe("won");
    expect(settle("BTTS:no", o)).toBe("lost");
    expect(settle("DC:X2", o)).toBe("lost");
    expect(settle("DC:1X", o)).toBe("won");
    expect(settle("CS:2-1", o)).toBe("won");
    expect(settle("HT:over:0.5", o)).toBe("lost");
    expect(settle("COUNT:corners:over@9.5", o)).toBe("won");
    expect(settle("COUNT:cards:under@3.5", o)).toBe("won");
    expect(settle("COUNT:fouls:over@20.5", o)).toBeNull();
    expect(settle("1X2:home", none)).toBeNull();
  });

  it("summarises hit rate and profit on picks with odds", () => {
    const p = (result: "won" | "lost" | null, odds: number | null) => ({ day: "d", kickoff: 0, league: "", match: "", category: "bedste", outcome: "", probability: 0.6, odds, result });
    const s = summarise([p("won", 2), p("lost", 1.5), p("won", null), p(null, 2)]);
    expect(s).toMatchObject({ settled: 3, won: 2, withOdds: 2 });
    expect(s.profit).toBeCloseTo(0);
  });
});

describe("goal markets from expected goals", () => {
  it("lists scores likeliest first and sums to one", () => {
    const g = scoreGrid(1.6, 1.0);
    expect(g.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1, 4);
    expect(g[0].probability).toBeGreaterThanOrEqual(g[1].probability);
    expect(`${g[0].home}-${g[0].away}`).toBe("1-0");
  });

  it("scales first-half goals by the league's share", () => {
    const ht = halfTime(1.6, 1.0, { home: 0.45, away: 0.45 });
    expect(ht.expected.home).toBeCloseTo(0.72);
    expect(ht.home + ht.draw + ht.away).toBeCloseTo(1, 4);
    expect(ht.draw).toBeGreaterThan(ht.away);
  });

  it("picks the likeliest double chance from the 1X2 probabilities", () => {
    const now = Date.UTC(2026, 9, 2, 12);
    const row = (side: string, p: number) =>
      ({ selectionId: side, eventId: "e", sportId: "football", marketType: "1X2", side, selection: side, match: "Arsenal vs Chelsea", status: "scheduled", kickoff: now + 3_600_000, modelProbability: p, marketProbability: p, bestOdds: 2, movement: 0 }) as MarketRow;
    const [p] = doubleChancePicks([row("home", 0.5), row("draw", 0.3), row("away", 0.2)], now, 5, () => null);
    expect(p.outcome).toBe("Arsenal eller uafgjort");
    expect(p.probability).toBeCloseTo(0.8);
    expect(p.table.at(-1)!.probability).toBeCloseTo(0.5 / 0.7);
  });

  it("multiplies coupon chances and odds", () => {
    const pk = (p: number, o: number) => ({ probability: p, row: { bestOdds: o } }) as Pick;
    const [two, three] = coupons([pk(0.8, 1.3), pk(0.7, 1.5), pk(0.6, 1.8)]);
    expect(two.probability).toBeCloseTo(0.56);
    expect(two.odds).toBeCloseTo(1.95);
    expect(three.picks).toHaveLength(3);
  });
});
