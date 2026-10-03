// Session cookies backed by the Session table. The cookie holds a random token;
// the database stores only its SHA-256.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, DATABASE_CONFIGURED } from "@/lib/db";

export const SESSION_COOKIE = "oddsiq_session";
const SESSION_DAYS = 30;

/**
 * Accounts need a database, and switch on with ACCOUNTS_ENABLED=true or by
 * naming the site's owner in OWNER_EMAIL. Then every page asks for login
 * (src/lib/auth/friends.ts).
 */
export const ACCOUNTS_ENABLED = DATABASE_CONFIGURED && (process.env.ACCOUNTS_ENABLED === "true" || Boolean(process.env.OWNER_EMAIL?.trim()));

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newUserId = () => `usr_${randomUUID().replace(/-/g, "")}`;

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().session.create({ data: { id: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && ACCOUNTS_ENABLED) await db().session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  email: string;
  plan: string;
  planStatus: string | null;
  planRenewsAt: Date | null;
  stripeCustomerId: string | null;
  watchlist: string;
  positions: string;
  thresholdPp: number;
}

/** The signed-in user for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!ACCOUNTS_ENABLED) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db().session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const u = session.user;
  return { id: u.id, email: u.email, plan: u.plan, planStatus: u.planStatus, planRenewsAt: u.planRenewsAt, stripeCustomerId: u.stripeCustomerId, watchlist: u.watchlist, positions: u.positions, thresholdPp: u.thresholdPp };
});
