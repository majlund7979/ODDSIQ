import { describe, expect, it } from "vitest";
import { buildCountModel, countPmf, refereeKey, refereeRate, forecastCount, forecastCounts, footballDataSeason, overProbability, parseFootballDataCsv, type StatMatch } from "./match-stats";
import { matchTeam } from "./teams";

const CSV = `﻿Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR,B365H
E0,15/08/2025,20:00,Liverpool,Bournemouth,4,2,H,1,0,H,A Taylor,19,10,10,3,7,10,6,7,1,2,0,0,1.3
E0,16/08/2025,12:30,Aston Villa,Newcastle,0,0,D,0,0,D,S Hooper,3,16,1,3,19,14,2,11,3,4,1,0,2.4
E0,16/08/25,15:00,Man United,Nott'm Forest,1,1,D,0,0,D,X,10,10,4,4,,12,5,5,2,2,0,0,2.0
`;

describe("football-data.co.uk CSV", () => {
  it("reads corners, cards (yellow + red) and fouls by header name", () => {
    const rows = parseFootballDataCsv("en.1", "2025-26", CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ home: "Liverpool", away: "Bournemouth", corners: [6, 7], cards: [1, 2], fouls: [7, 10] });
    expect(rows[1].cards).toEqual([4, 4]);
    expect(rows[2].fouls).toBeNull();
    expect(rows[0]).toMatchObject({ goals: [4, 2], ht: [1, 0], referee: "A Taylor" });
    expect(new Date(rows[2].date).getUTCFullYear()).toBe(2025);
    expect(footballDataSeason("2025-26")).toBe("2526");
  });

  it("matches its short team names to the odds feed's", () => {
    expect(matchTeam("Manchester United", ["Man United", "Man City"])).toBe("Man United");
    expect(matchTeam("Nottingham Forest", ["Nott'm Forest", "Fulham"])).toBe("Nott'm Forest");
  });
});

describe("count model", () => {
  it("has a proper distribution", () => {
    let sum = 0;
    for (let k = 0; k < 80; k++) sum += countPmf(k, 10, 12);
    expect(sum).toBeCloseTo(1, 4);
    expect(overProbability(9.5, 10, Infinity)).toBeGreaterThan(0.4);
    expect(overProbability(9.5, 10, 5)).toBeLessThan(overProbability(9.5, 10, Infinity) + 0.05);
  });

  const day = 86_400_000;
  const asOf = Date.UTC(2026, 9, 1);
  const teams = ["A", "B", "C", "D", "E", "F"];
  // A wins lots of corners, F very few; everyone else is average.
  const history: StatMatch[] = [];
  for (let i = 0; i < 120; i++) {
    const home = teams[i % 6];
    const away = teams[(i + 1 + Math.floor(i / 6)) % 6] === home ? teams[(i + 2) % 6] : teams[(i + 1 + Math.floor(i / 6)) % 6];
    const c = (t: string) => (t === "A" ? 9 : t === "F" ? 2 : 5);
    history.push({ league: "x", season: "s", date: asOf - (120 - i) * day, home, away, corners: [c(home), c(away)], cards: null, fouls: null });
  }

  it("leans over for a high-corner match and sets the line near the expectation", () => {
    const m = buildCountModel("corners", history, asOf)!;
    expect(m).not.toBeNull();
    const high = forecastCount(m, "A", "B")!;
    const low = forecastCount(m, "F", "C")!;
    expect(high.expected.total).toBeGreaterThan(low.expected.total);
    expect(high.suggestion.side).toBe("over");
    expect(low.suggestion.side).toBe("under");
    expect(Math.abs(high.fairLine - high.expected.total)).toBeLessThan(1.5);
    expect(high.suggestion.probability).toBeGreaterThan(0.5);
    expect(buildCountModel("cards", history, asOf)).toBeNull();
  });

  it("forecasts by matched team names and skips unknown teams", () => {
    const models = { corners: buildCountModel("corners", history, asOf)! };
    expect(forecastCounts(models, "A", "B").corners).toBeDefined();
    expect(forecastCounts(models, "A", "Zebra").corners).toBeUndefined();
  });
});

describe("referees", () => {
  it("matches names across sources", () => {
    expect(refereeKey("Anthony Taylor, England")).toBe("a taylor");
    expect(refereeKey("A. Taylor")).toBe("a taylor");
    expect(refereeKey("A Taylor")).toBe("a taylor");
  });

  it("raises expected cards for a strict referee, shrunk toward the average", () => {
    const asOf = Date.UTC(2026, 9, 1);
    const h: StatMatch[] = Array.from({ length: 100 }, (_, i) => ({
      league: "x", season: "s", date: asOf - (100 - i) * 86_400_000, home: `T${i % 10}`, away: `T${(i + 3) % 10}`,
      corners: null, fouls: null, cards: i % 5 === 0 ? [4, 4] : [2, 2], referee: i % 5 === 0 ? "C Kavanagh" : "Other Ref",
    }));
    const m = buildCountModel("cards", h, asOf)!;
    const r = refereeRate(m, "Chris Kavanagh, England")!;
    expect(r.n).toBe(20);
    expect(r.cardsPerMatch).toBe(8);
    expect(r.factor).toBeGreaterThan(1);
    expect(r.factor).toBeLessThan(8 / (m.homeMean + m.awayMean));
  });
});
