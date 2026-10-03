// "Spiller får skud på mål": the chance a player has at least one shot on
// target in a match. Pure functions; the squad statistics come from the
// statistics feed (src/lib/real/player-shots.ts) or the demo universe.
//
// Model (skud-v1): the player's shots on target per 90 minutes this season,
// shrunk towards their position's typical rate, times the minutes they are expected
// to play, times how many goals their team is expected to score in this match
// against a typical match. The count is treated as Poisson, so
// P(at least one) = 1 - e^-expected.

import type { PlayerSeason } from "@/lib/stats/types";

export const SHOTS_MODEL_VERSION = "skud-v1";

/** Shots on target per 90 minutes a typical player in each position has (top European leagues, rounded). */
export const POSITION_RATE: Record<string, number> = { Attacker: 0.85, Midfielder: 0.35, Defender: 0.15, Goalkeeper: 0 };
const DEFAULT_RATE = 0.3;
/** Minutes of the position's typical rate blended into each player's own record. */
export const PRIOR_MINUTES = 270;
/** Goals a team scores in a typical match, the baseline for the match factor. */
export const TYPICAL_TEAM_GOALS = 1.4;
export const MIN_MINUTES = 180;
export const MIN_APPEARANCES = 3;
/** Minutes a substitute who comes on typically plays. */
const SUB_MINUTES = 20;

export const POSITION_LABEL: Record<string, string> = { Attacker: "Angriber", Midfielder: "Midtbane", Defender: "Forsvar", Goalkeeper: "Målmand" };

export type StartStatus = "confirmed" | "bench" | "expected";

export interface ShotPick {
  eventId: string;
  match: string;
  league: string;
  kickoff: number;
  player: string;
  team: string;
  opponent: string;
  position: string | null;
  /** Chance of at least one shot on target. */
  probability: number;
  /** Fair odds, 1 / probability. */
  fairOdds: number;
  /** The expected count behind the probability. */
  expected: number;
  /** Season shots on target per 90 minutes, before shrinking. */
  per90: number;
  expectedMinutes: number;
  start: StartStatus;
  season: { appearances: number; lineups: number; minutes: number; shotsOn: number; goals: number };
  /** Team's expected goals in this match divided by a typical team's. */
  matchFactor: number;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .trim();

/** Feeds abbreviate first names differently ("E. Haaland", "Erling Haaland"); the surname and first initial decide. */
export function samePlayer(a: string, b: string): boolean {
  const x = norm(a).split(/\s+/);
  const y = norm(b).split(/\s+/);
  if (x.join(" ") === y.join(" ")) return true;
  return x.at(-1) === y.at(-1) && x[0]?.[0] === y[0]?.[0];
}

export interface TeamSide {
  team: string;
  opponent: string;
  players: PlayerSeason[];
  /** Expected goals for this team in the match, from the match model. */
  expectedGoals: number;
  /** Confirmed starters and substitutes; null until the lineup is out. */
  lineup: { startXI: string[]; substitutes: string[] } | null;
  /** Players listed out for the match. */
  out: string[];
}

export function shrunkRate(p: Pick<PlayerSeason, "shotsOn" | "minutes" | "position">): number {
  const prior = POSITION_RATE[p.position ?? ""] ?? DEFAULT_RATE;
  return ((p.shotsOn + (prior * PRIOR_MINUTES) / 90) / (p.minutes + PRIOR_MINUTES)) * 90;
}

/** Expected minutes from the confirmed lineup, or from how often they have started and come on this season. */
export function expectedMinutes(p: PlayerSeason, teamMatches: number, lineup: TeamSide["lineup"]): { minutes: number; start: StartStatus } {
  const perStart = p.lineups ? Math.min(90, Math.max(60, (p.minutes - (p.appearances - p.lineups) * SUB_MINUTES) / p.lineups)) : 75;
  if (lineup) {
    if (lineup.startXI.some((n) => samePlayer(n, p.name))) return { minutes: perStart, start: "confirmed" };
    if (lineup.substitutes.some((n) => samePlayer(n, p.name))) return { minutes: SUB_MINUTES * 0.6, start: "bench" };
    return { minutes: 0, start: "bench" };
  }
  const games = Math.max(teamMatches, p.appearances, 1);
  return { minutes: (p.lineups / games) * perStart + ((p.appearances - p.lineups) / games) * SUB_MINUTES, start: "expected" };
}

export function sideShotPicks(side: TeamSide, base: Pick<ShotPick, "eventId" | "match" | "league" | "kickoff">): ShotPick[] {
  const teamMatches = Math.max(0, ...side.players.map((p) => p.appearances));
  const matchFactor = Math.min(1.6, Math.max(0.6, side.expectedGoals / TYPICAL_TEAM_GOALS));
  return side.players.flatMap((p) => {
    if (p.position === "Goalkeeper" || p.injured || p.minutes < MIN_MINUTES || p.appearances < MIN_APPEARANCES) return [];
    if (side.out.some((n) => samePlayer(n, p.name))) return [];
    const m = expectedMinutes(p, teamMatches, side.lineup);
    if (m.minutes <= 0) return [];
    const expected = (shrunkRate(p) * m.minutes * matchFactor) / 90;
    const probability = 1 - Math.exp(-expected);
    return [
      {
        ...base,
        player: p.name,
        team: side.team,
        opponent: side.opponent,
        position: p.position,
        probability,
        fairOdds: 1 / probability,
        expected,
        per90: (p.shotsOn / p.minutes) * 90,
        expectedMinutes: m.minutes,
        start: m.start,
        season: { appearances: p.appearances, lineups: p.lineups, minutes: p.minutes, shotsOn: p.shotsOn, goals: p.goals },
        matchFactor,
      },
    ];
  });
}

/** The likeliest players across matches, at most `perTeam` from each team. */
export function topShotPicks(all: ShotPick[], n: number, perTeam = 3): ShotPick[] {
  const taken = new Map<string, number>();
  return [...all]
    .sort((a, b) => b.probability - a.probability || a.player.localeCompare(b.player))
    .filter((p) => {
      const k = `${p.eventId}|${p.team}`;
      const c = taken.get(k) ?? 0;
      if (c >= perTeam) return false;
      taken.set(k, c + 1);
      return true;
    })
    .slice(0, n);
}
