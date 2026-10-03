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

/** Sends one e-mail per recipient, so friends never see each other's addresses. Returns how many went out and the first error. */
export async function sendMails(mails: Mail[]): Promise<{ sent: number; error: string | null }> {
  if (!MAIL_CONFIGURED) return { sent: 0, error: "RESEND_API_KEY is not set." };
  let sent = 0;
  let error: string | null = null;
  // Resend's batch endpoint takes up to 100 messages per call.
  for (let i = 0; i < mails.length; i += 100) {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(mails.slice(i, i + 100).map((m) => ({ from: FROM(), ...m }))),
    });
    if (res.ok) sent += Math.min(100, mails.length - i);
    else error ??= `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
  }
  return { sent, error };
}
