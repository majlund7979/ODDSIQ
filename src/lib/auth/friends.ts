// Login for the whole site. By default anyone can create an account
// (Mads, 2026-10-03: "alle kan få et log in"). With INVITE_ONLY=true only the
// owner (OWNER_EMAIL), ALLOWED_EMAILS and friends the owner invites on
// /venner can. Every page asks for a signed-in user either way.

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ACCOUNTS_ENABLED, currentUser, type CurrentUser } from "./session";

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

/** Comma, semicolon or whitespace separated emails from an env var. */
export function parseEmails(v: string | undefined): string[] {
  return [...new Set((v ?? "").split(/[\s,;]+/).map(normaliseEmail).filter(Boolean))];
}

export const ownerEmails = () => parseEmails(process.env.OWNER_EMAIL);
export const isOwner = (email: string) => ownerEmails().includes(normaliseEmail(email));
export const inviteOnly = () => process.env.INVITE_ONLY === "true";

/** True when the email may have an account: anyone, or with INVITE_ONLY the owner, ALLOWED_EMAILS or an invited friend. */
export async function isInvited(email: string): Promise<boolean> {
  if (!inviteOnly()) return true;
  const e = normaliseEmail(email);
  if (isOwner(e) || parseEmails(process.env.ALLOWED_EMAILS).includes(e)) return true;
  return Boolean(await db().friend.findUnique({ where: { email: e } }));
}

/**
 * The signed-in, invited user. Sends everyone else to /login. Returns null
 * only when accounts are off (no database), where the site stays open.
 */
export async function requireFriend(next = "/picks"): Promise<CurrentUser | null> {
  if (!ACCOUNTS_ENABLED) return null;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!(await isInvited(user.email))) redirect("/login?adgang=fjernet");
  return user;
}

/** The signed-in, invited user, or null. Never redirects, so each page can send strangers to /login with its own path. */
export async function signedInFriend(): Promise<CurrentUser | null> {
  if (!ACCOUNTS_ENABLED) return null;
  const user = await currentUser();
  return user && (await isInvited(user.email)) ? user : null;
}

export async function requireOwner(next = "/venner"): Promise<CurrentUser> {
  const user = await requireFriend(next);
  if (!user || !isOwner(user.email)) redirect("/picks");
  return user;
}
