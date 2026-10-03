import { describe, expect, it } from "vitest";
import { DEFAULT_SPORTS, feedConfig, oddsPlan } from "./config";
import { DEFAULT_ODDS_PLAN, planOdds, runBudget } from "./ingest";

const HOUR = 3_600_000;
const now = Date.UTC(2026, 9, 3, 9);
const plan = { ...DEFAULT_ODDS_PLAN, oddsCost: 1 };

describe("odds credit plan", () => {
  it("covers the top 5 leagues, the Superliga and the Champions League by default", () => {
    expect(feedConfig({}).sports).toEqual(DEFAULT_SPORTS);
    expect(DEFAULT_SPORTS).toContain("soccer_denmark_superliga");
    expect(DEFAULT_SPORTS).toContain("soccer_uefa_champs_league");
    expect(oddsPlan({ ODDS_MIN_HOURS: "6" }).minIntervalMs).toBe(6 * HOUR);
    expect(oddsPlan({ ODDS_MARKETS: "h2h,totals" }).oddsCost).toBe(2);
  });

  it("buys odds only for leagues with a match soon, not bought recently, soonest first", () => {
    const kickoffs = new Map([
      ["a", [now + 20 * HOUR]],
      ["b", [now + 3 * HOUR, now + 100 * HOUR]],
      ["c", [now + 72 * HOUR]],
      ["d", [now + 5 * HOUR]],
      ["e", [now - HOUR]],
    ]);
    const lastFetched = new Map<string, number | null>([["d", now - 2 * HOUR]]);
    expect(planOdds(["a", "b", "c", "d", "e"], { now, kickoffs, lastFetched, budget: null }, plan)).toEqual(["b", "a"]);
    expect(planOdds(["a", "b", "c", "d", "e"], { now, kickoffs, lastFetched, budget: 1 }, plan)).toEqual(["b"]);
    expect(planOdds(["a", "b"], { now, kickoffs, lastFetched, budget: 3 }, { ...plan, oddsCost: 2 })).toEqual(["b"]);
  });

  it("spreads the credits left over the rest of the month, allowing busy days to spend more", () => {
    expect(runBudget(null, now, 4)).toBeNull();
    // 3 Oct 09:00 UTC: 28.6 days left, 115 runs at four a day.
    expect(runBudget(500, now, 4)).toBe(13);
    expect(runBudget(10, Date.UTC(2026, 9, 31, 23), 4)).toBe(10);
    expect(runBudget(0, now, 4)).toBe(0);
  });
});
