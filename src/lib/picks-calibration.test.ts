import { describe, expect, it } from "vitest";
import { brier, calibration } from "./picks-calibration";
import { roiLabel, summarise, type RecordedPick } from "./picks-extra";
import { isFriendly } from "./picks-advice";

const pk = (probability: number, result: "won" | "lost" | null, odds: number | null = null): RecordedPick => ({ day: "d", kickoff: 0, league: "", match: "", category: "bedste", outcome: "", probability, odds, result });

describe("calibration", () => {
  it("groups settled picks by stated probability", () => {
    const rows = calibration([pk(0.72, "won", 1.3), pk(0.78, "lost", 1.4), pk(0.75, "won"), pk(0.55, "won", 1.9), pk(0.95, null)]);
    expect(rows.map((r) => [r.from, r.n])).toEqual([
      [0.5, 1],
      [0.7, 3],
    ]);
    const seventy = rows[1];
    expect(seventy.stated).toBeCloseTo(0.75);
    expect(seventy.hitRate).toBeCloseTo(2 / 3);
    expect(seventy.withOdds).toBe(2);
    expect(seventy.market).toBeCloseTo((1 / 1.3 + 1 / 1.4) / 2);
  });

  it("scores us and the bookmakers on the same picks", () => {
    const b = brier([pk(0.8, "won", 1.25), pk(0.6, "lost", 2), pk(0.7, "won")])!;
    expect(b.n).toBe(2);
    expect(b.ours).toBeCloseTo((0.04 + 0.36) / 2);
    expect(b.market).toBeCloseTo((0.04 + 0.25) / 2);
    expect(brier([pk(0.7, "won")])).toBeNull();
  });
});

describe("return and friendlies", () => {
  it("shows the return per krone and flags small samples", () => {
    const s = summarise([pk(0.6, "won", 2), pk(0.6, "lost", 2), pk(0.6, "won", 2)]);
    expect(s.roi).toBeCloseTo(1 / 3);
    expect(roiLabel(s)).toBe("+33 % (for få bets)");
    const many = summarise(Array.from({ length: 30 }, (_, i) => pk(0.5, i % 2 ? "won" : "lost", 1.9)));
    expect(roiLabel(many)).toBe("−5 %");
    expect(roiLabel(summarise([pk(0.6, "won")]))).toBe("—");
  });

  it("recognises friendlies", () => {
    expect(isFriendly("Landskampe (venskab)")).toBe(true);
    expect(isFriendly("Club Friendlies")).toBe(true);
    expect(isFriendly("UEFA Nations League")).toBe(false);
  });
});
