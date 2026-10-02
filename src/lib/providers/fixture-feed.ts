// Offline feed over recorded The Odds API responses, for tests and the CI
// ingestion check. Costs no credits and needs no key.

import sports from "./fixtures/sports.json";
import odds from "./fixtures/odds-soccer_epl.json";
import scores from "./fixtures/scores-soccer_epl.json";
import { normalizeOdds, normalizeScores, normalizeSports } from "./the-odds-api";
import type { FeedQuota, OddsFeed } from "./types";

export const FIXTURE_KICKOFF = Date.parse("2026-10-03T14:00:00Z");
const quota: FeedQuota = { used: null, remaining: null, last: 0 };

export class FixtureFeed implements OddsFeed {
  readonly provider = "the-odds-api";
  readonly providerName = "The Odds API (recorded fixture)";
  /** priceFactor multiplies every price, to simulate a later snapshot; shiftMs moves every kickoff; inPlayScore reports the first match as still in play at that score. */
  constructor(
    private readonly priceFactor = 1,
    private readonly shiftMs = 0,
    private readonly inPlayScore?: { home: number; away: number },
  ) {}

  async competitions() {
    return { data: normalizeSports(sports), quota };
  }
  async odds(key: string) {
    const events = key === "soccer_epl" ? normalizeOdds(odds) : [];
    return { data: events.map((e) => ({ ...e, kickoff: e.kickoff + this.shiftMs, prices: e.prices.map((p) => ({ ...p, odds: Math.round(p.odds * this.priceFactor * 100) / 100 })) })), quota };
  }
  async upcoming(key: string) {
    return { data: (await this.odds(key)).data.map((e) => e.kickoff), quota };
  }
  async results(key: string) {
    const rows = key === "soccer_epl" ? normalizeScores(scores).map((r) => ({ ...r, kickoff: r.kickoff + this.shiftMs })) : [];
    const live = this.inPlayScore;
    return { data: live ? rows.map((r, i) => (i === 0 ? { ...r, completed: false, homeScore: live.home, awayScore: live.away } : r)) : rows, quota };
  }
}
