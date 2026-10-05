import { describe, expect, it } from "vitest";
import { exportRow, isFinished, toCsv, type RawFixtureDetail } from "./pe-export";

const fixture: RawFixtureDetail = {
  fixture: { id: 7, date: "2024-03-02T15:00:00+00:00", timestamp: 0, status: { short: "FT" }, referee: "A, England" },
  league: { id: 39, season: 2023 },
  teams: { home: { id: 1, name: "Home FC" }, away: { id: 2, name: "Away FC" } },
  goals: { home: 2, away: 1 },
  score: { halftime: { home: 1, away: 1 } },
  statistics: [
    { team: { id: 2, name: "Away FC" }, statistics: [{ type: "expected_goals", value: "0.84" }, { type: "Ball Possession", value: "41%" }] },
    { team: { id: 1, name: "Home FC" }, statistics: [{ type: "expected_goals", value: "1.92" }, { type: "Total Shots", value: 15 }, { type: "Red Cards", value: null }] },
  ],
  lineups: [{ team: { id: 1, name: "Home FC" }, formation: "4-3-3", coach: { name: "C" }, startXI: [{ player: { id: 10, name: "X", pos: "G" } }, { player: { id: 11, name: "Y", pos: "D" } }]}],
  events: [
    { time: { elapsed: 70 }, team: { id: 2 }, type: "Card", detail: "Red Card" },
    { time: { elapsed: 30 }, team: { id: 2 }, type: "Card", detail: "Yellow Card" },
  ],
};

describe("exportRow", () => {
  it("matches statistics to the right side and parses numbers", () => {
    const r = exportRow(fixture);
    expect(r.home_xg).toBe(1.92);
    expect(r.away_xg).toBe(0.84);
    expect(r.home_shots).toBe(15);
    expect(r.away_possession).toBe(41);
    expect(r.home_red).toBeNull();
    expect(r.home_goals_ht).toBe(1);
  });
  it("keeps lineups and the first red card", () => {
    const r = exportRow(fixture);
    expect(r.home_xi).toBe("10;11");
    expect(r.away_xi).toBeNull();
    expect(r.away_first_red_min).toBe(70);
    expect(r.home_first_red_min).toBeNull();
  });
  it("leaves stats empty when the fixture has none", () => {
    const r = exportRow({ ...fixture, statistics: [], lineups: [], events: [] });
    expect(r.home_xg).toBeNull();
    expect(r.home_xi).toBeNull();
  });
});

describe("toCsv", () => {
  it("quotes commas and writes empty cells for null", () => {
    expect(toCsv([{ a: "x,y", b: null, c: 1 }])).toBe('a,b,c\n"x,y",,1\n');
    expect(isFinished(fixture)).toBe(true);
  });
});
