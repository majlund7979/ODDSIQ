// Adapter for API-Football v3 (https://www.api-football.com). Every call costs
// one request from the daily allowance; the remaining allowance comes back in
// the x-ratelimit-requests-* headers. Errors come back with HTTP 200 and a
// non-empty `errors` field (for example a plan that does not cover a season).

import type { InjuryItem, LineupPlayer, PlayerSeason, Side, StatsFeed, StatsFixture, StatsQuota, StatsResponse, TeamLineup, TeamStats } from "./types";

export const API_FOOTBALL = "api-football";
const BASE = "https://v3.football.api-sports.io";

interface Envelope<T> {
  errors: unknown[] | Record<string, string>;
  results: number;
  response: T[];
  paging?: { current: number; total: number };
}
interface RawTeam {
  id: number;
  name: string;
}
export interface RawFixture {
  fixture: { id: number; date: string; timestamp: number; status: { short: string }; referee?: string | null };
  league: { id: number; season: number };
  teams: { home: RawTeam; away: RawTeam };
  goals: { home: number | null; away: number | null };
}
interface RawPlayer {
  player: { name: string; number: number | null; pos: string | null };
}
export interface RawLineup {
  team: RawTeam;
  formation: string | null;
  coach: { name: string | null } | null;
  startXI: RawPlayer[];
  substitutes: RawPlayer[];
}
export interface RawInjury {
  player: { name: string; type: string; reason: string | null };
  team: RawTeam;
  fixture: { id: number };
}
export interface RawStatistics {
  team: RawTeam;
  statistics: { type: string; value: number | string | null }[];
}

export interface RawPlayerStats {
  player: { id: number; name: string; injured?: boolean | null };
  statistics: {
    team: { id: number };
    league: { id: number | null };
    games: { appearences: number | null; lineups: number | null; minutes: number | null; position: string | null };
    shots: { total: number | null; on: number | null };
    goals: { total: number | null };
  }[];
}

