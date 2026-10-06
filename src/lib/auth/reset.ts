// "Glemt kode": a one-time link by e-mail. The link carries a random token; the
// PasswordReset table stores only its SHA-256 (like Session), so a database leak
// gives no working links. A link works once and only for RESET_MINUTES.

import { randomBytes } from "node:crypto";
import { hashToken } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Mail } from "@/lib/mail";

export const RESET_MINUTES = 30;
/** At most this many links per account per hour, so the form cannot flood an inbox. */
export const RESET_PER_HOUR = 3;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Creates a link for the user, or null when the hourly limit is reached. Returns the raw token for the e-mail. */
export async function createReset(userId: string, now = Date.now()): Promise<string | null> {
  const recent = await db().passwordReset.count({ where: { userId, createdAt: { gte: new Date(now - 3_600_000) } } });
  if (recent >= RESET_PER_HOUR) return null;
  const token = randomBytes(32).toString("base64url");
  await db().passwordReset.create({ data: { id: hashToken(token), userId, expiresAt: new Date(now + RESET_MINUTES * 60_000) } });
  return token;
}

export type ResetCheck = { ok: true; userId: string; email: string } | { ok: false; reason: "unknown" | "used" | "expired" };

/** Looks a token up without using it (the page shows the form only for a working link). */
export async function checkReset(token: string, now = Date.now()): Promise<ResetCheck> {
  if (!token || token.length > 100) return { ok: false, reason: "unknown" };
  const r = await db().passwordReset.findUnique({ where: { id: hashToken(token) }, include: { user: { select: { email: true } } } });
  return resetState(r && { usedAt: r.usedAt, expiresAt: r.expiresAt, userId: r.userId, email: r.user.email }, now);
}

/** Pure: is a stored reset row usable at `now`? */
export function resetState(r: { usedAt: Date | null; expiresAt: Date; userId: string; email: string } | null, now: number): ResetCheck {
  if (!r) return { ok: false, reason: "unknown" };
  if (r.usedAt) return { ok: false, reason: "used" };
  if (r.expiresAt.getTime() <= now) return { ok: false, reason: "expired" };
  return { ok: true, userId: r.userId, email: r.email };
}

/**
 * Sets the new password and marks the link used, in one transaction. Every other session and every other
 * open link of the account are ended, so whoever had the old password is logged out. Returns the user id,
 * or null when the link no longer works (used meanwhile, expired).
 */
export async function consumeReset(token: string, passwordHash: string, now = Date.now()): Promise<string | null> {
  const id = hashToken(token);
  return db().$transaction(async (tx) => {
    // Only one request can flip usedAt from null, so a link cannot be used twice.
    const claimed = await tx.passwordReset.updateMany({ where: { id, usedAt: null, expiresAt: { gt: new Date(now) } }, data: { usedAt: new Date(now) } });
    if (claimed.count !== 1) return null;
    const { userId } = await tx.passwordReset.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date(now) } });
    return userId;
  });
}

/** The e-mail with the link. Pure, so the wording is tested without sending anything. */
export function resetMail({ to, link }: { to: string; link: string }): Mail {
  const subject = "Vælg en ny adgangskode til Oddsanalyse";
  const text = [
    "Hej,",
    "",
    "Nogen (forhåbentlig dig) bad om at nulstille adgangskoden til din konto på Oddsanalyse.",
    "",
    `Vælg en ny adgangskode her: ${link}`,
    "",
    `Linket virker én gang og udløber om ${RESET_MINUTES} minutter. Har du ikke bedt om det, kan du se bort fra mailen; din kode er uændret.`,
  ].join("\n");
  const html = `<!doctype html><html lang="da"><body style="margin:0;background:#f6f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a19">
<div style="max-width:520px;margin:0 auto;padding:24px 20px">
<div style="font-size:13px;font-weight:700;letter-spacing:1px">Oddsanalyse</div>
<h1 style="font-size:22px;margin:8px 0 12px">Ny adgangskode</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">Nogen (forhåbentlig dig) bad om at nulstille adgangskoden til din konto på Oddsanalyse.</p>
<p style="margin:20px 0"><a href="${esc(link)}" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Vælg ny adgangskode</a></p>
<p style="font-size:12px;color:#77756f;line-height:1.5">Linket virker én gang og udløber om ${RESET_MINUTES} minutter. Har du ikke bedt om det, kan du se bort fra mailen; din kode er uændret.</p>
</div></body></html>`;
  return { to, subject, html, text };
}
