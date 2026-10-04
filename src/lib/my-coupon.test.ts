import { describe, expect, it } from "vitest";
import { couponMath } from "./my-coupon";

describe("own coupon", () => {
  it("multiplies chance and odds, and gives the average return", () => {
    const m = couponMath([
      { probability: 0.7, odds: 1.5 },
      { probability: 0.6, odds: 1.8 },
    ])!;
    expect(m.probability).toBeCloseTo(0.42);
    expect(m.odds).toBeCloseTo(2.7);
    expect(m.expectedReturn).toBeCloseTo(1.134);
    expect(m.fairOdds).toBeCloseTo(1 / 0.42);
  });
  it("leaves legs without odds out of the odds and the return", () => {
    const m = couponMath([
      { probability: 0.7, odds: 1.5 },
      { probability: 0.8, odds: null },
    ])!;
    expect(m.missingOdds).toBe(1);
    expect(m.odds).toBeCloseTo(1.5);
    expect(m.expectedReturn).toBeNull();
    expect(couponMath([])).toBeNull();
  });
});
