// The team search: a team's top players per category over the season, summed
// across the competitions the team played (league, cups, Europe), next to
// what they did in the team's last five matches and whether that is above or
// below their own season average.

import type { PlayerMatch } from "@/lib/stats/api-football";
import type { PlayerSeason } from "@/lib/stats/types";

export const RECENT_MATCHES = 5;
/** Recent form counts as above or below the season average outside ±20 %. */
export const FORM_BAND = 0.2;
/** Recent per 90 needs at least one full match of minutes. */
export const RECENT_MIN_MINUTES = 90;

type Counts = Pick<PlayerSeason, "shotsOn" | "goals" | "assists" | "foulsCommitted" | "foulsDrawn">;

export const LEADER_COUNT = 5;
/** Per-90 numbers only for players with at least this many minutes; fewer is too noisy. */
export const PER90_MIN_MINUTES = 270;

export const LEADER_CATEGORIES = [
  { id: "sot", short: "SOT", label: "Skud på mål", value: (p: Counts) => p.shotsOn },
  { id: "goals", short: "Mål", label: "Mål", value: (p: Counts) => p.goals },
  { id: "assists", short: "Assist", label: "Assists", value: (p: Counts) => p.assists ?? 0 },
  { id: "gc", short: "GC", label: "Målinvolveringer (mål + assist)", value: (p: Counts) => p.goals + (p.assists ?? 0) },
  { id: "fc", short: "FC", label: "Frispark begået", value: (p: Counts) => p.foulsCommitted ?? 0 },
  { id: "fw", short: "FW", label: "Frispark vundet", value: (p: Counts) => p.foulsDrawn ?? 0 },
] as const;

export type LeaderCategoryId = (typeof LEADER_CATEGORIES)[number]["id"];

export interface Leader {
  playerId: number;
  name: string;
  position: string | null;
  value: number;
  /** Per 90 minutes; null under PER90_MIN_MINUTES. */
  per90: number | null;
  appearances: number;
  minutes: number;
  /** The team's last matches: what the player did in the ones he played; null when we have none. */
  recent: { matches: number; minutes: number; value: number; per90: number | null } | null;
  /** Recent per 90 against his own season per 90; null without enough minutes in either. */
  form: "over" | "under" | "same" | null;
}

/** Above, below or around the player's own season average. Pure. */
export function formOf(seasonPer90: number | null, recentPer90: number | null): Leader["form"] {
  if (seasonPer90 === null || recentPer90 === null) return null;
  if (seasonPer90 === 0) return recentPer90 > 0 ? "over" : "same";
  const r = recentPer90 / seasonPer90;
  return r > 1 + FORM_BAND ? "over" : r < 1 - FORM_BAND ? "under" : "same";
}

/** One row per player: the season summed over every competition. Pure. */
export function mergeCompetitions(rows: PlayerSeason[]): PlayerSeason[] {
  const by = new Map<number, PlayerSeason>();
  for (const r of rows) {
    const a = by.get(r.playerId);
    if (!a) {
      by.set(r.playerId, { ...r, assists: r.assists ?? 0, foulsCommitted: r.foulsCommitted ?? 0, foulsDrawn: r.foulsDrawn ?? 0 });
      continue;
    }
    a.appearances += r.appearances;
    a.lineups += r.lineups;
    a.minutes += r.minutes;
    a.shotsOn += r.shotsOn;
    a.shotsTotal += r.shotsTotal;
    a.goals += r.goals;
    a.assists = (a.assists ?? 0) + (r.assists ?? 0);
    a.foulsCommitted = (a.foulsCommitted ?? 0) + (r.foulsCommitted ?? 0);
    a.foulsDrawn = (a.foulsDrawn ?? 0) + (r.foulsDrawn ?? 0);
    a.position ??= r.position;
    a.injured ||= r.injured;
  }
  return [...by.values()];
}

/** Top players per category, highest total first, ties broken by per-90 then fewer minutes. Players on 0 are left out. Pure. */
export function teamLeaders(players: PlayerSeason[], recentMatches: PlayerMatch[] = [], count = LEADER_COUNT): Record<LeaderCategoryId, Leader[]> {
  const merged = mergeCompetitions(players);
  const recentBy = new Map<number, PlayerMatch[]>();
  for (const m of recentMatches) recentBy.set(m.playerId, [...(recentBy.get(m.playerId) ?? []), m]);
  return Object.fromEntries(
    LEADER_CATEGORIES.map((c) => [
      c.id,
      merged
        .map((p) => {
          const ms = recentBy.get(p.playerId);
          const minutes = ms?.reduce((n, m) => n + m.minutes, 0) ?? 0;
          const value = ms?.reduce((n, m) => n + c.value(m), 0) ?? 0;
          const per90 = p.minutes >= PER90_MIN_MINUTES ? (c.value(p) * 90) / p.minutes : null;
          const recent = ms ? { matches: ms.length, minutes, value, per90: minutes >= RECENT_MIN_MINUTES ? (value * 90) / minutes : null } : null;
          return { playerId: p.playerId, name: p.name, position: p.position, value: c.value(p), per90, appearances: p.appearances, minutes: p.minutes, recent, form: formOf(per90, recent?.per90 ?? null) };
        })
        .filter((l) => l.value > 0)
        .sort((a, b) => b.value - a.value || (b.per90 ?? 0) - (a.per90 ?? 0) || a.minutes - b.minutes)
        .slice(0, count),
    ]),
  ) as Record<LeaderCategoryId, Leader[]>;
}

/** Search text as the provider accepts it: letters, digits and spaces, at least 3 characters. */
export function cleanQuery(q: string | undefined): string | null {
  const s = (q ?? "").normalize("NFC").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return s.length >= 3 ? s : null;
}
