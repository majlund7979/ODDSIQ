import { describe, expect, it } from "vitest";
import type { RecordedPick } from "./picks-extra";
import { adjusted, adjustmentLabel, applyLearning, hitRatePeriod, LEARN_DAYS, LEARN_MAX_SHIFT, LEARN_MIN, learn } from "./picks-learning";

const rec = (category: string, probability: number, won: boolean, i = 0): RecordedPick => ({
  day: "2026-10-01",
  kickoff: Date.UTC(2026, 9, 1) + i * 3_600_000,
  league: "L",
  match: "A vs B",
  category,
  outcome: "x",
  probability,
  odds: 1.8,
  result: won ? "won" : "lost",
});
const batch = (category: string, n: number, wins: number, p: number) => Array.from({ length: n }, (_, i) => rec(category, p, i < wins, i));

describe("learning from settled picks", () => {
  it("does nothing until a bet type has enough settled picks", () => {
    const l = learn(batch("maal", LEARN_MIN - 1, 0, 0.7), "test").get("maal")!;
    expect(l.learning).toBe(false);
    expect(l.shift).toBe(0);
    expect(adjusted(0.7, l)).toBe(0.7);
  });

  it("lowers an overconfident bet type and raises an underconfident one, shrunk by sample size", () => {
    const m = learn([...batch("maal", 40, 20, 0.7), ...batch("vinder", 40, 32, 0.6)], "test");
    const over = m.get("maal")!;
    const under = m.get("vinder")!;
    expect(over.shift).toBeLessThan(0);
    expect(under.shift).toBeGreaterThan(0);
    expect(adjusted(0.7, over)).toBeLessThan(0.7);
    expect(adjusted(0.7, over)).toBeGreaterThan(0.5); // shrunk: not all the way to the 50 % hit rate
    expect(over.hitRate).toMatchObject({ n: 40, value: 0.5, basis: "historical", source: "test" });
  });

  it("caps the shift and ignores unsettled picks", () => {
    const l = learn([...batch("btts", 500, 0, 0.8), { ...rec("btts", 0.8, true), result: null }], "test").get("btts")!;
    expect(l.hitRate.n).toBe(500);
    expect(Math.abs(l.shift)).toBeCloseTo(LEARN_MAX_SHIFT);
  });

  it("keeps fair odds and strength in step and the order unchanged", () => {
    const l = learn(batch("maal", 100, 40, 0.7), "test").get("maal")!;
    const out = applyLearning(
      [
        { probability: 0.8, fairOdds: 1.25, strength: "Meget stærk" as const },
        { probability: 0.6, fairOdds: 1 / 0.6, strength: "God" as const },
      ],
      l,
    );
    expect(out[0].probability).toBeGreaterThan(out[1].probability);
    expect(out[0].fairOdds).toBeCloseTo(1 / out[0].probability);
    expect(out[1].probability).toBeLessThan(0.6);
  });

  it("labels the adjustment in points with a decimal comma and a real minus", () => {
    expect(adjustmentLabel(1.234)).toBe("+1,2");
    expect(adjustmentLabel(-0.4)).toBe("−0,4");
    expect(adjustmentLabel(0)).toBe("+0,0");
  });

  it("gives the hit rates the period they cover, not the look-back window", () => {
    const m = learn([...batch("maal", 3, 1, 0.6), { ...rec("vinder", 0.5, true), kickoff: Date.UTC(2026, 9, 7, 12) }], "test");
    expect(hitRatePeriod([m.get("maal")!.hitRate])).toBe("1. okt.–1. okt.");
    expect(hitRatePeriod([m.get("maal")!.hitRate, m.get("vinder")!.hitRate])).toBe("1. okt.–7. okt.");
    expect(hitRatePeriod([])).toBe(`sidste ${LEARN_DAYS} dage`);
  });
});
