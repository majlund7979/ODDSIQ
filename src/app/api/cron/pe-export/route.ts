// Read-only export of finished matches for the prediction engine's backfill
// (xG, team stats, starting elevens, red cards) for one competition and season.
// Called page by page from GitHub Actions ("PE export" workflow), which stores
// the CSV on a branch. Costs one request for the fixture list plus one per 20
// matches (?ids= embeds statistics, lineups and events); stores nothing.
// Call with `Authorization: Bearer $CRON_SECRET`.

import { cronAuthorized } from "@/lib/auth/cron";
import { apiFootballGet, type RawFixture } from "@/lib/stats/api-football";
import { exportRow, isFinished, toCsv, type RawFixtureDetail } from "@/lib/stats/pe-export";

export const maxDuration = 60;

/** Matches per page: 10 requests, well inside the 60-second limit. */
const PAGE_SIZE = 200;
const IDS_PER_CALL = 20;

export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return new Response("Unauthorized.", { status: 401 });
  const apiKey = process.env.STATS_API_KEY;
  if (!apiKey) return Response.json({ error: "no STATS_API_KEY" }, { status: 500 });
  const url = new URL(req.url);
  const league = Number(url.searchParams.get("league"));
  const season = Number(url.searchParams.get("season"));
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  if (!Number.isInteger(league) || !Number.isInteger(season) || league <= 0 || season < 2000) {
    return Response.json({ error: "league and season are required" }, { status: 400 });
  }
  const opts = { apiKey };
  let remaining: string | null = null;
  const get = async <T,>(params: Record<string, string | number>) => {
    const r = await apiFootballGet<T>("/fixtures", params, opts);
    remaining = r.headers.get("x-ratelimit-requests-remaining") ?? remaining;
    return r.body.response;
  };
  try {
    const all = (await get<RawFixture>({ league, season })).filter(isFinished).sort((a, b) => a.fixture.id - b.fixture.id);
    const ids = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((f) => f.fixture.id);
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += IDS_PER_CALL) chunks.push(ids.slice(i, i + IDS_PER_CALL));
    const details: RawFixtureDetail[] = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = await Promise.all(chunks.slice(i, i + 3).map((c) => get<RawFixtureDetail>({ ids: c.join("-") })));
      details.push(...batch.flat());
    }
    const csv = toCsv(details.sort((a, b) => a.fixture.id - b.fixture.id).map(exportRow));
    const pages = Math.ceil(all.length / PAGE_SIZE);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "x-pages": String(pages), "x-matches": String(all.length), "x-requests-remaining": remaining ?? "" },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
