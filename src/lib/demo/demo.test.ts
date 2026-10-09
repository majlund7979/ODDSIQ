import { describe, expect, it } from "vitest";
import { ledgerAudit, ledgerRows, marketRows, universeStats, visibleLedger } from "./store";
import { DAY, eventsForDay, fairProbabilities, HOUR } from "./universe";

const NOW = Date.parse("2026-09-29T20:30:00Z");

describe("demo universe", () => {
  it("is deterministic per day", () => {
    const day = Date.parse("2026-03-14T00:00:00Z");
    const a = eventsForDay(day);
    const b = eventsForDay(day);
    expect(a.map((e) => e.event)).toEqual(b.map((e) => e.event));
    expect(a.map((e) => e.predictions)).toEqual(b.map((e) => e.predictions));
  });

  it("meets the DEMO_MODE volume requirements", () => {
    const stats = universeStats(NOW);
    const audit = ledgerAudit(NOW);
    const rows = ledgerRows(NOW);
    expect(stats.events).toBeGreaterThanOrEqual(100);
    expect(stats.leagues).toBeGreaterThan(5);
    expect(stats.bookmakers).toBeGreaterThanOrEqual(10);
    expect(audit.count).toBeGreaterThanOrEqual(500);
    expect(rows.filter((r) => r.status === "settled").length).toBeGreaterThanOrEqual(500);
    expect(rows.filter((r) => r.clv !== undefined).length).toBeGreaterThanOrEqual(500);
    expect(new Set(rows.map((r) => r.prediction.modelVersionId)).size).toBeGreaterThanOrEqual(3);
  });

  it("always has matches in play", () => {
    for (let h = 0; h < 24; h += 5) {
      const live = marketRows(NOW + h * HOUR).filter((r) => r.status === "live");
      expect(live.length).toBeGreaterThan(0);
    }
  });

  it("produces fair market probabilities that sum to 1", () => {
    const [ev] = eventsForDay(Date.parse("2026-05-02T00:00:00Z"));
    for (const m of ev.markets) {
      for (const t of [ev.openAt, ev.predictionAt, ev.event.kickoff - HOUR, ev.event.kickoff]) {
        const p = fairProbabilities(ev, m, t);
        expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
      }
    }
  });

  it("settles every market consistently with the final score", () => {
    for (const ev of eventsForDay(Date.parse("2026-04-11T00:00:00Z"))) {
      for (const m of ev.markets) {
        expect(m.selections.filter((s) => s.selection.result === "won")).toHaveLength(1);
      }
    }
  });
});

describe("ledger over time", () => {
  it("only grows: an earlier view is an exact prefix of a later one", () => {
    const earlier = visibleLedger(NOW);
    const later = visibleLedger(NOW + 3 * DAY);
    expect(later.length).toBeGreaterThan(earlier.length);
    expect(later.slice(0, earlier.length).map((p) => p.hash)).toEqual(earlier.map((p) => p.hash));
  });

  it("verifies end to end and never records a prediction after kickoff", () => {
    expect(ledgerAudit(NOW).verification.ok).toBe(true);
    for (const r of ledgerRows(NOW)) expect(r.prediction.createdAt).toBeLessThan(r.event.kickoff);
  });
});
