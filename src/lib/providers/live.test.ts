import { describe, expect, it } from "vitest";
import { liveConfig, liveRunDecision } from "./config";

const MIN = 60_000;
const on = liveConfig({ ODDS_LIVE: "on" });

describe("in-play polling", () => {
  it("is off unless ODDS_LIVE is set, with safe defaults", () => {
    expect(liveConfig({}).enabled).toBe(false);
    expect(on).toMatchObject({ enabled: true, intervalMinutes: 10, reserve: 100, creditsPerCompetition: 3 });
    expect(liveConfig({ ODDS_LIVE: "on", ODDS_LIVE_INTERVAL_MINUTES: "1", ODDS_MARKETS: "h2h,totals" })).toMatchObject({ intervalMinutes: 2, creditsPerCompetition: 4 });
  });

  it("calls the feed only while a match is in play, not too often, and above the credit reserve", () => {
    const now = 1_000 * MIN;
    const base = { inPlay: 1, lastLiveRunAt: null, creditsRemaining: 400, now };
    expect(liveRunDecision(liveConfig({}), base)).toEqual({ run: false, reason: "ODDS_LIVE is off." });
    expect(liveRunDecision(on, { ...base, inPlay: 0 }).run).toBe(false);
    expect(liveRunDecision(on, { ...base, lastLiveRunAt: now - 5 * MIN }).run).toBe(false);
    expect(liveRunDecision(on, { ...base, lastLiveRunAt: now - 10 * MIN }).run).toBe(true);
    expect(liveRunDecision(on, { ...base, creditsRemaining: 99 }).run).toBe(false);
    expect(liveRunDecision(on, base).run).toBe(true);
  });
});
