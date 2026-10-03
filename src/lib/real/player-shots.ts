// Reads the squad statistics for the matches in the pick window and turns
// them into shots-on-target picks (src/lib/player-shots.ts).

import type { PrismaClient } from "@/generated/prisma/client";
import type { MarketRow } from "@/lib/demo/store";
import { sideShotPicks, TYPICAL_TEAM_GOALS, type ShotPick, type TeamSide } from "@/lib/player-shots";
import { PICK_WINDOW_MS, type PickContext } from "@/lib/picks";
import { API_FOOTBALL, seasonFor } from "@/lib/stats/api-football";
import type { PlayerSeason, Side } from "@/lib/stats/types";

export interface ShotBoard {
  picks: ShotPick[];
  /** Matches in the window, and how many of them have squad statistics. */
  matches: number;
  covered: number;
  /** Oldest squad refresh behind the picks, epoch ms. */
  fetchedAt: number | null;
  season: number;
}

/** One entry per football match in the pick window. */
export function windowMatches(rows: MarketRow[], now: number): MarketRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (r.sportId !== "football" || r.status !== "scheduled" || r.kickoff <= now || r.kickoff > now + PICK_WINDOW_MS || seen.has(r.eventId)) return false;
    seen.add(r.eventId);
    return true;
  });
}

/** The two sides of a match, given each side's squad. */
export function matchSides(r: MarketRow, ctx: PickContext | null, squads: Record<Side, PlayerSeason[]>): TeamSide[] {
  const [home, away] = r.match.split(" vs ");
  const lineup = (side: Side) => {
    const l = ctx?.news?.lineups.find((x) => x.side === side);
    return l ? { startXI: l.startXI.map((p) => p.name), substitutes: l.substitutes.map((p) => p.name) } : null;
  };
  const out = (side: Side) => (ctx?.news?.injuries ?? []).filter((i) => i.side === side && i.status === "out").map((i) => i.player);
  const xg = ctx?.expectedGoals ?? { home: TYPICAL_TEAM_GOALS, away: TYPICAL_TEAM_GOALS };
  return [
    { team: home, opponent: away, players: squads.home, expectedGoals: xg.home, lineup: lineup("home"), out: out("home") },
    { team: away, opponent: home, players: squads.away, expectedGoals: xg.away, lineup: lineup("away"), out: out("away") },
  ];
}

export async function realShotBoard(prisma: PrismaClient, rows: MarketRow[], now: number, context: (eventId: string) => PickContext | null): Promise<ShotBoard> {
  const season = seasonFor(now);
  const matches = windowMatches(rows, now);
  const fixtures = await prisma.statsFixture.findMany({
    where: { provider: API_FOOTBALL, eventId: { in: matches.map((m) => m.eventId) }, homeTeamId: { not: null }, awayTeamId: { not: null } },
    select: { eventId: true, leagueId: true, homeTeamId: true, awayTeamId: true },
  });
  const teamIds = [...new Set(fixtures.flatMap((f) => [f.homeTeamId!, f.awayTeamId!]))];
  // The newest season stored per team and competition: internationals and calendar-year leagues name seasons differently.
  const stored = teamIds.length ? await prisma.playerSeasonStat.findMany({ where: { provider: API_FOOTBALL, teamId: { in: teamIds }, season: { gte: season - 1 } } }) : [];
  const newest = new Map<string, number>();
  for (const p of stored) newest.set(`${p.leagueId}:${p.teamId}`, Math.max(newest.get(`${p.leagueId}:${p.teamId}`) ?? 0, p.season));
  const players = stored.filter((p) => p.season === newest.get(`${p.leagueId}:${p.teamId}`));
  const squad = (leagueId: number, teamId: number) => players.filter((p) => p.leagueId === leagueId && p.teamId === teamId);
  const picks: ShotPick[] = [];
  let covered = 0;
  for (const m of matches) {
    const f = fixtures.find((x) => x.eventId === m.eventId);
    if (!f) continue;
    const squads = { home: squad(f.leagueId, f.homeTeamId!), away: squad(f.leagueId, f.awayTeamId!) };
    if (!squads.home.length || !squads.away.length) continue;
    covered++;
    for (const side of matchSides(m, context(m.eventId), squads)) picks.push(...sideShotPicks(side, { eventId: m.eventId, match: m.match, league: m.league, kickoff: m.kickoff }));
  }
  const used = players.filter((p) => fixtures.some((f) => f.leagueId === p.leagueId && (f.homeTeamId === p.teamId || f.awayTeamId === p.teamId)));
  const fetchedAt = used.length ? Math.min(...used.map((p) => p.fetchedAt.getTime())) : null;
  return { picks, matches: matches.length, covered, fetchedAt, season };
}
