// Each team's top scorer for the goal bets (Mads, 2026-10-05): whether he is
// missing, and whether he is scoring more or less than usual lately. On over
// 1,5 and over/under 2,5 mål it moves the team's expected goals: a missing top
// scorer takes part of his share of the team's goals with him, and his recent
// form nudges it up or down. Estimated (model topscorer-v1), from API-Football's
// season totals (all competitions stored) and his last matches.

import { normalizeName as teamKey } from "@/lib/model/teams";
import type { PlayerMatch } from "@/lib/stats/api-football";
import type { InjuryItem, PlayerSeason, TeamLineup } from "@/lib/stats/types";

export const TOP_SCORER_MODEL = "topscorer-v1";
/** At least this many goals this season before a player counts as the team's top scorer. */
export const TOP_SCORER_MIN_GOALS = 3;
/** His share of the team's goals is capped here, so one player never carries the whole attack. */
export const TOP_SCORER_MAX_SHARE = 0.5;
/** A missing top scorer takes this part of his share with him; the replacement scores the rest. */
export const TOP_SCORER_ABSENCE = 0.5;
/** Recent form needs this many minutes in his last matches. */
export const TOP_SCORER_FORM_MINUTES = 180;
/** How much of his share his form moves (recent goals per 90 against the season's, ratio capped at 0,5–1,5). */
export const TOP_SCORER_FORM = 0.4;

export interface TopScorer {
  name: string;
  goals: number;
  minutes: number;
  /** His goals over the team's goals this season (capped at TOP_SCORER_MAX_SHARE). */
  share: number;
  /**
   * "out" or "doubtful" from the injury list; "starts" when he is in the confirmed starting XI, "bench" when the
   * lineups are out without him; null when nothing is known.
   */
  status: "out" | "doubtful" | "starts" | "bench" | null;
  /** His last matches: goals and minutes, with goals per 90 against the season's. */
  recent: { matches: number; minutes: number; goals: number; ratio: number } | null;
  /** Factor on the team's expected goals (1 = no change). */
  factor: number;
  /** The injury list's name for him, so the general absences do not count him twice. */
  injuryPlayer: string | null;
}

const per90 = (goals: number, minutes: number) => (minutes > 0 ? (goals * 90) / minutes : 0);

/**
 * The top scorer from one team's season rows (summed over competitions per player), with his status from
 * the team news and his form from his last matches; null when no one has TOP_SCORER_MIN_GOALS.
 */
export function topScorer(players: PlayerSeason[], recent: PlayerMatch[], side: { injuries: InjuryItem[]; lineup: TeamLineup | null }): TopScorer | null {
  const byPlayer = new Map<number, { name: string; goals: number; minutes: number; injured: boolean }>();
  for (const p of players) {
    const a = byPlayer.get(p.playerId) ?? { name: p.name, goals: 0, minutes: 0, injured: false };
    a.goals += p.goals;
    a.minutes += p.minutes;
    a.injured ||= p.injured;
    byPlayer.set(p.playerId, a);
  }
  let best: [number, { name: string; goals: number; minutes: number; injured: boolean }] | null = null;
  for (const e of byPlayer) if (!best || e[1].goals > best[1].goals || (e[1].goals === best[1].goals && e[1].minutes < best[1].minutes)) best = e;
  if (!best || best[1].goals < TOP_SCORER_MIN_GOALS) return null;
  const [id, s] = best;
  const teamGoals = [...byPlayer.values()].reduce((t, p) => t + p.goals, 0);
  const share = Math.min(TOP_SCORER_MAX_SHARE, s.goals / Math.max(1, teamGoals));

  const key = teamKey(s.name);
  const named = (n: string) => {
    const k = teamKey(n);
    // Feeds abbreviate first names ("E. Haaland"), so match on the surname too.
    return k === key || k.split(" ").at(-1) === key.split(" ").at(-1);
  };
  const starts = side.lineup?.startXI.some((p) => named(p.name)) ?? false;
  const injury = side.injuries.find((i) => named(i.player));
  const status: TopScorer["status"] = starts ? "starts" : injury ? injury.status : side.lineup ? "bench" : null;

  const mine = recent.filter((m) => m.playerId === id);
  const rMinutes = mine.reduce((t, m) => t + m.minutes, 0);
  const rGoals = mine.reduce((t, m) => t + m.goals, 0);
  const season = per90(s.goals, s.minutes);
  const recentForm =
    mine.length && rMinutes >= TOP_SCORER_FORM_MINUTES && season > 0
      ? { matches: mine.length, minutes: rMinutes, goals: rGoals, ratio: Math.min(1.5, Math.max(0.5, per90(rGoals, rMinutes) / season)) }
      : null;

  let factor = 1;
  // On the bench he may still come on: most of the absence, not all of it.
  if (status === "out") factor = 1 - TOP_SCORER_ABSENCE * share;
  else if (status === "bench") factor = 1 - 0.75 * TOP_SCORER_ABSENCE * share;
  else if (status === "doubtful") factor = 1 - (TOP_SCORER_ABSENCE * share) / 2;
  else if (recentForm) factor = 1 + TOP_SCORER_FORM * share * (recentForm.ratio - 1);
  return { name: s.name, goals: s.goals, minutes: s.minutes, share, status, recent: recentForm, factor, injuryPlayer: injury?.player ?? null };
}
