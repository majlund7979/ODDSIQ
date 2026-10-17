import { describe, expect, it } from "vitest";
import { checkLeg, couponMath, legProblems } from "./my-coupon";

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

describe("checking coupon legs", () => {
  const leg = { key: "e1|x", outcome: "Over 2,5 mål", odds: 1.9 };
  it("marks a leg closed when the pick is gone", () => {
    expect(checkLeg(leg, null)).toEqual({ key: "e1|x", status: "closed" });
  });
  it("marks a leg changed when the page now picks another outcome", () => {
    expect(checkLeg(leg, { outcome: "Under 2,5 mål", odds: 2 })).toMatchObject({ status: "changed", outcome: "Under 2,5 mål" });
  });
  it("spots new odds but not rounding noise", () => {
    expect(checkLeg(leg, { outcome: leg.outcome, odds: 1.85 })).toMatchObject({ status: "odds", odds: 1.85 });
    expect(checkLeg(leg, { outcome: leg.outcome, odds: 1.9001 }).status).toBe("ok");
    expect(checkLeg({ ...leg, odds: null }, { outcome: leg.outcome, odds: null }).status).toBe("ok");
  });
  it("says what is wrong in one line", () => {
    expect(legProblems([{ key: "a", status: "ok" }])).toBeNull();
    expect(legProblems([{ key: "a", status: "closed" }, { key: "b", status: "odds" }])).toBe(
      "1 bet er ikke åbent længere, og 1 bet har fået ny odds. Fjern dem, der er markeret Lukket, og spil igen.",
    );
    expect(legProblems([{ key: "a", status: "odds" }, { key: "b", status: "odds" }])).toBe("2 bets har fået ny odds. Vi har rettet odds på kuponen: tjek den samlede odds og spil igen.");
  });
});
