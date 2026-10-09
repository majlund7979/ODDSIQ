// The key for the /api/cron routes. The schedulers (GitHub Actions, Vercel
// Cron) call them with `Authorization: Bearer $CRON_SECRET`.

import { timingSafeEqual } from "node:crypto";

/** True only when CRON_SECRET is set and the request carries exactly `Bearer $CRON_SECRET`. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Bytes, not characters: timingSafeEqual throws on buffers of different lengths.
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The last line of an error's message (for a Prisma error, the cause), so a run summary stays short. */
export const lastLine = (e: unknown) => (e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e));
