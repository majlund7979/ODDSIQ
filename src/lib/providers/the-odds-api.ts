// Adapter for The Odds API v4 (https://the-odds-api.com). Prices are decimal.
// Credit cost per odds call is (markets × regions); /sports is free; /scores
// costs 1, or 2 with daysFrom. Remaining credits come back in response headers.

import type { FeedCompetition, FeedEvent, FeedMarketType, FeedPrice, FeedQuota, FeedResponse, FeedResult, OddsFeed } from "./types";

export const THE_ODDS_API = "the-odds-api";
const BASE = "https://api.the-odds-api.com/v4";

/** The Odds API sport_key prefix → ODDSIQ sport id. */
const SPORT_PREFIX: [string, string][] = [
  ["soccer_", "football"],
  ["basketball_", "basketball"],
  ["tennis_", "tennis"],
  ["americanfootball_", "american-football"],
  ["icehockey_", "ice-hockey"],
];

export function sportIdFor(sportKey: string): string {
  return SPORT_PREFIX.find(([p]) => sportKey.startsWith(p))?.[1] ?? sportKey.split("_")[0];
}

interface RawSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}
interface RawOutcome {
  name: string;
  price: number;
  point?: number;
}
interface RawEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: { key: string; title: string; last_update: string; markets: { key: string; outcomes: RawOutcome[] }[] }[];
}
interface RawScore {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}

export function normalizeSports(raw: RawSport[]): FeedCompetition[] {
  return raw.filter((s) => !s.has_outrights).map((s) => ({ key: s.key, sportId: sportIdFor(s.key), name: s.description || s.title, group: s.group, active: s.active }));
}

function outcomeKey(name: string, e: RawEvent): string | null {
  if (name === e.home_team) return "home";
  if (name === e.away_team) return "away";
  if (name === "Draw") return "draw";
  return null;
}

/** Converts events to feed prices: h2h → 1X2 (football, three outcomes) or ML; totals at 2.5 → OU25. Anything else is skipped. */
export function normalizeOdds(raw: RawEvent[]): FeedEvent[] {
  return raw.map((e) => {
    const football = sportIdFor(e.sport_key) === "football";
    const prices: FeedPrice[] = [];
    for (const b of e.bookmakers ?? []) {
      const lastUpdate = Date.parse(b.last_update);
      for (const m of b.markets) {
        let market: FeedMarketType | null = null;
        let rows: { selection: string; odds: number }[] = [];
        if (m.key === "h2h") {
          market = football ? "1X2" : "ML";
          rows = m.outcomes.map((o) => ({ selection: outcomeKey(o.name, e) ?? "", odds: o.price }));
          const expected = football ? ["home", "draw", "away"] : ["home", "away"];
          if (rows.length !== expected.length || !expected.every((k) => rows.some((r) => r.selection === k))) continue;
        } else if (m.key === "totals" && football) {
          market = "OU25";
          rows = m.outcomes.filter((o) => o.point === 2.5).map((o) => ({ selection: o.name.toLowerCase(), odds: o.price }));
          if (rows.length !== 2 || !rows.some((r) => r.selection === "over") || !rows.some((r) => r.selection === "under")) continue;
        }
        if (!market || rows.some((r) => !(r.odds > 1))) continue;
        for (const r of rows) prices.push({ bookmakerKey: b.key, bookmakerName: b.title, lastUpdate, market, selection: r.selection, odds: r.odds });
      }
    }
    return { externalId: e.id, competitionKey: e.sport_key, kickoff: Date.parse(e.commence_time), home: e.home_team, away: e.away_team, prices };
  });
}

export function normalizeScores(raw: RawScore[]): FeedResult[] {
  return raw.map((s) => {
    const score = (team: string) => {
      const v = s.scores?.find((x) => x.name === team)?.score;
      return v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
    };
    return {
      externalId: s.id,
      competitionKey: s.sport_key,
      kickoff: Date.parse(s.commence_time),
      completed: s.completed,
      home: s.home_team,
      away: s.away_team,
      homeScore: score(s.home_team),
      awayScore: score(s.away_team),
    };
  });
}

export function quotaFrom(headers: Headers): FeedQuota {
  const n = (k: string) => {
    const v = headers.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  return { used: n("x-requests-used"), remaining: n("x-requests-remaining"), last: n("x-requests-last") };
}

export interface TheOddsApiOptions {
  apiKey: string;
  regions: string;
  markets: string;
  fetchImpl?: typeof fetch;
}

export class TheOddsApiFeed implements OddsFeed {
  readonly provider = THE_ODDS_API;
  readonly providerName = "The Odds API";
  constructor(private readonly opts: TheOddsApiOptions) {}

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<FeedResponse<T>> {
    const url = new URL(BASE + path);
    url.searchParams.set("apiKey", this.opts.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await (this.opts.fetchImpl ?? fetch)(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Never echo the URL: it carries the API key.
      throw new Error(`The Odds API ${path} returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    return { data: (await res.json()) as T, quota: quotaFrom(res.headers) };
  }

  async competitions() {
    const r = await this.get<RawSport[]>("/sports", { all: "true" });
    return { data: normalizeSports(r.data), quota: r.quota };
  }

  async odds(competitionKey: string) {
    const r = await this.get<RawEvent[]>(`/sports/${encodeURIComponent(competitionKey)}/odds`, { regions: this.opts.regions, markets: this.opts.markets, oddsFormat: "decimal", dateFormat: "iso" });
    return { data: normalizeOdds(r.data), quota: r.quota };
  }

  async results(competitionKey: string, daysFrom: number) {
    const r = await this.get<RawScore[]>(`/sports/${encodeURIComponent(competitionKey)}/scores`, { daysFrom: String(daysFrom), dateFormat: "iso" });
    return { data: normalizeScores(r.data), quota: r.quota };
  }
}
