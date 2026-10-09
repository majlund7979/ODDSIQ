// Read-only survey of what API-Football returns on this plan, for the prediction
// engine's data analysis (step 1). For each covered competition it lists the
// plan's coverage flags for the current season; for one finished and one
// upcoming match it lists every field path each endpoint returns, with its type,
// fill rate and one example. Spends about 60 requests of the daily allowance and
// stores nothing. Run from GitHub Actions ("API probe" workflow).
// Call with `Authorization: Bearer $CRON_SECRET`.

import { cronAuthorized } from "@/lib/auth/cron";
import { AF_COMPETITIONS } from "@/lib/providers/api-football-odds";
import { apiFootballGet } from "@/lib/stats/api-football";
import { describeShape } from "@/lib/stats/api-shape";

export const maxDuration = 60;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface RawLeagueCoverage {
  league: { id: number; name: string };
  seasons: { year: number; current: boolean; start: string; end: string; coverage: Record<string, unknown> }[];
}
interface RawFixtureRef {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; season: number };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
}

export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return new Response("Unauthorized.", { status: 401 });
  const apiKey = process.env.STATS_API_KEY;
  if (!apiKey) return Response.json({ error: "no STATS_API_KEY" });
  const url = new URL(req.url);
  const leagueId = Number(url.searchParams.get("league") ?? 39);
  const opts = { apiKey, wait: async () => {} };
  let used = 0;
  let remaining: string | null = null;
  const get = async <T,>(path: string, params: Record<string, string | number>) => {
    used += 1;
    const r = await apiFootballGet<T>(path, params, opts);
    remaining = r.headers.get("x-ratelimit-requests-remaining") ?? remaining;
    return r.body;
  };
  const shape = async (path: string, params: Record<string, string | number>) => {
    try {
      const body = await get<unknown>(path, params);
      return { results: body.results, paging: body.paging ?? null, fields: describeShape(body.response) };
    } catch (e) {
      return { error: message(e) };
    }
  };

  // Coverage flags per competition (current season).
  const coverage: Record<string, unknown> = {};
  await Promise.all(
    AF_COMPETITIONS.map(async (c) => {
      try {
        const body = await get<RawLeagueCoverage>("/leagues", { id: c.leagueId, current: "true" });
        const s = body.response[0]?.seasons.find((x) => x.current) ?? body.response[0]?.seasons.at(-1);
        coverage[`${c.leagueId} ${c.name}`] = s ? { season: s.year, start: s.start, end: s.end, coverage: s.coverage } : "no season";
      } catch (e) {
        coverage[`${c.leagueId} ${c.name}`] = { error: message(e) };
      }
    }),
  );

  // One finished and one upcoming match in the chosen league.
  const out: Record<string, unknown> = { leagueId, coverage };
  try {
    const last = await get<RawFixtureRef>("/fixtures", { league: leagueId, last: 1 });
    const next = await get<RawFixtureRef>("/fixtures", { league: leagueId, next: 1 });
    const done = last.response[0];
    const soon = next.response[0];
    out.finished = done ? `${done.fixture.id} ${done.fixture.date} ${done.teams.home.name} vs ${done.teams.away.name}` : null;
    out.upcoming = soon ? `${soon.fixture.id} ${soon.fixture.date} ${soon.teams.home.name} vs ${soon.teams.away.name}` : null;
    const endpoints: Record<string, unknown> = {};
    if (done) {
      const f = done.fixture.id;
      const season = done.league.season;
      const home = done.teams.home.id;
      const away = done.teams.away.id;
      // /fixtures?id= embeds events, lineups, statistics and players for the match.
      endpoints["/fixtures?id (finished, full)"] = await shape("/fixtures", { id: f });
      endpoints["/fixtures/statistics?half"] = await shape("/fixtures/statistics", { fixture: f, half: "true" });
      endpoints["/odds (finished; history?)"] = await shape("/odds", { fixture: f });
      endpoints["/predictions"] = await shape("/predictions", { fixture: f });
      endpoints["/injuries?fixture"] = await shape("/injuries", { fixture: f });
      endpoints["/fixtures/headtohead"] = await shape("/fixtures/headtohead", { h2h: `${home}-${away}`, last: 10 });
      endpoints["/teams/statistics"] = await shape("/teams/statistics", { league: leagueId, season, team: home });
      endpoints["/standings"] = await shape("/standings", { league: leagueId, season });
      endpoints["/players?team (page 1)"] = await shape("/players", { team: home, season });
      endpoints["/players/squads"] = await shape("/players/squads", { team: home });
      endpoints["/players/topscorers"] = await shape("/players/topscorers", { league: leagueId, season });
      endpoints["/coachs"] = await shape("/coachs", { team: home });
      endpoints["/teams?id"] = await shape("/teams", { id: away });
      endpoints["/transfers"] = await shape("/transfers", { team: home });
      endpoints["/fixtures/rounds"] = await shape("/fixtures/rounds", { league: leagueId, season, current: "true" });
      endpoints["/venues"] = await shape("/venues", { id: (await get<{ fixture: { venue: { id: number | null } } }>("/fixtures", { id: f })).response[0]?.fixture.venue.id ?? 0 });
    }
    if (soon) {
      endpoints["/odds (upcoming)"] = await shape("/odds", { fixture: soon.fixture.id });
      endpoints["/injuries (upcoming)"] = await shape("/injuries", { fixture: soon.fixture.id });
      endpoints["/predictions (upcoming)"] = await shape("/predictions", { fixture: soon.fixture.id });
    }
    endpoints["/odds/bets (market list)"] = await shape("/odds/bets", {});
    endpoints["/odds/bookmakers"] = await shape("/odds/bookmakers", {});
    endpoints["/odds/live/bets"] = await shape("/odds/live/bets", {});
    endpoints["/odds/mapping (page 1)"] = await shape("/odds/mapping", {});
    endpoints["/fixtures?live=all"] = await shape("/fixtures", { live: "all" });
    endpoints["/odds/live"] = await shape("/odds/live", {});
    endpoints["/status"] = await shape("/status", {});
    out.endpoints = endpoints;
  } catch (e) {
    out.error = message(e);
  }
  return Response.json({ ...out, requestsUsed: used, requestsRemaining: remaining });
}
