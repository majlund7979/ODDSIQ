import { describe, expect, it } from "vitest";
import type { PlayerSeason } from "@/lib/stats/types";
import { cleanQuery, formOf, mergeCompetitions, teamLeaders } from "./team-leaders";
import type { PlayerMatch } from "@/lib/stats/api-football";

const p = (id: number, x: Partial<PlayerSeason>): PlayerSeason => ({ playerId: id, name: `P${id}`, position: "Attacker", appearances: 5, lineups: 5, minutes: 450, shotsOn: 0, shotsTotal: 0, goals: 0, injured: false, ...x });

describe("team leaders", () => {
  it("sums a player's competitions", () => {
    const [m] = mergeCompetitions([p(1, { shotsOn: 4, goals: 1, assists: 2, minutes: 300 }), p(1, { shotsOn: 3, foulsDrawn: 5, minutes: 200 })]);
    expect(m).toMatchObject({ shotsOn: 7, goals: 1, assists: 2, foulsDrawn: 5, minutes: 500, appearances: 10 });
  });

  it("ranks by total, counts goals plus assists, and leaves out zeros", () => {
    const l = teamLeaders([p(1, { goals: 3, assists: 0 }), p(2, { goals: 1, assists: 4 }), p(3, {})]);
    expect(l.goals.map((x) => x.playerId)).toEqual([1, 2]);
    expect(l.gc.map((x) => [x.playerId, x.value])).toEqual([[2, 5], [1, 3]]);
    expect(l.fc).toEqual([]);
  });

  it("gives per 90 only with enough minutes", () => {
    const l = teamLeaders([p(1, { shotsOn: 9, minutes: 810 }), p(2, { shotsOn: 2, minutes: 100 })]);
    expect(l.sot[0].per90).toBeCloseTo(1);
    expect(l.sot[1].per90).toBeNull();
  });
});

describe("recent form", () => {
  const m = (id: number, x: Partial<PlayerMatch>): PlayerMatch => ({ playerId: id, name: `P${id}`, minutes: 90, shotsOn: 0, goals: 0, assists: 0, foulsCommitted: 0, foulsDrawn: 0, ...x });
  it("sums the last matches and compares with the season per 90", () => {
    // Season: 9 shots on target in 810 min = 1.0 per 90. Last 3: 6 in 270 = 2.0 per 90.
    const l = teamLeaders([p(1, { shotsOn: 9, minutes: 810 })], [m(1, { shotsOn: 2 }), m(1, { shotsOn: 3 }), m(1, { shotsOn: 1 })]);
    expect(l.sot[0].recent).toMatchObject({ matches: 3, value: 6, minutes: 270 });
    expect(l.sot[0].recent?.per90).toBeCloseTo(2);
    expect(l.sot[0].form).toBe("over");
  });
  it("needs minutes on both sides", () => {
    expect(formOf(1, 0.5)).toBe("under");
    expect(formOf(1, 1.1)).toBe("same");
    expect(formOf(null, 1)).toBeNull();
    expect(formOf(0, 0)).toBe("same");
    const l = teamLeaders([p(1, { shotsOn: 9, minutes: 810 })], [m(1, { shotsOn: 1, minutes: 30 })]);
    expect(l.sot[0].form).toBeNull();
    expect(teamLeaders([p(2, { shotsOn: 3, minutes: 810 })]).sot[0].recent).toBeNull();
  });
});

describe("cleanQuery", () => {
  it("keeps letters and needs 3 characters", () => {
    expect(cleanQuery("  Brøndby  IF! ")).toBe("Brøndby IF");
    expect(cleanQuery("fc")).toBeNull();
    expect(cleanQuery(undefined)).toBeNull();
  });
});