const FINISHED = new Set(["FT", "AET", "PEN"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
const SCHEDULED = new Set(["TBD", "NS"]);

export function normalizeFixtures(raw: RawFixture[]): StatsFixture[] {
  return raw.map((f) => {
    const s = f.fixture.status.short;
    return {
      id: String(f.fixture.id),
      leagueId: f.league.id,
      kickoff: f.fixture.timestamp * 1000,
      home: f.teams.home.name,
      away: f.teams.away.name,
      status: FINISHED.has(s) ? "finished" : LIVE.has(s) ? "live" : SCHEDULED.has(s) ? "scheduled" : "other",
      homeGoals: f.goals.home,
      awayGoals: f.goals.away,
      referee: f.fixture.referee ?? null,
      homeId: f.teams.home.id ?? null,
      awayId: f.teams.away.id ?? null,
    };
  });
}

/** Which side a provider team belongs to, by id first and name second. */
function sideOf(team: RawTeam, fixture: StatsFixture, ids?: { home: number; away: number }): Side | null {
  if (ids && team.id === ids.home) return "home";
  if (ids && team.id === ids.away) return "away";
  if (team.name === fixture.home) return "home";
  if (team.name === fixture.away) return "away";
  return null;
}

const player = (p: RawPlayer): LineupPlayer => ({ name: p.player.name, number: p.player.number ?? null, pos: p.player.pos ?? null });

export function normalizeLineups(raw: RawLineup[], fixture: StatsFixture): TeamLineup[] {
  return raw.flatMap((l) => {
    const side = sideOf(l.team, fixture);
    if (!side || !l.startXI?.length) return [];
    return [{ side, team: l.team.name, formation: l.formation ?? null, coach: l.coach?.name ?? null, startXI: l.startXI.map(player), substitutes: (l.substitutes ?? []).map(player) }];
  });
}

export function normalizeInjuries(raw: RawInjury[], fixture: StatsFixture): InjuryItem[] {
  return raw.flatMap((i) => {
    const side = sideOf(i.team, fixture);
    if (!side || String(i.fixture.id) !== fixture.id) return [];
    return [{ side, team: i.team.name, player: i.player.name, status: i.player.type === "Missing Fixture" ? "out" : "doubtful", reason: i.player.reason ?? "Not given" }];
  });
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeStatistics(raw: RawStatistics[], fixture: StatsFixture): TeamStats[] {
  return raw.flatMap((t) => {
    const side = sideOf(t.team, fixture);
    if (!side) return [];
    const get = (type: string) => t.statistics.find((s) => s.type === type)?.value ?? null;
    const possession = num(get("Ball Possession"));
    return [{ side, team: t.team.name, xg: num(get("expected_goals")), shots: num(get("Total Shots")), shotsOnTarget: num(get("Shots on Goal")), possession: possession === null ? null : possession / 100 }];
  });
}

/** Season totals for this team in this league; players without a minute are left out. */
export function normalizePlayers(raw: RawPlayerStats[], teamId: number, leagueId: number): PlayerSeason[] {
  return raw.flatMap((p) => {
    const s = p.statistics.find((x) => x.team.id === teamId && x.league.id === leagueId);
    if (!s || !s.games.minutes) return [];
    return [
      {
        playerId: p.player.id,
        name: p.player.name,
        position: s.games.position ?? null,
        appearances: s.games.appearences ?? 0,
        lineups: s.games.lineups ?? 0,
        minutes: s.games.minutes,
        shotsOn: s.shots.on ?? 0,
        shotsTotal: s.shots.total ?? 0,
        goals: s.goals.total ?? 0,
        injured: Boolean(p.player.injured),
      },
    ];
  });
}

/** API-Football seasons are named by their starting year; European leagues start in July or August. */
export function seasonFor(at: number): number {
  const d = new Date(at);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export class ApiFootballFeed implements StatsFeed {
  readonly provider = API_FOOTBALL;
  readonly providerName = "API-Football";
  constructor(
    private readonly opts: { apiKey: string; fetchImpl?: typeof fetch },
  ) {}

  private async get<T>(path: string, params: Record<string, string | number>): Promise<StatsResponse<T[]> & { pages: number }> {
    const url = `${BASE}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    const res = await (this.opts.fetchImpl ?? fetch)(url, { headers: { "x-apisports-key": this.opts.apiKey }, cache: "no-store" });
    const header = (k: string) => {
      const v = res.headers.get(k);
      return v === null ? null : Number(v);
    };
    const quota: StatsQuota = { remaining: header("x-ratelimit-requests-remaining"), limit: header("x-ratelimit-requests-limit") };
    if (!res.ok) throw new Error(`API-Football ${path} returned HTTP ${res.status}.`);
    const body = (await res.json()) as Envelope<T>;
    const errors = Array.isArray(body.errors) ? body.errors.map(String) : Object.values(body.errors ?? {});
    if (errors.length) throw new Error(`API-Football ${path}: ${errors.join("; ")}`);
    return { data: body.response ?? [], quota, pages: body.paging?.total ?? 1 };
  }

  async fixtures(leagueId: number, season: number, from: string, to: string) {
    const r = await this.get<RawFixture>("/fixtures", { league: leagueId, season, from, to });
    return { data: normalizeFixtures(r.data), quota: r.quota };
  }
  async lineups(f: StatsFixture) {
    const r = await this.get<RawLineup>("/fixtures/lineups", { fixture: f.id });
    return { data: normalizeLineups(r.data, f), quota: r.quota };
  }
  async injuries(f: StatsFixture) {
    const r = await this.get<RawInjury>("/injuries", { fixture: f.id });
    return { data: normalizeInjuries(r.data, f), quota: r.quota };
  }
  async statistics(f: StatsFixture) {
    const r = await this.get<RawStatistics>("/fixtures/statistics", { fixture: f.id });
    return { data: normalizeStatistics(r.data, f), quota: r.quota };
  }
  async players(teamId: number, leagueId: number, season: number, page: number) {
    const r = await this.get<RawPlayerStats>("/players", { team: teamId, league: leagueId, season, page });
    return { data: normalizePlayers(r.data, teamId, leagueId), quota: r.quota, pages: r.pages };
  }
}
