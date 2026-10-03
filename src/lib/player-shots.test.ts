import { describe, expect, it } from "vitest";
import type { PlayerSeason } from "@/lib/stats/types";
import { expectedMinutes, samePlayer, shrunkRate, sideShotPicks, topShotPicks, type TeamSide } from "./player-shots";

const pl = (name: string, o: Partial<PlayerSeason> = {}): PlayerSeason => ({
  playerId: name.length,
  name,
  position: "Attacker",
  appearances: 8,
  lineups: 8,
  minutes: 700,
  shotsOn: 10,
  shotsTotal: 20,
  goals: 5,
  injured: false,
  ...o,
});
const base = { eventId: "e1", match: "A vs B", league: "Premier League", kickoff: 0 };

describe("shots on target", () => {
  it("matches names written differently by the two feeds", () => {
    expect(samePlayer("E. Haaland", "Erling Haaland")).toBe(true);
    expect(samePlayer("Mbappé", "Kylian Mbappe")).toBe(false);
    expect(samePlayer("Kylian Mbappé", "K. Mbappe")).toBe(true);
    expect(samePlayer("J. Doe", "M. Doe")).toBe(false);
  });

  it("shrinks a short record towards the position's rate", () => {
    // 2 on target in 90 minutes is 2 per 90, shrunk to (2 + 0.85*3) / 360 * 90.
    expect(shrunkRate({ shotsOn: 2, minutes: 90, position: "Attacker" })).toBeCloseTo(((2 + 2.55) / 360) * 90);
    expect(shrunkRate({ shotsOn: 0, minutes: 2700, position: "Defender" })).toBeLessThan(0.15);
  });

  it("uses the confirmed lineup when it is out, else how often the player starts", () => {
    const p = pl("Erling Haaland", { appearances: 8, lineups: 6, minutes: 560 });
    expect(expectedMinutes(p, 8, { startXI: ["E. Haaland"], substitutes: [] })).toMatchObject({ start: "confirmed" });
    expect(expectedMinutes(p, 8, { startXI: [], substitutes: ["E. Haaland"] }).minutes).toBeLessThan(20);
    expect(expectedMinutes(p, 8, { startXI: [], substitutes: [] }).minutes).toBe(0);
    const e = expectedMinutes(p, 8, null);
    expect(e.start).toBe("expected");
    expect(e.minutes).toBeGreaterThan(55);
    expect(e.minutes).toBeLessThan(80);
  });

  it("scores the side's players and leaves out keepers, injured, absent and barely used players", () => {
    const side: TeamSide = {
      team: "A",
      opponent: "B",
      expectedGoals: 2.1,
      lineup: null,
      out: ["H. Kane"],
      players: [pl("Striker One"), pl("Keeper", { position: "Goalkeeper" }), pl("Hurt", { injured: true }), pl("Harry Kane"), pl("Youngster", { minutes: 100, appearances: 2 }), pl("Mid Man", { position: "Midfielder", shotsOn: 3 })],
    };
    const picks = sideShotPicks(side, base);
    expect(picks.map((p) => p.player)).toEqual(["Striker One", "Mid Man"]);
    const s = picks[0];
    expect(s.matchFactor).toBeCloseTo(1.5);
    expect(s.probability).toBeCloseTo(1 - Math.exp(-s.expected));
    expect(s.probability).toBeGreaterThan(0.7);
    expect(s.fairOdds).toBeCloseTo(1 / s.probability);
    expect(picks[1].probability).toBeLessThan(s.probability);
  });

  it("caps each team in the top list", () => {
    const side: TeamSide = { team: "A", opponent: "B", expectedGoals: 1.4, lineup: null, out: [], players: ["P1", "P2", "P3", "P4"].map((n, i) => pl(n, { shotsOn: 10 - i })) };
    const top = topShotPicks(sideShotPicks(side, base), 10, 3);
    expect(top.map((p) => p.player)).toEqual(["P1", "P2", "P3"]);
  });
});

describe("squad statistics from API-Football", () => {
  it("keeps the totals for this team and league, and drops players without minutes", async () => {
    const { normalizePlayers } = await import("@/lib/stats/api-football");
    const stat = (team: number, league: number, minutes: number | null, on: number | null) => ({
      team: { id: team },
      league: { id: league },
      games: { appearences: 5, lineups: 4, minutes, position: "Attacker" },
      shots: { total: 9, on },
      goals: { total: 2 },
    });
    const out = normalizePlayers(
      [
        { player: { id: 1, name: "A. One" }, statistics: [stat(50, 2, 300, 5), stat(50, 39, 410, 7)] },
        { player: { id: 2, name: "B. Two", injured: true }, statistics: [stat(50, 39, 200, null)] },
        { player: { id: 3, name: "C. Three" }, statistics: [stat(50, 39, null, null)] },
      ],
      50,
      39,
    );
    expect(out).toEqual([
      { playerId: 1, name: "A. One", position: "Attacker", appearances: 5, lineups: 4, minutes: 410, shotsOn: 7, shotsTotal: 9, goals: 2, injured: false },
      { playerId: 2, name: "B. Two", position: "Attacker", appearances: 5, lineups: 4, minutes: 200, shotsOn: 0, shotsTotal: 9, goals: 2, injured: true },
    ]);
  });
});
