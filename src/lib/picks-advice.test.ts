import { describe, expect, it } from "vitest";
import { leagueTable, monthStart, parseNumber, displayName, type FriendBet } from "./friends";
import { morningHtml, recipients } from "./morning";
import { oddsMove, riskOf, roundStake, stakeAdvice } from "./picks-advice";

describe("risk level", () => {
  it("is green from 70 %, yellow from 55 % and red below", () => {
    expect(riskOf(0.7).level).toBe("green");
    expect(riskOf(0.69).level).toBe("yellow");
    expect(riskOf(0.55).level).toBe("yellow");
    expect(riskOf(0.54).level).toBe("red");
  });
});

describe("stake suggestion", () => {
  it("stakes 3, 2 and 1 % by risk level", () => {
    expect(stakeAdvice(0.8, 1.4).share).toBe(0.03);
    expect(stakeAdvice(0.6, 1.8).share).toBe(0.02);
    expect(stakeAdvice(0.4, 3).share).toBe(0.01);
    expect(stakeAdvice(0.4, null).share).toBe(0.01);
  });
  it("halves the stake when the odds pay less than fair odds", () => {
    const s = stakeAdvice(0.8, 1.2);
    expect(s.share).toBe(0.015);
    expect(s.note).toContain("halv");
  });
  it("rounds to amounts people bet", () => {
    expect(roundStake(30)).toBe(30);
    expect(roundStake(17)).toBe(15);
    expect(roundStake(2)).toBe(5);
    expect(roundStake(147)).toBe(150);
  });
});

describe("odds movement", () => {
  it("shows nothing for small moves", () => {
    expect(oddsMove(0.02, 2, 2.04)).toBeNull();
    expect(oddsMove(NaN, 2, 2)).toBeNull();
  });
  it("states the fact and keeps possible reasons separate", () => {
    const m = oddsMove(-0.1, 2, 1.8)!;
    expect(m.direction).toBe("down");
    expect(m.fact).toContain("faldet 10 %");
    expect(m.maybe).toContain("Vi ved ikke");
  });
});

const bet = (userId: string, result: FriendBet["result"], odds: number | null, stake = 100, name = userId): FriendBet => ({
  id: `${userId}-${Math.random()}`,
  userId,
  name,
  kickoff: 0,
  league: "L",
  match: "A vs B",
  category: "bedste",
  outcome: "A vinder",
  probability: 0.6,
  odds,
  stake,
  result,
});

describe("friends' league", () => {
  it("ranks by profit, counts only settled bets with odds in the profit", () => {
    const t = leagueTable([
      bet("a", "won", 2),
      bet("a", "lost", 2),
      bet("b", "won", 3),
      bet("b", null, 2),
      bet("c", "won", null),
    ]);
    expect(t.map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(t[0]).toMatchObject({ bets: 2, settled: 1, won: 1, profit: 200, staked: 100 });
    expect(t[1]).toMatchObject({ settled: 1, won: 1, profit: 0, staked: 0 });
    expect(Number.isNaN(t[1].roi)).toBe(true);
    expect(t[2].profit).toBe(0);
  });
  it("parses Danish numbers and names", () => {
    expect(parseNumber("1,85")).toBe(1.85);
    expect(parseNumber(" 1 000 ")).toBe(1000);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("x")).toBeNull();
    expect(displayName(null, "mads@x.dk")).toBe("mads");
    expect(displayName("  Mads ", "m@x.dk")).toBe("Mads");
  });
  it("starts the month at Copenhagen midnight or just before", () => {
    const s = monthStart(Date.UTC(2026, 9, 15));
    expect(s).toBeLessThanOrEqual(Date.UTC(2026, 8, 30, 22));
    expect(s).toBeGreaterThan(Date.UTC(2026, 8, 30, 12));
  });
});

describe("morning e-mail", () => {
  it("dedupes and validates recipients", () => {
    expect(recipients(["A@x.dk", "b@y.dk"], "a@x.dk, c@z.dk; nope")).toEqual(["a@x.dk", "b@y.dk", "c@z.dk"]);
    expect(recipients([], undefined)).toEqual([]);
  });
  it("escapes team names and says when there are no picks", () => {
    expect(morningHtml([], 0, "https://x", "src")).toContain("ingen fodboldkampe");
  });
});
