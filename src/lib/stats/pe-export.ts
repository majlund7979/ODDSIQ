// Flattens API-Football fixtures (from /fixtures?ids=, which embeds statistics,
// lineups and events) into compact rows for the prediction engine's backfill:
// xG and team stats per side, starting elevens and red cards. Read-only; the
// rows are written to a branch by the "PE export" workflow, not to the database.

import type { RawFixture, RawLineup, RawStatistics } from "./api-football";

export interface RawFixtureDetail extends RawFixture {
  score?: { halftime?: { home: number | null; away: number | null } };
  statistics?: RawStatistics[];
  lineups?: (Omit<RawLineup, "startXI" | "substitutes"> & { startXI: { player: { id?: number | null; name: string; pos: string | null } }[] })[];
  events?: { time: { elapsed: number | null }; team: { id: number }; type: string; detail: string }[];
}

/** Team-stat types kept, API name → column suffix. */
export const STAT_COLUMNS: Record<string, string> = {
  expected_goals: "xg",
  goals_prevented: "goals_prevented",
  "Total Shots": "shots",
  "Shots on Goal": "shots_on_target",
  "Shots insidebox": "shots_inside_box",
  "Blocked Shots": "shots_blocked",
  "Corner Kicks": "corners",
  Fouls: "fouls",
  "Yellow Cards": "yellow",
  "Red Cards": "red",
  "Ball Possession": "possession",
  "Passes %": "pass_accuracy",
  "Goalkeeper Saves": "saves",
};

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : null;
};

export type ExportRow = Record<string, string | number | null>;

export function exportRow(f: RawFixtureDetail): ExportRow {
  const row: ExportRow = {
    fixture_id: f.fixture.id,
    league_id: f.league.id,
    season: f.league.season,
    kickoff: f.fixture.date,
    status: f.fixture.status.short,
    referee: f.fixture.referee ?? null,
    home_id: f.teams.home.id,
    home: f.teams.home.name,
    away_id: f.teams.away.id,
    away: f.teams.away.name,
    home_goals: f.goals.home,
    away_goals: f.goals.away,
    home_goals_ht: f.score?.halftime?.home ?? null,
    away_goals_ht: f.score?.halftime?.away ?? null,
  };
  for (const side of ["home", "away"] as const) {
    const teamId = f.teams[side].id;
    const stats = f.statistics?.find((s) => s.team.id === teamId);
    for (const [type, col] of Object.entries(STAT_COLUMNS)) {
      row[`${side}_${col}`] = num(stats?.statistics.find((s) => s.type === type)?.value);
    }
    const lineup = f.lineups?.find((l) => l.team.id === teamId);
    row[`${side}_formation`] = lineup?.formation ?? null;
    row[`${side}_coach`] = lineup?.coach?.name ?? null;
    row[`${side}_xi`] = lineup ? lineup.startXI.map((p) => p.player.id ?? p.player.name).join(";") : null;
    const reds = (f.events ?? []).filter((e) => e.team.id === teamId && e.type === "Card" && /red/i.test(e.detail));
    row[`${side}_first_red_min`] = reds.length ? Math.min(...reds.map((e) => e.time.elapsed ?? 90)) : null;
  }
  return row;
}

const FINISHED = new Set(["FT", "AET", "PEN"]);
export const isFinished = (f: RawFixture) => FINISHED.has(f.fixture.status.short);

export function toCsv(rows: ExportRow[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c] ?? null)).join(","))].join("\n") + "\n";
}
