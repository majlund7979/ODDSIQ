import { describe, expect, it } from "vitest";
import type { MarketRow } from "@/lib/demo/store";
import { analysePick, goalsProbability } from "@/lib/picks";
import type { PlayerMatch } from "@/lib/stats/api-football";
import type { PlayerSeason, TeamLineup } from "@/lib/stats/types";
import { TOP_SCORER_ABSENCE, topScorer } from "./top-scorer";

const season = (playerId: number, name: string, goals: number, minutes = 1800, leagueId = 1): PlayerSeason & { leagueId: number } =>
  ({ leagueId, playerId, name, position: "Attacker", appearances: 20, lineups: 20, minutes, shotsOn: 0, shotsTotal: 0, goals, injured: false });
const match = (playerId: number, goals: number, minutes = 90): PlayerMatch => ({ playerId, name: "x", minutes, shotsOn: 0, goals, assists: 0, foulsCommitted: 0, foulsDrawn: 0 });
const squad = [season(9, "Erling Haaland", 10), season(9, "Erling Haaland", 2, 300, 2), season(7, "Phil Foden", 4), season(4, "Rodri", 2)];
const lineup = (names: string[]): TeamLineup => ({ side: "home", team: "City", formation: null, coach: null, startXI: names.map((name) => ({ name })) as never, substitutes: [] });

describe("top scorer", () => {
  it("sums his goals over competitions and caps his share", () => {
    const t = topScorer(squad, [], { injuries: [], lineup: null })!;
    expect(t.name).toBe("Erling Haaland");
    expect(t.goals).toBe(12);
    expect(t.share).toBe(0.5); // 12 of 18, capped
    expect(t.factor).toBe(1);
    expect(topScorer([season(1, "A", 2)], [], { injuries: [], lineup: null })).toBeNull();
  });

  it("takes part of his share away when he is out, and less when doubtful or on the bench", () => {
    const out = topScorer(squad, [], { injuries: [{ side: "home", team: "City", player: "E. Haaland", status: "out", reason: "Knee" }], lineup: null })!;
    expect(out.status).toBe("out");
    expect(out.injuryPlayer).toBe("E. Haaland");
    expect(out.factor).toBeCloseTo(1 - TOP_SCORER_ABSENCE * 0.5, 9);
    const doubt = topScorer(squad, [], { injuries: [{ side: "home", team: "City", player: "Erling Haaland", status: "doubtful", reason: "" }], lineup: null })!;
    expect(doubt.factor).toBeGreaterThan(out.factor);
    const bench = topScorer(squad, [], { injuries: [], lineup: lineup(["Phil Foden"]) })!;
    expect(bench.status).toBe("bench");
    expect(bench.factor).toBeLessThan(1);
    // In the confirmed XI he starts, whatever the injury list said.
    expect(topScorer(squad, [], { injuries: [{ side: "home", team: "City", player: "E. Haaland", status: "out", reason: "" }], lineup: lineup(["Erling Haaland"]) })!.status).toBe("starts");
  });

  it("moves with his recent form against his season", () => {
    const hot = topScorer(squad, [match(9, 2), match(9, 1), match(9, 2)], { injuries: [], lineup: null })!;
    expect(hot.recent).toMatchObject({ matches: 3, goals: 5, ratio: 1.5 });
    expect(hot.factor).toBeGreaterThan(1);
    const cold = topScorer(squad, [match(9, 0), match(9, 0), match(9, 0)], { injuries: [], lineup: null })!;
    expect(cold.factor).toBeLessThan(1);
    // Too few minutes: no form.
    expect(topScorer(squad, [match(9, 3, 60)], { injuries: [], lineup: null })!.recent).toBeNull();
  });

  it("moves over 2,5 mål through the team's expected goals, and leaves 1X2 alone", () => {
    const now = Date.UTC(2026, 9, 5);
    const row = { selectionId: "o", eventId: "e", sportId: "football", leagueId: "apf-soccer_epl", movement: 0, marketType: "OU25", side: "over", selection: "Over", match: "City vs Arsenal", status: "scheduled", kickoff: now + 3_600_000, modelProbability: 0.6, marketProbability: 0.6, bestOdds: 1.8 } as unknown as MarketRow;
    const out = topScorer(squad, [], { injuries: [{ side: "home", team: "City", player: "E. Haaland", status: "out", reason: "" }], lineup: null })!;
    const ctx = { expectedGoals: { home: 1.8, away: 1.2 }, news: null, scorers: { home: out, away: null } };
    const a = analysePick(row, ctx)!;
    const base = analysePick(row, { ...ctx, scorers: undefined })!;
    const d = goalsProbability("OU25", "over", 1.8 * out.factor, 1.2)! - goalsProbability("OU25", "over", 1.8, 1.2)!;
    expect(a.probability - base.probability).toBeCloseTo(d * 0.5, 6);
    expect(a.factors.find((f) => f.label === "Topscorere")?.detail).toContain("mangler");
    const win = analysePick({ ...row, marketType: "1X2", side: "home" } as MarketRow, ctx)!;
    expect(win.factors.some((f) => f.label === "Topscorere")).toBe(false);
  });
});
