// The morning e-mail with today's top 5. Called once a day by the scheduler
// (GitHub Actions) with `Authorization: Bearer $CRON_SECRET`. Sends at most
// once per Copenhagen day; `?force=1` sends again.

import { timingSafeEqual } from "node:crypto";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { MAIL_CONFIGURED, sendMails } from "@/lib/mail";
import { MORNING_COUNT, morningDay, morningHtml, morningSubject, morningText, recipients } from "@/lib/morning";
import { dailyPicks } from "@/lib/picks";
import { applyLearningToPicks, LEARN_DAYS, learn } from "@/lib/picks-learning";
import { terminal } from "@/lib/terminal";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response("Unauthorized.", { status: 401 });
  // Not set up yet is not a failure: the daily job just reports it.
  if (!MAIL_CONFIGURED) return Response.json({ ok: true, skipped: "Set RESEND_API_KEY to send the morning e-mail." });
  const t = await terminal({ fresh: true });
  const day = morningDay(t.now);
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (DATABASE_CONFIGURED && !force && (await db().morningMail.findUnique({ where: { day } }))) return Response.json({ ok: true, skipped: `already sent for ${day}` });

  const users = ACCOUNTS_ENABLED ? (await db().user.findMany({ where: { morningEmail: true }, select: { email: true } })).map((u) => u.email) : [];
  const to = recipients(users, process.env.MORNING_EMAIL_TO);
  if (!to.length) return Response.json({ ok: false, error: "No recipients: nobody has the morning e-mail on and MORNING_EMAIL_TO is empty." }, { status: 503 });

  const learned = learn(await t.recordedPicks(LEARN_DAYS), t.dataLabel).get("bedste");
  const picks = applyLearningToPicks(dailyPicks(t.marketRows(), t.now, MORNING_COUNT, t.pickContext), learned);
  const site = (process.env.APP_URL || `https://${req.headers.get("host")}`).replace(/\/$/, "");
  const subject = morningSubject(picks, t.now);
  const html = morningHtml(picks, t.now, site, t.dataLabel);
  const text = morningText(picks, t.now, site, t.dataLabel);
  const result = await sendMails(to.map((email) => ({ to: email, subject, html, text })));
  if (result.sent && DATABASE_CONFIGURED) await db().morningMail.upsert({ where: { day }, create: { day, recipients: result.sent }, update: { recipients: result.sent, sentAt: new Date() } });
  const ok = !result.error;
  return Response.json({ ok, day, picks: picks.length, recipients: to.length, ...result }, { status: ok ? 200 : 502 });
}
