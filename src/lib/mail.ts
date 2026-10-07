// Sends e-mail through Resend's HTTP API (https://resend.com). Needs
// RESEND_API_KEY; MAIL_FROM sets the sender (Resend's test sender until a
// domain is verified, which only delivers to the Resend account's own address).

export const MAIL_CONFIGURED = Boolean(process.env.RESEND_API_KEY);
const FROM = () => process.env.MAIL_FROM || "Oddsanalyse <onboarding@resend.dev>";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Resend's default limit is 2 requests per second. */
const GAP_MS = 550;

/**
 * Sends one e-mail per recipient, one request each, so friends never see each other's addresses and one address
 * Resend refuses (a test address, or anyone but the account owner while the sender domain is unverified) does not
 * stop the rest. Returns how many went out, how many failed, and the first error.
 */
export async function sendMails(mails: Mail[], gapMs = GAP_MS): Promise<{ sent: number; failed: number; error: string | null }> {
  if (!MAIL_CONFIGURED) return { sent: 0, failed: mails.length, error: "RESEND_API_KEY is not set." };
  let sent = 0;
  let error: string | null = null;
  for (const [i, m] of mails.entries()) {
    if (i > 0 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM(), ...m }),
      });
      if (res.ok) sent++;
      else error ??= `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
    } catch (e) {
      error ??= `Resend: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { sent, failed: mails.length - sent, error };
}
