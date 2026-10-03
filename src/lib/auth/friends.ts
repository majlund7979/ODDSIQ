// Friends-only access. The owner (OWNER_EMAIL) invites friends by email on
// /venner; ALLOWED_EMAILS is a fallback list set on the host. Nobody else can
// create an account, and every page asks for a signed-in, invited user.

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

/** True when the email may have an account: the owner, ALLOWED_EMAILS or an invited friend. */
export async function isInvited(email: string): Promise<boolean> {
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

export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireFriend("/venner");
  if (!user || !isOwner(user.email)) redirect("/picks");
  return user;
}
