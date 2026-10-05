import { describe, expect, it } from "vitest";
import { analysePick } from "@/lib/picks";
import type { MarketRow } from "@/lib/demo/store";
import { clubPair, parseClubElo } from "./clubelo";
import { AF_PREDICTION_WEIGHT, fixtureIdOf, flooredPercent, normalizePrediction, type RawPrediction } from "./af-predictions";

const RAW: RawPrediction = {
  predictions: { winner: { name: "Bayern München" }, advice: "Double chance : Bayern München or draw", percent: { home: "50%", draw: "50%", away: "0%" } },
  comparison: {
    form: { home: "60%", away: "40%" },
    att: { home: "75%", away: "25%" },
    def: { home: "", away: "" },
    total: { home: "68.5%", away: "31.5%" },
  },
};

describe("API-Football /predictions", () => {
  it("parses the percentage strings and keeps only usable comparisons", () => {
    const p = normalizePrediction(123, RAW, 1000)!;
    expect(p.percent).toEqual({ home: 0.5, draw: 0.5, away: 0 });
    expect(p.comparison.map((c) => c.key)).toEqual(["form", "att", "total"]);
    expect(p.comparison[2].home).toBeCloseTo(0.685, 9);
    expect(p.advice).toBe("Double chance : Bayern München or draw");
    expect(p.winner).toBe("Bayern München");
    expect(normalizePrediction(1, { predictions: { percent: null } }, 0)).toBeNull();
  });

  it("floors API-Football's 0 % and renormalises", () => {
    const f = flooredPercent({ home: 0.5, draw: 0.5, away: 0 });
    expect(f.away).toBeGreaterThan(0.04);
    expect(f.home + f.draw + f.away).toBeCloseTo(1, 9);
  });

  it("finds the fixture id from the event or its stats fixture", () => {
    expect(fixtureIdOf("apf-1234")).toBe(1234);
    expect(fixtureIdOf("toa-abc", "api-football:987")).toBe(987);
    expect(fixtureIdOf("toa-abc", null)).toBeNull();
  });

  it("blends into a market-only 1X2 pick ahead of ClubElo, and leaves other markets alone", () => {
    const af = normalizePrediction(1, RAW, 0)!;
    const ratings = parseClubElo("Rank,Club,Country,Level,Elo\n1,Bayern,GER,1,1990\n2,FC Kobenhavn,DEN,1,1620\n");
    const club = clubPair("Bayern Munich", "FC Copenhagen", "tod-soccer_uefa_champs_league", ratings, 0);
    const row = { marketType: "1X2", side: "home", modelProbability: null, marketProbability: 0.6, movement: 0, quotes: [] } as unknown as MarketRow;
    const a = analysePick(row, { news: null, clubElo: club, afPrediction: af })!;
    expect(a.probability).toBeCloseTo((1 - AF_PREDICTION_WEIGHT) * 0.6 + AF_PREDICTION_WEIGHT * flooredPercent(af.percent).home, 9);
    expect(a.factors.map((f) => f.label)).toContain("Holdstyrke (API-Football)");
    expect(a.insights.afPrediction).toBe(af);
    const ou = analysePick({ ...row, marketType: "OU25", side: "over" } as MarketRow, { news: null, afPrediction: af })!;
    expect(ou.probability).toBe(0.6);
  });
});
