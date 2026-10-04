"use server";

import { headers } from "next/headers";
import { inviteOnly, isOwner, normaliseEmail, signedInFriend } from "@/lib/auth/friends";
import { allowAttempt } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { inviteMail, senderName, validEmail } from "@/lib/invite/mail";
import { MAIL_CONFIGURED, sendMails } from "@/lib/mail";

export interface InviteState {
  ok?: string;
  error?: string;
  /** Set when the mail could not go out, so the member can share the link by hand. */
  link?: string;
}

async function siteUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Any signed-in member: e-mails a friend a link to create an account. */
export async function inviteFriend(_: InviteState, formData: FormData): Promise<InviteState> {
  const user = await signedInFriend();
  if (!user) return { error: "Log ind for at invitere." };
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!validEmail(email)) return { error: "Skriv en gyldig email." };
  if (email === normaliseEmail(user.email)) return { error: "Det er din egen email." };
  const link = `${await siteUrl()}/signup`;
  if (await db().user.findUnique({ where: { email }, select: { id: true } })) return { ok: `${name || email} er allerede med.` };
  if (!allowAttempt(`invite:${user.id}`)) return { error: "Du har sendt mange invitationer. Prøv igen om 15 minutter." };

  const owner = isOwner(user.email);
  // With INVITE_ONLY only the owner can open the door; friends' invites still need the owner's yes on /venner.
  if (inviteOnly()) {
    if (!owner) return { error: "Kun ejeren kan invitere lige nu. Bed ejeren tilføje din ven under Venner." };
    await db().friend.upsert({ where: { email }, create: { email, name }, update: { name } });
  }
  if (!MAIL_CONFIGURED) return { error: "Mail er ikke sat op endnu. Send linket selv:", link };

  const me = await db().user.findUnique({ where: { id: user.id }, select: { displayName: true } });
  const { sent, error } = await sendMails([inviteMail({ to: email, name, from: senderName(user.email, me?.displayName), site: link.replace(/\/signup$/, "") })]);
  if (!sent) {
    console.error("invite mail failed", error);
    return { error: "Mailen kunne ikke sendes. Send linket selv:", link };
  }
  return { ok: `Invitation sendt til ${name || email}.` };
}
