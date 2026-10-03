// Offline statistics feed over test responses in API-Football's format, for
// tests and the CI ingestion check. It replays them against a clock: a match
// is live from kickoff, finished two hours later, lineups appear an hour
// before kickoff and statistics once the match is finished. Squads are a
// made-up striker, midfielder and keeper per team.

import data from "./fixtures/api-football.json";
import { normalizeFixtures, normalizeInjuries, normalizeLineups, normalizeStatistics, type RawFixture, type RawInjury, type RawLineup, type RawStatistics } from "./api-football";
import type { PlayerSeason, StatsFeed, StatsFixture, StatsQuota } from "./types";

const quota: StatsQuota = { remaining: null, limit: null };
const HOUR = 3_600_000;

export class StatsFixtureFeed implements StatsFeed {
  readonly provider = "api-football";
  readonly providerName = "API-Football (test fixture)";
  constructor(private readonly at: number) {}

  async fixtures(leagueId: number) {
    const all = normalizeFixtures(data.fixtures as RawFixture[]).filter((f) => f.leagueId === leagueId);
    const out: StatsFixture[] = all.map((f) => {
      const finished = this.at >= f.kickoff + 2 * HOUR;
      return { ...f, status: finished ? "finished" : this.at >= f.kickoff ? "live" : "scheduled", homeGoals: finished ? f.homeGoals : null, awayGoals: finished ? f.awayGoals : null };
    });
    return { data: out, quota };
  }
  async lineups(f: StatsFixture) {
    const raw = this.at >= f.kickoff - HOUR ? ((data.lineups as Record<string, RawLineup[]>)[f.id] ?? []) : [];
    return { data: normalizeLineups(raw, f), quota };
  }
  async injuries(f: StatsFixture) {
    return { data: normalizeInjuries((data.injuries as Record<string, RawInjury[]>)[f.id] ?? [], f), quota };
  }
  async statistics(f: StatsFixture) {
    const raw = f.status === "finished" ? ((data.statistics as Record<string, RawStatistics[]>)[f.id] ?? []) : [];
    return { data: normalizeStatistics(raw, f), quota };
  }
  async players(teamId: number) {
    const squad: PlayerSeason[] = [
      { playerId: teamId * 100 + 9, name: `Striker ${teamId}`, position: "Attacker", appearances: 6, lineups: 6, minutes: 520, shotsOn: 9, shotsTotal: 17, goals: 4, injured: false },
      { playerId: teamId * 100 + 8, name: `Midfielder ${teamId}`, position: "Midfielder", appearances: 6, lineups: 5, minutes: 450, shotsOn: 2, shotsTotal: 6, goals: 0, injured: false },
      { playerId: teamId * 100 + 1, name: `Keeper ${teamId}`, position: "Goalkeeper", appearances: 6, lineups: 6, minutes: 540, shotsOn: 0, shotsTotal: 0, goals: 0, injured: false },
    ];
    return { data: squad, quota, pages: 1 };
  }
}
