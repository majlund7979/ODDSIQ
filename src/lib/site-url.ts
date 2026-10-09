// The site's own address, for links in e-mails, Stripe's return pages and the
// friends page: APP_URL when it is set, else the host the request came in on.

import { headers } from "next/headers";

/** "https://oddsanalyse.dk", without a trailing slash. */
export async function siteOrigin(): Promise<string> {
  const app = process.env.APP_URL?.trim();
  if (app) return app.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}
