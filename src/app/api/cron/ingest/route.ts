// Scheduled odds ingestion. Call with `Authorization: Bearer $CRON_SECRET`
// (Vercel Cron sends this header automatically when CRON_SECRET is set).

import { timingSafeEqual } from "node:crypto";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { configuredFeed, feedConfig } from "@/lib/providers/config";
import { ingest } from "@/lib/providers/ingest";

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
  const summary = await ingest(db(), feed, { competitionKeys: feedConfig().sports });
  return Response.json({ ok: !summary.error, ...summary }, { status: summary.error ? 502 : 200 });
}
