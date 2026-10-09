// The site's own address, for links in e-mails, Stripe's return pages and the
// friends page: APP_URL when it is set, else the host the request came in on.
// Only APP_URL is safe where the server answers any Host header (next start or
// self-hosting), so set it there; Vercel only routes the project's own domains.

import { headers } from "next/headers";

/** A host name or IP with an optional port, nothing that could carry a path or a user. */
const HOST = /^[a-z0-9.\-[\]:]+$/i;

/** "https://oddsanalyse.dk", without a trailing slash. */
export async function siteOrigin(): Promise<string> {
  const app = process.env.APP_URL?.trim();
  if (app) return app.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") === "http" ? "http" : "https";
  const host = h.get("host") ?? "";
  return HOST.test(host) ? `${proto}://${host}` : "https://oddsanalyse.dk";
}
