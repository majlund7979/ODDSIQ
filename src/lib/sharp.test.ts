import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import { DEMO_SHARP_BOOKS } from "@/lib/demo/picks";
import { recordedCategory, shownCategory } from "@/lib/pick-categories";
import { marketRows } from "@/lib/demo/store";
import { sharpPicks } from "./picks";
import { bookKey, LIVE_SHARP_BOOKS, powerDevig, SHARP_BACKTEST, SHARP_MAX_AGE_MS, SHARP_MAX_GAP_MS, SHARP_MIN_EV, SHARP_MIN_ODDS, sharpBets as sharpBetsAt } from "./sharp";

const now = Date.UTC(2026, 9, 10, 12);
const SIDES = ["home", "draw", "away"] as const;
type Prices = Record<string, [number, number, number] | { odds: [number, number, number]; at: number }>;

/** The three 1X2 rows of one match, with each book's prices; consensus odds default to the first book's. */
function match(prices: Prices, o: { eventId?: string; kickoff?: number; consensus?: [number, number, number] } = {}): MarketRow[] {
  const books = Object.entries(prices).map(([bookId, p]) => ({ bookId, ...(Array.isArray(p) ? { odds: p, at: now - 60_000 } : p) }));
  const consensus = o.consensus ?? books[0].odds;
  return SIDES.map((side, i) => ({
    selectionId: `${o.eventId ?? "e1"}-1x2-${side}`,
    eventId: o.eventId ?? "e1",
    sportId: "football",
    leagueId: "apf-soccer_epl",
    marketType: "1X2",
    side,
    selection: side,
    league: "Premier League",
    match: "Arsenal vs Chelsea",
    status: "scheduled",
    kickoff: o.kickoff ?? now + 3_600_000,
    movement: 0,
    currentOdds: consensus[i],
    openingOdds: consensus[i],
    marketProbability: 1 / consensus[i],
    modelProbability: null,
    bestOdds: Math.max(...books.map((b) => b.odds[i])),
    bestBook: "",
    bestBookId: null,
    quotes: books.map((b) => ({ book: bookKey(b.bookId), bookId: b.bookId, odds: b.odds[i], at: b.at })),
  })) as unknown as MarketRow[];
}

const sharpBets = (rows: MarketRow[], books: typeof LIVE_SHARP_BOOKS) => sharpBetsAt(rows, books, now);

const PIN: [number, number, number] = [2.0, 3.6, 4.0];
const fairPin = powerDevig(PIN);

