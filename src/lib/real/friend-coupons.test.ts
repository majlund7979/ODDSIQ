import { describe, expect, it } from "vitest";
import { couponResult, leagueTable, type FriendBet } from "@/lib/friends";
import { couponTotals } from "./friend-coupons";

describe("couponResult", () => {
  it("loses on the first lost leg, wins only when all won", () => {
    expect(couponResult([{ result: "won" }, { result: "lost" }, { result: null }])).toBe("lost");
    expect(couponResult([{ result: "won" }, { result: null }])).toBeNull();
    expect(couponResult([{ result: "won" }, { result: "won" }])).toBe("won");
    expect(couponResult([])).toBeNull();
  });
});

describe("couponTotals", () => {
  it("multiplies chance and odds", () => {
    const t = couponTotals([{ probability: 0.8, odds: 1.25 }, { probability: 0.5, odds: 2 }]);
    expect(t.probability).toBeCloseTo(0.4);
    expect(t.odds).toBeCloseTo(2.5);
  });
  it("has no odds when a leg has none", () => {
    expect(couponTotals([{ probability: 0.8, odds: 1.25 }, { probability: 0.6, odds: null }]).odds).toBeNull();
  });
});

describe("league table", () => {
  it("counts a coupon as one bet", () => {
    const base = { userId: "u", name: "Ole", kickoff: 0, league: "", match: "", outcome: "", probability: 0.4 };
    const bets: FriendBet[] = [
      { ...base, id: "1", category: "bedste", odds: 2, stake: 100, result: "won" },
      { ...base, id: "k1", category: "kupon", odds: 3, stake: 50, result: "lost", legs: [] },
    ];
    const [row] = leagueTable(bets);
    expect(row.bets).toBe(2);
    expect(row.won).toBe(1);
    expect(row.profit).toBe(100 - 50);
  });
});
