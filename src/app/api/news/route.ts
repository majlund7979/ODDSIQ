import { friendRequestAllowed } from "@/lib/auth/friends";
import { teamNews } from "@/lib/news/news";

/** Team headlines for one match, fetched when a visitor opens a bet's analysis. */
export async function GET(request: Request) {
  if (!(await friendRequestAllowed())) return Response.json({ items: [] }, { status: 401 });
  const url = new URL(request.url);
  const home = (url.searchParams.get("home") ?? "").slice(0, 80);
  const away = (url.searchParams.get("away") ?? "").slice(0, 80);
  if (!home || !away) return Response.json({ items: [] }, { status: 400 });
  const now = Date.now();
  return Response.json({ now, items: await teamNews(home, away, now) }, { headers: { "cache-control": "private, max-age=600" } });
}
