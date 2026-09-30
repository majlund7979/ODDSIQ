// Provider-neutral shapes for a football statistics feed: fixtures, confirmed
// lineups, injury and suspension lists, and per-match team statistics
// (including expected goals where the provider has them).

export type Side = "home" | "away";

export interface StatsQuota {
  /** Requests left today, per the provider's response headers. */
  remaining: number | null;
  limit: number | null;
}

export interface StatsResponse<T> {
  data: T;
  quota: StatsQuota;
}

export interface StatsFixture {
  id: string;
  leagueId: number;
  kickoff: number;
  home: string;
  away: string;
  status: "scheduled" | "live" | "finished" | "other";
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface LineupPlayer {
  name: string;
  number: number | null;
  /** G, D, M or F. */
  pos: string | null;
}

export interface TeamLineup {
  side: Side;
  team: string;
  formation: string | null;
  coach: string | null;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
}

export interface InjuryItem {
  side: Side;
  team: string;
  player: string;
  /** "out" when the provider lists the player as missing, "doubtful" when questionable. */
  status: "out" | "doubtful";
  reason: string;
}

export interface TeamStats {
  side: Side;
  team: string;
  /** Expected goals; null when the provider has no xG for this league or match. */
  xg: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  /** 0-1 share of possession. */
  possession: number | null;
}

export interface StatsFeed {
  readonly provider: string;
  readonly providerName: string;
  fixtures(leagueId: number, season: number, from: string, to: string): Promise<StatsResponse<StatsFixture[]>>;
  lineups(fixture: StatsFixture): Promise<StatsResponse<TeamLineup[]>>;
  injuries(fixture: StatsFixture): Promise<StatsResponse<InjuryItem[]>>;
  statistics(fixture: StatsFixture): Promise<StatsResponse<TeamStats[]>>;
}
