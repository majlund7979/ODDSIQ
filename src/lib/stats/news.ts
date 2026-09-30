// Team news for one match, as stored from the statistics feed: confirmed
// lineups, players listed out or doubtful, and xG (the match's own once
// finished, and each team's recent xG form).

import { teamKey } from "@/lib/model/teams";
import type { InjuryItem, LineupPlayer, Side, TeamLineup } from "./types";

export const XG_FORM_MATCHES = 5;

export interface XgForm {
  n: number;
  xgFor: number;
  xgAgainst: number;
}

export interface TeamNews {
  provider: string;
  syncedAt: number;
  lineups: TeamLineup[];
  lineupsAt: number | null;
  injuries: InjuryItem[];
  injuriesAt: number | null;
  /** This match's xG, once finished and published. */
  xg: { home: number; away: number } | null;
  form: { home: XgForm | null; away: XgForm | null };
}

export interface StoredFixture {
  provider: string;
  kickoff: Date;
  home: string;
  away: string;
  homeXg: number | null;
  awayXg: number | null;
  syncedAt: Date;
  lineupsAt: Date | null;
  injuriesAt: Date | null;
  lineups: { side: string; team: string; formation: string | null; coach: string | null; startXI: unknown; substitutes: unknown }[];
  injuries: { side: string; team: string; player: string; status: string; reason: string }[];
}

/** Average xG for and against over a team's last few matches with xG, before `before`. */
export function xgForm(team: string, history: StoredFixture[], before: number, n = XG_FORM_MATCHES): XgForm | null {
  const key = teamKey(team);
  const rows = history
    .filter((f) => f.homeXg !== null && f.awayXg !== null && f.kickoff.getTime() < before && (teamKey(f.home) === key || teamKey(f.away) === key))
    .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())
    .slice(0, n);
  if (!rows.length) return null;
  const home = (f: StoredFixture) => teamKey(f.home) === key;
  const sum = (g: (f: StoredFixture) => number) => rows.reduce((s, f) => s + g(f), 0) / rows.length;
  return { n: rows.length, xgFor: sum((f) => (home(f) ? f.homeXg! : f.awayXg!)), xgAgainst: sum((f) => (home(f) ? f.awayXg! : f.homeXg!)) };
}

const side = (s: string): Side => (s === "away" ? "away" : "home");

export function teamNews(f: StoredFixture, history: StoredFixture[]): TeamNews {
  const order = (s: string) => (s === "home" ? 0 : 1);
  return {
    provider: f.provider,
    syncedAt: f.syncedAt.getTime(),
    lineups: [...f.lineups]
      .sort((a, b) => order(a.side) - order(b.side))
      .map((l) => ({ side: side(l.side), team: l.team, formation: l.formation, coach: l.coach, startXI: l.startXI as LineupPlayer[], substitutes: l.substitutes as LineupPlayer[] })),
    lineupsAt: f.lineupsAt?.getTime() ?? null,
    injuries: [...f.injuries]
      .sort((a, b) => order(a.side) - order(b.side) || a.status.localeCompare(b.status))
      .map((i) => ({ side: side(i.side), team: i.team, player: i.player, status: i.status === "out" ? "out" : "doubtful", reason: i.reason })),
    injuriesAt: f.injuriesAt?.getTime() ?? null,
    xg: f.homeXg !== null && f.awayXg !== null ? { home: f.homeXg, away: f.awayXg } : null,
    form: { home: xgForm(f.home, history, f.kickoff.getTime()), away: xgForm(f.away, history, f.kickoff.getTime()) },
  };
}
