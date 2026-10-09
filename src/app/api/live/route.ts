import { friendRequestAllowed } from "@/lib/auth/friends";
import { DEMO_MODE } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { demoLivePicks } from "@/lib/demo/picks";
import { livePicks } from "@/lib/live/scores";

/** Live scores for the picks being played now; the picks page polls this every minute. */
export async function GET(request: Request) {
  if (!(await friendRequestAllowed())) return Response.json({ items: [] }, { status: 401 });
  const category = (new URL(request.url).searchParams.get("type") ?? "bedste").slice(0, 20);
  const now = Date.now();
  try {
    const items = DEMO_MODE ? demoLivePicks(category, now) : DATABASE_CONFIGURED ? await livePicks(db(), process.env.STATS_API_KEY || null, category, now) : [];
    return Response.json({ now, items }, { headers: { "cache-control": "private, max-age=30" } });
  } catch {
    return Response.json({ now, items: [], error: "Live-stillingen kunne ikke hentes." }, { status: 502 });
  }
}
