import { describe, expect, it } from "vitest";
import { bonferroniZ, meanDiffZ, normalCdf, normalQuantile, psi, twoSidedP } from "./stats";

describe("stats", () => {
  it("normal CDF and quantile are inverses", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    for (const p of [0.001, 0.025, 0.5, 0.9, 0.999]) expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 5);
    expect(twoSidedP(1.96)).toBeCloseTo(0.05, 3);
  });

  it("raises the bar with more tests", () => {
    expect(bonferroniZ(1)).toBeCloseTo(1.96, 2);
    expect(bonferroniZ(100)).toBeGreaterThan(3.4);
    expect(bonferroniZ(100)).toBeLessThan(3.6);
  });

  it("detects mean differences and distribution shifts", () => {
    const a = Array.from({ length: 400 }, (_, i) => (i % 10) / 10);
    const b = a.map((x) => x + 0.2);
    expect(meanDiffZ(a, b)).toBeGreaterThan(3);
    expect(meanDiffZ(a, a)).toBe(0);
    expect(psi(a, a)).toBeCloseTo(0, 6);
    expect(psi(a, b.map((x) => Math.min(x, 0.99)))).toBeGreaterThan(0.25);
  });
});
