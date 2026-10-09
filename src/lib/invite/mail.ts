// The invite e-mail a member sends a friend from the bar in the top right corner.

import { emailShell, escapeHtml, type Mail } from "@/lib/mail";

export { validEmail } from "@/lib/auth/rules";

/** The sender's name as friends know it: display name, else the part of the e-mail before the @. */
export const senderName = (email: string, displayName: string | null | undefined) => (displayName?.trim() || email.split("@")[0]).slice(0, 60);

/** Builds the invite. Pure, so the wording is tested without sending anything. */
export function inviteMail({ to, name, from, site }: { to: string; name: string; from: string; site: string }): Mail {
  const link = `${site}/signup`;
  const hi = name ? `Hej ${name}` : "Hej";
  const subject = `${from} inviterer dig til Oddsanalyse`;
  const text = [
    `${hi},`,
    "",
    `${from} vil gerne have dig med på Oddsanalyse: dagens bedste fodboldbets med chance, odds og vores resultater, plus en liga, hvor I kan dyste mod hinanden.`,
    "",
    `Opret en gratis konto her: ${link}`,
    "",
    "Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+.",
  ].join("\n");
  const html = emailShell(
    `<h1 style="font-size:22px;margin:8px 0 12px">${escapeHtml(hi)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px"><b>${escapeHtml(from)}</b> vil gerne have dig med på Oddsanalyse: dagens bedste fodboldbets med chance, odds og vores resultater, plus en liga, hvor I kan dyste mod hinanden.</p>
<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Opret gratis konto</a></p>
<p style="font-size:12px;color:#77756f;line-height:1.5">Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+.<br>Du får kun denne ene mail, fordi ${escapeHtml(from)} skrev din adresse.</p>`,
    { maxWidth: 520 },
  );
  return { to, subject, html, text };
}
