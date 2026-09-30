// In-play odds and scores. Call every few minutes (ODDS_LIVE_INTERVAL_MINUTES,
// default 10) with `Authorization: Bearer $CRON_SECRET`. It calls the odds feed
// only while a stored match is in play, only for those competitions, and stops
// when the credits left fall below ODDS_LIVE_RESERVE; otherwise it returns at
// once without spending anything.

import { timingSafeEqual } from "node:crypto";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { closeAndSettle } from "@/lib/model/pipeline";
import { configuredFeed, feedConfig, liveConfig, liveRunDecision } from "@/lib/providers/config";
import { inPlayCompetitions, ingest } from "@/lib/providers/ingest";

export const maxDuration = 120;

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
  const now = Date.now();
  const prisma = db();
  const keys = await inPlayCompetitions(prisma, feedConfig().sports, now);
  const lastLive = await prisma.ingestRun.findFirst({ where: { provider: feed.provider, kind: "live" }, orderBy: { startedAt: "desc" } });
  const lastAny = await prisma.ingestRun.findFirst({ where: { provider: feed.provider, creditsRemaining: { not: null } }, orderBy: { startedAt: "desc" } });
  const decision = liveRunDecision(liveConfig(), { inPlay: keys.length, lastLiveRunAt: lastLive?.startedAt.getTime() ?? null, creditsRemaining: lastAny?.creditsRemaining ?? null, now });
  if (!decision.run) return Response.json({ ok: true, skipped: decision.reason });
  const summary = await ingest(prisma, feed, { competitionKeys: keys, now, kind: "live" });
  let settled: Awaited<ReturnType<typeof closeAndSettle>> | { error: string };
  try {
    settled = await closeAndSettle(prisma, now);
  } catch (e) {
    settled = { error: e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e) };
  }
  const ok = !summary.error && !("error" in settled);
  return Response.json({ ok, ...summary, settled }, { status: ok ? 200 : 502 });
}
