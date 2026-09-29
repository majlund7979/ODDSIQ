import { describe, expect, it } from "vitest";
import { ALERT_TYPES, marketAlerts } from "./alerts";
import { accuracyByHorizon, efficiencyBy, efficiencyScore, EFFICIENCY_DIMS } from "./efficiency";
import { settledSelections } from "./store";

const NOW = Date.parse("2026-09-29T20:30:00Z");

describe("alerts", () => {
  const alerts = marketAlerts(NOW);
  it("fires only inside the window, newest first, with unique ids", () => {
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.at).toBeLessThanOrEqual(NOW);
      expect(a.at).toBeGreaterThan(NOW - 24 * 3_600_000);
      expect(ALERT_TYPES.map((t) => t.id)).toContain(a.type);
    }
    for (let i = 1; i < alerts.length; i++) expect(alerts[i].at).toBeLessThanOrEqual(alerts[i - 1].at);
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
  });
  it("is deterministic", () => {
    expect(marketAlerts(NOW + 1).map((a) => a.id)).toEqual(alerts.map((a) => a.id));
  });
});

describe("efficiency", () => {
  it("scores within 0-100 with the published formula", () => {
    expect(efficiencyScore(0.15, 0)).toBe(100);
    expect(efficiencyScore(0, 3)).toBe(0);
    expect(efficiencyScore(-0.1, 10)).toBe(0);
    for (const d of EFFICIENCY_DIMS) {
      const { rows, total } = efficiencyBy(NOW, d.id);
      expect(rows.reduce((s, r) => s + r.n, 0)).toBe(total.n);
      for (const r of rows) expect(r.score).toBeGreaterThanOrEqual(0);
    }
  });
  it("closing prices are at least as accurate as opening prices", () => {
    const h = accuracyByHorizon(NOW);
    expect(h.at(-1)!.brier).toBeLessThanOrEqual(h[0].brier);
    expect(h[0].n).toBe(settledSelections(NOW).length);
  });
});