describe("powerDevig", () => {
  it("removes the margin so the probabilities add up to 1", () => {
    const p = powerDevig([1.5, 4.2, 6.5]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it("leaves a price without margin alone", () => {
    const p = powerDevig([2, 4, 4]);
    expect(p[0]).toBeCloseTo(0.5, 9);
    expect(p[1]).toBeCloseTo(0.25, 9);
  });
  it("takes more of the margin from the long shot than proportional scaling does", () => {
    const odds = [1.4, 4.6, 8.5];
    const p = powerDevig(odds);
    const inv = odds.map((o) => 1 / o);
    const prop = inv.map((x) => x / inv.reduce((a, b) => a + b, 0));
    expect(p[0]).toBeGreaterThan(prop[0]);
    expect(p[2]).toBeLessThan(prop[2]);
  });
});

describe("sharpBets", () => {
  it("bets the outcome where bet365 pays at least 1 % over Pinnacle's fair price", () => {
    const [b, ...rest] = sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": [1.95, 3.5, 4.4] }), LIVE_SHARP_BOOKS);
    expect(rest).toEqual([]);
    expect(b.row.side).toBe("away");
    expect(b.bookId).toBe("apf-bet365");
    expect(b.reference).toBe("pinnacle");
    expect(b.fair).toBeCloseTo(fairPin[2], 9);
    expect(b.ev).toBeCloseTo(fairPin[2] * 4.4 - 1, 9);
    expect(b.minOdds).toBeCloseTo((1 + SHARP_MIN_EV) / fairPin[2], 9);
  });

  it("needs a reference price from the same data run", () => {
    const stale = { odds: PIN, at: now - 60_000 - SHARP_MAX_GAP_MS - 1 };
    expect(sharpBets(match({ "apf-pinnacle": stale, "apf-bet365": [1.95, 3.5, 4.4] }), LIVE_SHARP_BOOKS)).toEqual([]);
    expect(sharpBets(match({ "apf-unibet": PIN, "apf-bet365": [1.95, 3.5, 4.4] }), LIVE_SHARP_BOOKS)).toEqual([]);
  });

  it("leaves out prices older than the data runs allow", () => {
    const old = (odds: [number, number, number]) => ({ odds, at: now - SHARP_MAX_AGE_MS - 1 });
    expect(sharpBets(match({ "apf-pinnacle": old(PIN), "apf-bet365": old([1.95, 3.5, 4.4]) }), LIVE_SHARP_BOOKS)).toEqual([]);
    const fresh = (odds: [number, number, number]) => ({ odds, at: now - SHARP_MAX_AGE_MS + 60_000 });
    expect(sharpBets(match({ "apf-pinnacle": fresh(PIN), "apf-bet365": fresh([1.95, 3.5, 4.4]) }), LIVE_SHARP_BOOKS)).toHaveLength(1);
  });

  it("does not trust a reference price far from the market, such as home and away swapped", () => {
    expect(sharpBets(match({ "apf-pinnacle": [4.0, 3.6, 2.0], "apf-bet365": [1.95, 3.5, 4.4] }, { consensus: PIN }), LIVE_SHARP_BOOKS)).toEqual([]);
  });

  it("never asks for odds under the 1,25 floor", () => {
    const [b] = sharpBets(match({ "apf-pinnacle": [1.2, 7, 15], "apf-bet365": [1.26, 6, 11] }), LIVE_SHARP_BOOKS);
    expect(b.row.side).toBe("home");
    expect((1 + SHARP_MIN_EV) / b.fair).toBeLessThan(SHARP_MIN_ODDS);
    expect(b.minOdds).toBe(SHARP_MIN_ODDS);
  });

  it("falls back to the Betfair exchange, but not to one with a sportsbook-size margin", () => {
    const exchange: [number, number, number] = [2.04, 3.7, 4.1];
    const [b] = sharpBets(match({ "toa-betfair_ex_eu": exchange, "apf-bet365": [1.95, 3.5, 4.6] }), LIVE_SHARP_BOOKS);
    expect(b.reference).toBe("Betfair Exchange");
    expect(sharpBets(match({ "toa-betfair_ex_eu": [1.9, 3.3, 3.7], "apf-bet365": [1.95, 3.5, 4.6] }), LIVE_SHARP_BOOKS)).toEqual([]);
  });

  it("prefers Pinnacle when both references are there", () => {
    const [b] = sharpBets(match({ "toa-betfair_ex_eu": [2.04, 3.7, 4.05], "toa-pinnacle": PIN, "apf-bet365": [1.95, 3.5, 4.4] }), LIVE_SHARP_BOOKS);
    expect(b.reference).toBe("pinnacle");
  });

  it("skips prices under 1 % over fair, outside odds 1,25–5, or far above the market", () => {
    const fairAway = 1 / fairPin[2];
    expect(sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": [1.9, 3.4, fairAway * 1.005] }), LIVE_SHARP_BOOKS)).toEqual([]);
    expect(sharpBets(match({ "apf-pinnacle": [1.2, 7, 15], "apf-bet365": [1.15, 6, 19] }), LIVE_SHARP_BOOKS)).toEqual([]);
    expect(sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": [1.8, 3.2, 4.6] }, { consensus: [2, 3.6, 3] }), LIVE_SHARP_BOOKS)).toEqual([]);
    expect(sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": [1.8, 3.2, 4.6] }, { consensus: [2, 3.6, 3.1] }), LIVE_SHARP_BOOKS)).toHaveLength(1);
  });

  it("ignores a bookmaker whose three prices add up to less than 100 %", () => {
    expect(sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": [2.2, 3.9, 4.4] }), LIVE_SHARP_BOOKS)).toEqual([]);
  });

  it("uses bwin where it pays more, and bet365 on a tie", () => {
    const both = sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": [1.95, 3.5, 4.3], "apf-bwin": [1.95, 3.5, 4.4] }), LIVE_SHARP_BOOKS);
    expect(both).toHaveLength(1);
    expect(both[0].bookId).toBe("apf-bwin");
    const [tie] = sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": [1.95, 3.5, 4.4], "apf-bwin": [1.95, 3.5, 4.4] }), LIVE_SHARP_BOOKS);
    expect(tie.bookId).toBe("apf-bet365");
  });

  it("never bets at a book outside the list, however high its price", () => {
    expect(sharpBets(match({ "apf-pinnacle": PIN, "apf-williamhill": [1.95, 3.5, 4.6] }), LIVE_SHARP_BOOKS)).toEqual([]);
  });

  it("keeps one bet per match and ranks matches by how much they beat the fair price", () => {
    const rows = [
      ...match({ "apf-pinnacle": PIN, "apf-bet365": [1.95, 3.5, 4.3] }, { eventId: "e1" }),
      ...match({ "apf-pinnacle": PIN, "apf-bet365": [2.05, 3.4, 4.5] }, { eventId: "e2" }),
    ];
    const bets = sharpBets(rows, LIVE_SHARP_BOOKS);
    expect(bets.map((b) => b.row.eventId)).toEqual(["e2", "e1"]);
    expect(bets[0].row.side).toBe("away");
  });

  it("keeps only the side furthest over the fair price when two sides qualify", () => {
    const b365: [number, number, number] = [2.08, 3.2, 4.3];
    expect(fairPin[0] * b365[0] - 1).toBeGreaterThanOrEqual(SHARP_MIN_EV);
    expect(fairPin[2] * b365[2] - 1).toBeGreaterThan(fairPin[0] * b365[0] - 1);
    const bets = sharpBets(match({ "apf-pinnacle": PIN, "apf-bet365": b365 }), LIVE_SHARP_BOOKS);
    expect(bets).toHaveLength(1);
    expect(bets[0].row.side).toBe("away");
  });
});

describe("sharpPicks", () => {
  it("shows the bet at the bookmaker's own price, inside the next 24 hours only", () => {
    const rows = [
      ...match({ "apf-pinnacle": PIN, "apf-bet365": [1.95, 3.5, 4.4] }, { eventId: "e1" }),
      ...match({ "apf-pinnacle": PIN, "apf-bet365": [1.95, 3.5, 4.4] }, { eventId: "e2", kickoff: now + 25 * 3_600_000 }),
    ];
    const [p, ...rest] = sharpPicks(rows, now, 10, () => null, LIVE_SHARP_BOOKS);
    expect(rest).toEqual([]);
    expect(p.row.bestOdds).toBe(4.4);
    expect(p.row.bestBookId).toBe("apf-bet365");
    expect(p.outcome).toBe("away vinder");
    expect(p.probability).toBeCloseTo(fairPin[2], 9);
    expect(p.fairOdds).toBeCloseTo(1 / fairPin[2], 9);
    expect(p.value).toBe(false);
    expect(p.minOdds).toBeCloseTo((1 + SHARP_MIN_EV) / fairPin[2], 9);
  });

  it("is deterministic on DEMO DATA", () => {
    const at = Date.UTC(2026, 9, 3, 10);
    const a = sharpPicks(marketRows(at), at, 10, () => null, DEMO_SHARP_BOOKS).map((p) => [p.row.selectionId, p.row.bestOdds]);
    const b = sharpPicks(marketRows(at), at, 10, () => null, DEMO_SHARP_BOOKS).map((p) => [p.row.selectionId, p.row.bestOdds]);
    expect(a).toEqual(b);
  });
});

describe("SHARP_BACKTEST", () => {
  it("carries sample size, period, source and version", () => {
    expect(SHARP_BACKTEST.n).toBeGreaterThan(0);
    expect(SHARP_BACKTEST.periodFrom).toBeLessThan(SHARP_BACKTEST.periodTo!);
    expect(SHARP_BACKTEST.source).toContain("football-data.co.uk");
    expect(SHARP_BACKTEST.modelVersion).toBe("pinnacle-pris-v1");
    expect(SHARP_BACKTEST.basis).toBe("historical");
  });
});

describe("recorded category", () => {
  it("keeps the price comparison's picks apart from the earlier rules' bedste picks", () => {
    expect(recordedCategory("bedste")).toBe("bedste-pinnacle-pris-v1");
    expect(shownCategory(recordedCategory("bedste"))).toBe("bedste");
    expect(shownCategory("bedste")).not.toBe("bedste");
    expect(recordedCategory("vinder")).toBe("vinder");
    expect(shownCategory("vinder")).toBe("vinder");
  });
});
