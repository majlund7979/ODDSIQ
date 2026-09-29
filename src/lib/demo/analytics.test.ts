import { describe, expect, it } from "vitest";
import { backtestRules, breakdown, clvBuckets, DIMENSIONS, driftReport, scanErrorPatterns, segmentStats, weekStart, weeklySeries } from "./analytics";
import { VALUE_RULE } from "./performance";
import { ledgerRows } from "./store";

const NOW = Date.parse("2026-09-29T20:30:00Z");

describe("ledger analytics", () => {
  const rows = ledgerRows(NOW);

  it("breakdowns partition the settled sample", () => {
    const total = segmentStats(rows);
    for (const d of DIMENSIONS) {
      const parts = breakdown(rows, d);
      expect(parts.reduce((s, p) => s + p.n, 0)).toBe(total.n);
      expect(parts.reduce((s, p) => s + p.predictions, 0)).toBe(total.predictions);
    }
  });

  it("finds the planted football draw weakness and nothing implausible", () => {
    const scan = scanErrorPatterns(rows);
    expect(scan.segmentsTested).toBeGreaterThan(20);
    const draw = scan.patterns.find((p) => p.segment.key === "Selection=football:1X2:draw");
    expect(draw?.direction).toBe("overestimates");
    for (const p of scan.patterns) {
      expect(p.segment.n).toBeGreaterThanOrEqual(scan.minSample);
      expect(Math.abs(p.segment.biasZ)).toBeGreaterThanOrEqual(scan.criticalZ);
      expect(p.possibleExplanations.length).toBeGreaterThan(0);
    }
  });

  it("weeks start on Monday UTC", () => {
    expect(new Date(weekStart(Date.parse("2026-09-30T15:00:00Z"))).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(new Date(weekStart(Date.parse("2026-09-28T00:00:00Z"))).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    const weeks = weeklySeries(rows);
    expect(weeks.reduce((s, w) => s + w.n, 0)).toBe(segmentStats(rows).n);
  });

  it("drift report uses disjoint windows with enough data", () => {
    const d = driftReport(rows, NOW);
    expect(d.baselineFrom).toBeLessThan(d.recentFrom);
    for (const c of d.checks) {
      expect(c.nBaseline).toBeGreaterThan(200);
      expect(c.nRecent).toBeGreaterThan(200);
      expect(["STABLE", "WATCH", "DRIFT"]).toContain(c.status);
    }
  });

  it("backtest marks exactly one published rule and tighter rules take fewer stakes", () => {
    const res = backtestRules(rows, VALUE_RULE);
    expect(res.filter((r) => r.published)).toHaveLength(1);
    const byEv = res.filter((r) => r.minConfidence === 0);
    for (let i = 1; i < byEv.length; i++) expect(byEv[i].staking.stakes).toBeLessThanOrEqual(byEv[i - 1].staking.stakes);
  });

  it("CLV buckets cover every settled prediction with CLV", () => {
    const n = rows.filter((r) => r.status === "settled" && r.clv !== undefined && (r.result === "won" || r.result === "lost")).length;
    expect(clvBuckets(rows).reduce((s, b) => s + b.n, 0)).toBe(n);
  });
});
