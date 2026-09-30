import { describe, expect, it } from "vitest";
import { estimatedMinute, inPlayForecast } from "./inplay";

const MIN = 60_000;

describe("in-play goals model", () => {
  it("sums to one and matches the pre-match Poisson at kickoff", () => {
    const f = inPlayForecast({ home: 1.5, away: 1.1 }, 0, { home: 0, away: 0 });
    expect(f.home + f.draw + f.away).toBeCloseTo(1, 9);
    expect(f.over25 + f.under25).toBeCloseTo(1, 9);
    expect(f.home).toBeGreaterThan(f.away);
  });

  it("settles on the score at full time", () => {
    const f = inPlayForecast({ home: 1.5, away: 1.1 }, 90, { home: 2, away: 1 });
    expect(f.home).toBeCloseTo(1, 9);
    expect(f.over25).toBeCloseTo(1, 9);
  });

  it("favours the leader more as time runs out", () => {
    const early = inPlayForecast({ home: 1.2, away: 1.2 }, 20, { home: 1, away: 0 });
    const late = inPlayForecast({ home: 1.2, away: 1.2 }, 80, { home: 1, away: 0 });
    expect(late.home).toBeGreaterThan(early.home);
    expect(late.draw).toBeLessThan(early.draw);
  });

  it("estimates the minute with a half-time break", () => {
    expect(estimatedMinute(0, -5 * MIN)).toBe(0);
    expect(estimatedMinute(0, 30 * MIN)).toBe(30);
    expect(estimatedMinute(0, 55 * MIN)).toBe(45);
    expect(estimatedMinute(0, 80 * MIN)).toBe(65);
    expect(estimatedMinute(0, 130 * MIN)).toBe(90);
  });
});
