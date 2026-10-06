import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import { dailyPicks } from "./picks";
import { coupons, goalsCoupon, rocketCoupon, ROCKET_MIN_CHANCE, doubleChancePicks, oddsCoupon, chanceCoupon, halfTime, scoreGrid, settle, summarise } from "./picks-extra";
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
    expect(p.best).toBeUndefined();
    // With a double chance market from the feed, its best price is shown, and the daily list leaves it out.
    const dc = { ...row("home", 0.85), selectionId: "dc", marketType: "DC", side: "1x", bestOdds: 1.3, bestBook: "bet365" } as MarketRow;
    const [q] = doubleChancePicks([row("home", 0.5), row("draw", 0.3), row("away", 0.2), dc], now, 5, () => null);
    expect(q.best).toEqual({ odds: 1.3, book: "bet365" });
    expect(dailyPicks([dc], now, 5).length).toBe(0);
  });

  it("builds the 2-bet coupon with combined odds of at least 2.0", () => {
    const pk = (id: string, p: number, o: number) => ({ probability: p, row: { bestOdds: o, eventId: id } }) as Pick;
    const pool = [pk("a", 0.85, 1.2), pk("b", 0.8, 1.25), pk("c", 0.7, 1.5), pk("d", 0.62, 1.7), pk("e", 0.5, 2.1)];
    const two = oddsCoupon(pool)!;
    // a + b (1.2 × 1.25 = 1.5) is too low; the likeliest pair reaching 2.0 is a + d (1.2 × 1.7 = 2.04, 0.527).
    expect(two.picks.map((p) => p.row.eventId)).toEqual(["a", "d"]);
    expect(two.odds).toBeCloseTo(2.04);
    expect(two.probability).toBeCloseTo(0.527);
    expect(two.kind).toBe("odds");
  });

  it("builds the 3-bet coupon from the likeliest bet per match, never value first", () => {
    const pk = (id: string, p: number, o: number) => ({ probability: p, row: { bestOdds: o, eventId: id } }) as Pick;
    // c, d and e pay more than their chance is worth, but a, b and c are likelier: the coupon takes those.
    const pool = [pk("a", 0.85, 1.1), pk("a", 0.84, 1.15), pk("b", 0.8, 1.2), pk("c", 0.7, 1.5), pk("d", 0.6, 1.8), pk("e", 0.45, 2.4)];
    const three = chanceCoupon(pool)!;
    expect(three.kind).toBe("chance");
    expect(three.picks.map((p) => [p.row.eventId, p.probability])).toEqual([["a", 0.85], ["b", 0.8], ["c", 0.7]]);
    expect(chanceCoupon(pool.slice(0, 3))).toBeNull();
  });

  it("leaves out a coupon nothing can fill, and never repeats a match", () => {
    const pk = (id: string, p: number, o: number) => ({ probability: p, row: { bestOdds: o, eventId: id } }) as Pick;
    expect(coupons([pk("a", 0.9, 1.1), pk("b", 0.9, 1.1)])).toEqual([]);
    expect(coupons([pk("a", 0.6, 1.6), pk("a", 0.5, 1.9)])).toEqual([]);
  });

  it("never puts the same match on both coupons", () => {
    const pk = (id: string, p: number, o: number) => ({ probability: p, row: { bestOdds: o, eventId: id } }) as Pick;
    const pool = [pk("a", 0.85, 1.2), pk("b", 0.8, 1.25), pk("c", 0.7, 1.5), pk("d", 0.62, 1.7), pk("e", 0.5, 2.1), pk("f", 0.55, 1.9)];
    const [two, three] = coupons(pool);
    expect(two.picks.map((p) => p.row.eventId)).toEqual(["a", "d"]);
    expect(three.picks.map((p) => p.row.eventId)).toEqual(["b", "c", "f"]);
    // With too few matches left after the 2-bet coupon, the 3-bet coupon is left out.
    expect(coupons(pool.slice(0, 4)).map((c) => c.kind)).toEqual(["odds", "rocket"]);
  });

  it("builds Raketten from the likeliest bet per match, all at 65 % or more", () => {
    const pk = (id: string, p: number, o: number) => ({ probability: p, row: { bestOdds: o, eventId: id, marketType: "1X2", side: "home" } }) as Pick;
    const pool = [pk("a", 0.85, 1.15), pk("a", 0.7, 1.4), pk("b", 0.8, 1.25), pk("c", 0.66, 1.5), pk("d", 0.64, 1.6)];
    const r = rocketCoupon(pool)!;
    expect(r.kind).toBe("rocket");
    expect(r.picks.map((p) => [p.row.eventId, p.row.bestOdds])).toEqual([["a", 1.15], ["b", 1.25], ["c", 1.5]]);
    expect(r.picks.every((p) => p.probability >= ROCKET_MIN_CHANCE)).toBe(true);
    expect(rocketCoupon(pool.slice(0, 3))).toBeNull();
  });

  it("builds Dagens over 1,5 mål from the likeliest over 1,5, one per match", () => {
    const pk = (id: string, p: number, side = "over", type = "OU15") => ({ probability: p, row: { bestOdds: 1.3, eventId: id, marketType: type, side } }) as Pick;
    const pool = [pk("a", 0.85), pk("a", 0.8), pk("b", 0.82), pk("c", 0.4, "under"), pk("d", 0.9, "over", "OU25"), pk("e", 0.75), pk("f", 0.7)];
    expect(goalsCoupon(pool)!.picks.map((p) => p.row.eventId)).toEqual(["a", "b", "e"]);
    expect(goalsCoupon(pool.slice(0, 4))).toBeNull();
  });

  it("builds the 2-bet coupon from the likeliest pair reaching 2.0, value or not", () => {
    const pk = (id: string, p: number, o: number) => ({ probability: p, row: { bestOdds: o, eventId: id } }) as Pick;
    // a and b are the likeliest pair over 2.0 though neither is a value bet; c and d would be.
    const pool = [pk("a", 0.75, 1.3), pk("b", 0.62, 1.6), pk("c", 0.61, 1.7), pk("d", 0.6, 1.8)];
    const [two] = coupons(pool);
    expect(two.picks.map((p) => p.row.eventId)).toEqual(["a", "b"]);
  });

});
