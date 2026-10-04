// The invite e-mail a member sends a friend from the bar in the top right corner.

import type { Mail } from "@/lib/mail";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

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
  const html = `<!doctype html><html lang="da"><body style="margin:0;background:#f6f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a19">
<div style="max-width:520px;margin:0 auto;padding:24px 20px">
<div style="font-size:13px;font-weight:700;letter-spacing:1px">Oddsanalyse</div>
<h1 style="font-size:22px;margin:8px 0 12px">${esc(hi)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px"><b>${esc(from)}</b> vil gerne have dig med på Oddsanalyse: dagens bedste fodboldbets med chance, odds og vores resultater, plus en liga, hvor I kan dyste mod hinanden.</p>
<p style="margin:20px 0"><a href="${esc(link)}" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Opret gratis konto</a></p>
<p style="font-size:12px;color:#77756f;line-height:1.5">Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+.<br>Du får kun denne ene mail, fordi ${esc(from)} skrev din adresse.</p>
</div></body></html>`;
  return { to, subject, html, text };
}
