import { describe, expect, it } from "vitest";
import { marketRegime, type RegimeInput } from "@/lib/metrics/regime";
import { largestMove, marketIntelligence } from "./intelligence";
import { marketRows, matchView, replayableEvents, replayData } from "./store";

const NOW = Date.parse("2026-09-29T20:30:00Z");

const base: RegimeInput = { live: false, minutesToKickoff: 600, lineupsConfirmed: false, minutesSinceNews: null, moveSinceNews: 0, volatilityRatio: 1, booksQuoting: 8, booksTracked: 8 };

describe("market regime", () => {
  it("applies the rules in order", () => {
    expect(marketRegime(base).regime).toBe("NORMAL");
    expect(marketRegime({ ...base, booksQuoting: 5 }).regime).toBe("LOW LIQUIDITY");
    expect(marketRegime({ ...base, booksQuoting: 5, volatilityRatio: 3.2 }).regime).toBe("HIGH VOLATILITY");
    expect(marketRegime({ ...base, volatilityRatio: 4, lineupsConfirmed: true, minutesToKickoff: 50 }).regime).toBe("LATE LINEUP PERIOD");
    expect(marketRegime({ ...base, lineupsConfirmed: true, minutesToKickoff: 50, minutesSinceNews: 20, moveSinceNews: -0.03 }).regime).toBe("POST-NEWS MOVEMENT");
    expect(marketRegime({ ...base, minutesSinceNews: 20, moveSinceNews: 0.01 }).regime).toBe("NORMAL");
    expect(marketRegime({ ...base, minutesSinceNews: 90, moveSinceNews: 0.05 }).regime).toBe("NORMAL");
    expect(marketRegime({ ...base, live: true, minutesSinceNews: 5, moveSinceNews: 0.1 }).regime).toBe("LIVE EVENT");
  });
});

describe("live match view", () => {
  const live = [...new Set(marketRows(NOW).filter((r) => r.status === "live").map((r) => r.eventId))];
  it("has live matches with minute-by-minute data up to now only", () => {
    expect(live.length).toBeGreaterThan(0);
    for (const id of live) {
      const v = matchView(id, NOW)!;
      expect(v.event.status).toBe("live");
      const current = v.minutes.at(-1)!.minute;
      expect(v.minutes.map((m) => m.minute)).toEqual(v.minutes.map((_, i) => i));
      for (const e of v.timeline) expect(e.minute).toBeLessThanOrEqual(current);
      for (const m of v.minutes) expect(m.market.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });
  it("describes the data without claiming causes", () => {
    const v = matchView(live[0], NOW)!;
    for (let sel = 0; sel < v.selections.length; sel++) {
      const intel = marketIntelligence(v, sel, { regime: "LIVE EVENT", reason: "The event is in play." });
      expect(intel.facts.length).toBeGreaterThan(3);
      for (const f of [...intel.facts, ...intel.possible]) expect(f).not.toMatch(/\b(because|due to|caused|driven by|best bet|lock|guaranteed)\b/i);
      const move = largestMove(v, sel);
      if (move) for (const e of move.nearby) expect(Math.abs(e.minute - move.minute)).toBeLessThanOrEqual(1);
    }
  });
});

describe("market replay", () => {
  const events = replayableEvents(NOW);
  it("lists finished events only, newest first", () => {
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.status).toBe("finished");
    for (let i = 1; i < events.length; i++) expect(events[i].kickoff).toBeLessThanOrEqual(events[i - 1].kickoff);
  });
  it("replays a football match from opening to full time", () => {
    const e = events.find((x) => x.sportId === "football")!;
    const d = replayData(e.id, NOW)!;
    expect(d.frames[d.kickoffIndex].at).toBeLessThanOrEqual(e.kickoff);
    expect(d.frames.length).toBeGreaterThan(d.kickoffIndex + 80);
    for (let i = 1; i < d.frames.length; i++) expect(d.frames[i].at).toBeGreaterThan(d.frames[i - 1].at);
    const last = d.frames.at(-1)!;
    expect(last.phase).toBe("live");
    expect(last.score).toEqual(e.score);
    for (const f of d.frames.slice(0, d.kickoffIndex + 1)) {
      for (const p of f.model) if (p !== null) expect(f.at).toBeGreaterThanOrEqual(d.predictionAt!);
    }
    for (let i = 1; i < d.events.length; i++) expect(d.events[i].at).toBeGreaterThanOrEqual(d.events[i - 1].at);
    expect(d.view.results.filter((r) => r === "won").length).toBe(1);
    if (d.predictionAt !== null) expect(d.clv.every((c) => c !== null && Number.isFinite(c))).toBe(true);
  });
  it("returns nothing for events that have not finished", () => {
    const upcoming = marketRows(NOW).find((r) => r.status === "scheduled")!;
    expect(replayData(upcoming.eventId, NOW)).toBeUndefined();
  });
});
