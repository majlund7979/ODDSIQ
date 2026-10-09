import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import { explainPick } from "./picks-explain";
import type { Pick } from "./picks";

const row = { match: "Arsenal vs Chelsea", marketType: "1X2", side: "home", bestOdds: 1.9, bestBook: "Bet A", modelProbability: 0.6, marketProbability: 0.5 } as MarketRow;
const pick = (o: Partial<Pick> = {}): Pick => ({
  row,
  outcome: "Arsenal vinder",
  probability: 0.55,
  fairOdds: 1 / 0.55,
  value: true,
  lineupsConfirmed: false,
  factors: [{ label: "Skader og karantæner", pp: -1.2, detail: "Chelsea mangler 2 (A, B)" }],
  insights: {
    expectedGoals: { home: 1.7, away: 1.0 },
    elo: null,
    clubElo: null, afPrediction: null, scorers: null,
    form: { home: [{ result: "V", score: "2-0", opponent: "X", home: true }], away: [{ result: "T", score: "0-1", opponent: "Y", home: false }] },
    h2h: { home: 2, draw: 1, away: 0, games: [{ date: 0, score: "2-1" }, { date: 0, score: "1-1" }, { date: 0, score: "3-0" }] },
    movement: -0.05,
    lineupsConfirmed: false,
  },
  strength: "God",
  marketOnly: false,
  ...o,
});

describe("explainPick", () => {
  it("explains a pick from its facts in plain Danish", () => {
    const text = explainPick(pick()).join(" ");
    expect(text).toContain('Vi giver "Arsenal vinder" 55 % chance');
    expect(text).toContain("1,7 mål til Arsenal og 1,0 til Chelsea");
    expect(text).toContain("Arsenal ventes at skabe mest");
    expect(text).toContain("I de seneste 3 indbyrdes opgør vandt Arsenal 2, Chelsea 0, og 1 endte uafgjort, med 2,7 mål i snit.");
    expect(text).toContain("Chelsea mangler 2");
    expect(text).toContain("mindre optimistiske end resultatmodellen (50 % mod 60 %)");
    expect(text).toContain("Oddsen er faldet 5 %");
    expect(text).toContain("hver 2. gang");
  });

  it("says the head-to-head in the singular when there is one meeting", () => {
    const text = explainPick(pick({ insights: { ...pick().insights, h2h: { home: 1, draw: 0, away: 0, games: [{ date: 0, score: "2-1" }] } } })).join(" ");
    expect(text).toContain("I det seneste indbyrdes opgør vandt Arsenal 1, Chelsea 0, og 0 endte uafgjort, med 3,0 mål i snit.");
    expect(text).not.toContain("I de seneste 1 ");
  });

  it("never gives a cause for a price move", () => {
    const text = explainPick(pick()).join(" ");
    expect(text).not.toMatch(/fordi .*(spillet|penge|insider)/);
  });

  it("says when a pick rests on the bookmakers alone", () => {
    const text = explainPick(pick({ marketOnly: true, insights: { ...pick().insights, expectedGoals: null, form: null, h2h: null } })).join(" ");
    expect(text).toContain("kun på bookmakernes odds");
    expect(text).not.toContain("resultatmodellen");
  });
});
