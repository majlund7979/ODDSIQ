// Offline statistics feed over test responses in API-Football's format, for
// tests and the CI ingestion check. It replays them against a clock: a match
// is live from kickoff, finished two hours later, lineups appear an hour
// before kickoff and statistics once the match is finished.

import data from "./fixtures/api-football.json";
import { normalizeFixtures, normalizeInjuries, normalizeLineups, normalizeStatistics, type RawFixture, type RawInjury, type RawLineup, type RawStatistics } from "./api-football";
import type { StatsFeed, StatsFixture, StatsQuota } from "./types";

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
}
