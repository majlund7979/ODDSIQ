import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import { valueBetPicks, VALUE_MIN_ODDS } from "@/lib/picks";
import { engineFor, engineKey, shapeEngine, siteMarket } from "./bets";

const now = Date.UTC(2026, 9, 10, 12);
const row = (o: Partial<MarketRow>): MarketRow =>
  ({ selectionId: "s", eventId: "e1", sportId: "football", movement: 0, marketType: "1X2", side: "home", selection: "Arsenal", match: "Arsenal vs Chelsea", status: "scheduled", kickoff: now + 3_600_000, modelProbability: 0.5, marketProbability: 0.5, bestOdds: 2, bestBook: "bet365", ...o }) as MarketRow;
const engine = (m: Record<string, number>) => engineFor(new Map(Object.entries(m).map(([k, p]) => [k, { probability: p, modelVersion: "ens-test", dataAsOf: null }])));

describe("prediction engine bets", () => {
  it("maps the engine's markets onto the site's and drops the rest", () => {
    expect(siteMarket("1x2", null)).toBe("1X2");
    expect(siteMarket("ou", 2.5)).toBe("OU25");
    expect(siteMarket("ou", 1.5)).toBeNull();
    const probs = shapeEngine([
      { site_event_id: "e1", market: "ou", line: 2.5, selection: "over", probability: 0.55, model_version: "v", data_as_of: null },
      { site_event_id: "e1", market: "btts", line: null, selection: "yes", probability: 0.5, model_version: "v", data_as_of: null },
      { site_event_id: "e1", market: "1x2", line: null, selection: "home", probability: 1, model_version: "v", data_as_of: null },
    ]);
    expect([...probs.keys()]).toEqual([engineKey("e1", "OU25", "over")]);
  });

  it("keeps bets where the engine's chance times the best odds beats the stake, from odds 1,25, best per match first", () => {
    const rows = [
      row({ selectionId: "a", eventId: "e1", side: "home", bestOdds: 2.1 }),
      row({ selectionId: "b", eventId: "e1", side: "away", bestOdds: 4 }),
      row({ selectionId: "c", eventId: "e2", marketType: "OU25", side: "over", bestOdds: 1.9 }),
      row({ selectionId: "d", eventId: "e3", side: "home", bestOdds: 1.2 }),
      row({ selectionId: "e", eventId: "e4", side: "home", bestOdds: 1.8 }),
      row({ selectionId: "f", eventId: "e5", marketType: "BTTS", side: "yes", bestOdds: 3 }),
    ];
    const picks = valueBetPicks(rows, now, 10, () => null, engine({
      [engineKey("e1", "1X2", "home")]: 0.5, // ev +5 %
      [engineKey("e1", "1X2", "away")]: 0.28, // ev +12 %: the better bet in the match
      [engineKey("e2", "OU25", "over")]: 0.55, // ev +4,5 %
      [engineKey("e3", "1X2", "home")]: 0.9, // odds under 1,25
      [engineKey("e4", "1X2", "home")]: 0.5, // ev -10 %
      [engineKey("e5", "BTTS", "yes")]: 0.5, // not an engine market
    }));
    expect(picks.map((p) => p.row.selectionId)).toEqual(["b", "c"]);
    expect(picks[0].ev).toBeCloseTo(0.12);
    expect(picks[0].probability).toBeCloseTo(0.28);
    expect(picks[0].engine).toBe("ens-test");
    expect(picks.every((p) => p.row.bestOdds >= VALUE_MIN_ODDS && p.value)).toBe(true);
  });

  it("shows nothing for matches the engine has not priced", () => {
    expect(valueBetPicks([row({})], now, 10, () => null, () => null)).toEqual([]);
  });
});
