// Demo team search (DEMO DATA): every team in the demo matches, with the demo
// squads and made-up last-five-matches numbers, seeded by team so they stay put.

import type { MarketRow } from "@/lib/demo/store";
import type { PlayerMatch } from "@/lib/stats/api-football";
import type { PlayerSeason } from "@/lib/stats/types";
import { RECENT_MATCHES } from "@/lib/team-leaders";
import { demoSquad } from "./player-shots";
import { Rng } from "./rng";

export function demoTeams(rows: MarketRow[]): string[] {
  return [...new Set(rows.filter((r) => r.sportId === "football").flatMap((r) => r.match.split(" vs ")))].sort((a, b) => a.localeCompare(b, "da"));
}

export function demoRecent(team: string, squad: PlayerSeason[], now: number): { recent: PlayerMatch[]; recentKickoffs: number[] } {
  const rng = new Rng(`recent:${team}`);
  const recentKickoffs = Array.from({ length: RECENT_MATCHES }, (_, i) => now - (i + 1) * 4 * 86_400_000);
  const recent: PlayerMatch[] = [];
  for (const p of squad) {
    const perMatch = p.appearances ? p.minutes / p.appearances : 0;
    const form = 0.5 + rng.next(); // 0.5–1.5 of his usual rate
    for (let i = 0; i < RECENT_MATCHES; i++) {
      if (rng.next() < 0.2) continue; // did not play
      const minutes = Math.max(10, Math.min(90, Math.round(perMatch * (0.7 + rng.next() * 0.5))));
      const share = minutes / Math.max(1, p.minutes);
      const draw = (total: number | undefined) => Math.round((total ?? 0) * share * form * (0.5 + rng.next()));
      recent.push({ playerId: p.playerId, name: p.name, minutes, shotsOn: draw(p.shotsOn), goals: draw(p.goals), assists: draw(p.assists), foulsCommitted: draw(p.foulsCommitted), foulsDrawn: draw(p.foulsDrawn) });
    }
  }
  return { recent, recentKickoffs };
}

export function demoTeamSquad(team: string, now: number) {
  const players = demoSquad(team, now);
  return { players, ...demoRecent(team, players, now) };
}
