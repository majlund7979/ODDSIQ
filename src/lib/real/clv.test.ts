import { describe, expect, it } from "vitest";
import { summarise, type RecordedPick } from "@/lib/picks-extra";
import { closeFor, specSelections } from "./clv";

const K = 10_000_000;
const H = 3_600_000;

describe("closing line value", () => {
  it("maps bets onto their full market", () => {
    expect(specSelections("toa-1", "1X2:draw")).toEqual({ ids: ["toa-1-1x2-home", "toa-1-1x2-draw", "toa-1-1x2-away"], covers: [1], quoted: "toa-1-1x2-draw" });
    expect(specSelections("toa-1", "OU:under:2.5")?.covers).toEqual([1]);
    expect(specSelections("toa-1", "DC:X2")).toMatchObject({ covers: [1, 2], quoted: "toa-1-dc-x2" });
    expect(specSelections("toa-1", "OU:over:3.5")).toBeNull();
    expect(specSelections("toa-1", "COUNT:corners:over@9.5")).toBeNull();
  });

  it("compares the shown odds with the margin-free close", () => {
    const s = specSelections("e", "1X2:home")!;
    const pts = (book: string, at: number, odds: number[]) => s.ids.map((id, i) => ({ bookmakerId: book, selectionId: id, observedAt: at, odds: odds[i] }));
    // Closes at 2.0 / 3.6 / 4.0 (fair home ≈ 0.4865); we showed 2.2 earlier.
    const c = closeFor([...pts("b", K - 8 * H, [2.2, 3.4, 3.6]), ...pts("b", K - H, [2.0, 3.6, 4.0])], s, K, 2.2)!;
    expect(c.odds).toBe(2);
    expect(c.probability).toBeCloseTo(0.4865, 3);
    expect(c.clv).toBeCloseTo(2.2 * 0.4865 - 1, 3);
    // Double chance takes two 1X2 outcomes; its own close comes from the DC market when quoted.
    const dc = specSelections("e", "DC:1X")!;
    const d = closeFor([...pts("b", K - H, [2.0, 3.6, 4.0]), { bookmakerId: "b", selectionId: "e-dc-1x", observedAt: K - H, odds: 1.25 }], dc, K, 1.3)!;
    expect(d.odds).toBe(1.25);
    expect(d.probability).toBeCloseTo(1 - 0.2432, 3);
    expect(closeFor(pts("b", K - 8 * H, [2, 3.5, 4]), s, K, 2)).toBeNull();
  });

  it("summarises how often the close was beaten", () => {
    const p = (clv: number | null): RecordedPick => ({ day: "d", kickoff: 0, league: "", match: "", category: "bedste", outcome: "", probability: 0.5, odds: 2, result: null, close: clv === null ? null : { odds: 2, probability: 0.5, books: 1, clv } });
    const s = summarise([p(0.1), p(-0.05), p(0.03), p(null)]);
    expect(s).toMatchObject({ withClose: 3, beatClose: 2 });
    expect(s.clv).toBeCloseTo(0.0267, 3);
  });
});
