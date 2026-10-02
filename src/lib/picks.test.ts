import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import { dailyPicks, outcomeLabel } from "./picks";

const now = Date.UTC(2026, 9, 2, 12);
const row = (o: Partial<MarketRow>): MarketRow =>
  ({ selectionId: "s", eventId: "e1", marketType: "1X2", side: "home", selection: "Arsenal", status: "scheduled", kickoff: now + 3_600_000, modelProbability: 0.5, marketProbability: 0.5, bestOdds: 2, ...o }) as MarketRow;

describe("dailyPicks", () => {
  it("keeps the most likely outcome per match and ranks matches by it", () => {
    const picks = dailyPicks(
      [
        row({ selectionId: "a", eventId: "e1", modelProbability: 0.55 }),
        row({ selectionId: "b", eventId: "e1", marketType: "OU25", side: "over", modelProbability: 0.62 }),
        row({ selectionId: "c", eventId: "e2", modelProbability: 0.7 }),
        row({ selectionId: "d", eventId: "e3", modelProbability: 0.4 }),
      ],
      now,
      2,
    );
    expect(picks.map((p) => p.row.selectionId)).toEqual(["c", "b"]);
  });

  it("skips matches without a forecast, already started, or beyond 24 hours", () => {
    const picks = dailyPicks(
      [
        row({ eventId: "e1", modelProbability: null }),
        row({ eventId: "e2", status: "live" }),
        row({ eventId: "e3", kickoff: now + 25 * 3_600_000 }),
        row({ eventId: "e4", kickoff: now - 1 }),
      ],
      now,
      10,
    );
    expect(picks).toEqual([]);
  });

  it("flags value when the best price beats the model's fair odds", () => {
    const [p] = dailyPicks([row({ modelProbability: 0.6, bestOdds: 1.8 })], now, 5);
    expect(p.fairOdds).toBeCloseTo(1 / 0.6);
    expect(p.value).toBe(true);
    expect(dailyPicks([row({ modelProbability: 0.6, bestOdds: 1.6 })], now, 5)[0].value).toBe(false);
  });

  it("labels outcomes in Danish", () => {
    expect(outcomeLabel(row({}))).toBe("Arsenal vinder");
    expect(outcomeLabel(row({ side: "draw" }))).toBe("Uafgjort");
    expect(outcomeLabel(row({ marketType: "OU25", side: "under" }))).toBe("Under 2,5 mål");
    expect(outcomeLabel(row({ marketType: "BTTS", side: "yes" }))).toBe("Begge hold scorer");
  });
});
