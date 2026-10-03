// Demo squads (DEMO DATA) for the shots-on-target tab: made-up players for
// every demo team, seeded by team so they stay the same on every visit.

import type { MarketRow } from "@/lib/demo/store";
import { sideShotPicks, type ShotPick } from "@/lib/player-shots";
import type { PickContext } from "@/lib/picks";
import { matchSides, windowMatches, type ShotBoard } from "@/lib/real/player-shots";
import { seasonFor } from "@/lib/stats/api-football";
import type { PlayerSeason } from "@/lib/stats/types";
import { Rng } from "./rng";

const SHAPE: [string, number, number][] = [
  // position, shirt number, shots on target per 90 around
  ["Attacker", 9, 1.1],
  ["Attacker", 11, 0.7],
  ["Attacker", 7, 0.6],
  ["Midfielder", 10, 0.55],
  ["Midfielder", 8, 0.35],
  ["Midfielder", 6, 0.2],
  ["Defender", 4, 0.15],
  ["Defender", 3, 0.1],
  ["Goalkeeper", 1, 0],
];

export function demoSquad(team: string, now: number): PlayerSeason[] {
  const rng = new Rng(`squad:${team}:${seasonFor(now)}`);
  const games = 7;
  return SHAPE.map(([position, number, rate], i) => {
    const lineups = Math.min(games, Math.round(games * (0.55 + rng.next() * 0.45)));
    const appearances = Math.min(games, lineups + Math.round(rng.next() * 2));
    const minutes = lineups * (70 + Math.round(rng.next() * 20)) + (appearances - lineups) * 20;
    const shotsOn = Math.round(((rate * (0.6 + rng.next() * 0.8)) * minutes) / 90);
    return { playerId: i + 1, name: `DEMO ${team} nr. ${number}`, position, appearances, lineups, minutes, shotsOn, shotsTotal: shotsOn * 2, goals: Math.round(shotsOn * 0.35), injured: false };
  });
}

export function demoShotBoard(rows: MarketRow[], now: number, context: (eventId: string) => PickContext | null): ShotBoard {
  const matches = windowMatches(rows, now);
  const picks: ShotPick[] = [];
  for (const m of matches) {
    const [home, away] = m.match.split(" vs ");
    for (const side of matchSides(m, context(m.eventId), { home: demoSquad(home, now), away: demoSquad(away, now) }))
      picks.push(...sideShotPicks(side, { eventId: m.eventId, match: m.match, league: m.league, kickoff: m.kickoff }));
  }
  return { picks, matches: matches.length, covered: matches.length, fetchedAt: now, season: seasonFor(now) };
}
