// Scheduled odds ingestion, statistics (when STATS_API_KEY is set), then the real model's work (results refresh,
// ledger predictions, closing lines, settlement, daily backtest).
// Call with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this
// header automatically when CRON_SECRET is set).

import { timingSafeEqual } from "node:crypto";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { AF_ODDS_PLAN, afOddsConfig, configuredAfOddsFeed, configuredFeed, feedConfig, oddsPlan } from "@/lib/providers/config";
import { runModel } from "@/lib/model/pipeline";
import { ingest } from "@/lib/providers/ingest";
import { configuredStatsFeed, statsConfig } from "@/lib/stats/config";
import { ingestStats } from "@/lib/stats/ingest";
import { DEMO_MODE } from "@/lib/data";
import { recordPicks } from "@/lib/real/pick-records";
import { terminal } from "@/lib/terminal";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response("Unauthorized.", { status: 401 });
  const feed = configuredFeed();
  if (!feed || !DATABASE_CONFIGURED) return Response.json({ ok: false, error: "Set ODDS_API_KEY and DATABASE_URL to ingest odds." }, { status: 503 });
  const summary = await ingest(db(), feed, { competitionKeys: feedConfig().sports, plan: oddsPlan() });
  // Internationals and the rest of Europe from API-Football, under their own id prefix ("apf-…").
  const afFeed = configuredAfOddsFeed();
  const afKeys = afFeed ? afOddsConfig().keys : [];
  const oddsAf = afFeed ? await ingest(db(), afFeed, { competitionKeys: afKeys, plan: AF_ODDS_PLAN, prefix: "apf" }) : null;
  const statsFeed = configuredStatsFeed();
  const stats = statsFeed ? await ingestStats(db(), statsFeed, { oddsKeys: feedConfig().sports, budget: statsConfig().budget }) : null;
  const statsAf = statsFeed && afFeed ? await ingestStats(db(), statsFeed, { oddsKeys: afKeys, budget: statsConfig().budget, prefix: "apf", seasons: afFeed.seasons }) : null;
  let model: Awaited<ReturnType<typeof runModel>> | { error: string };
  try {
    model = await runModel(db(), { oddsKeys: [...new Set([...feedConfig().sports, ...afKeys])] });
  } catch (e) {
    model = { error: e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e) };
  }
  // Record today's picks for the results board; a failure here never fails the run.
  let picksRecorded: number | { error: string } = 0;
  if (!DEMO_MODE) {
    try {
      picksRecorded = await recordPicks(db(), await terminal({ fresh: true }));
    } catch (e) {
      picksRecorded = { error: e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e) };
    }
  }
  // A statistics-feed problem (e.g. a plan that does not cover the season) is reported but does not fail the run:
  // odds, the model and the picks still worked.
  const ok = !summary.error && !("error" in model);
  return Response.json({ ok, ...summary, oddsAf, stats, statsAf, model, picksRecorded }, { status: ok ? 200 : 502 });
}
