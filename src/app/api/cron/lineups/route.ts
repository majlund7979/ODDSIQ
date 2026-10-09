// Lineups close to kickoff. Call every ten minutes with
// `Authorization: Bearer $CRON_SECRET`; it returns at once, without calling
// the provider, when no matched fixture is within 90 minutes of kickoff.

import { cronAuthorized } from "@/lib/auth/cron";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { configuredStatsFeed } from "@/lib/stats/config";
import { refreshLineups } from "@/lib/stats/lineups";

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return new Response("Unauthorized.", { status: 401 });
  const feed = configuredStatsFeed();
  if (!feed || !DATABASE_CONFIGURED) return Response.json({ ok: false, error: "Set STATS_API_KEY and DATABASE_URL to fetch lineups." }, { status: 503 });
  const summary = await refreshLineups(db(), feed);
  return Response.json({ ok: !summary.error, ...summary }, { status: summary.error ? 502 : 200 });
}
