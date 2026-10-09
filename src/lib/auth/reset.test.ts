import { describe, expect, it } from "vitest";
import { RESET_MINUTES, resetMail, resetState } from "./reset";

describe("password reset", () => {
  const now = Date.UTC(2026, 9, 6, 12);
  const row = (over: Partial<{ usedAt: Date | null; expiresAt: Date }> = {}) => ({
    usedAt: null, expiresAt: new Date(now + 60_000), userId: "usr_1", email: "mads@example.com", ...over,
  });

  it("accepts a fresh link and refuses unknown, used and expired ones", () => {
    expect(resetState(row(), now)).toEqual({ ok: true, userId: "usr_1", email: "mads@example.com" });
    expect(resetState(null, now)).toEqual({ ok: false, reason: "unknown" });
    expect(resetState(row({ usedAt: new Date(now - 1) }), now)).toEqual({ ok: false, reason: "used" });
    expect(resetState(row({ expiresAt: new Date(now) }), now)).toEqual({ ok: false, reason: "expired" });
  });

  it("mails the link with its lifetime and escapes it in the html", () => {
    const m = resetMail({ to: "mads@example.com", link: "https://oddsanalyse.dk/login/ny-kode?token=a&b" });
    expect(m.to).toBe("mads@example.com");
    expect(m.text).toContain("https://oddsanalyse.dk/login/ny-kode?token=a&b");
    expect(m.text).toContain(`${RESET_MINUTES} minutter`);
    expect(m.html).toContain('href="https://oddsanalyse.dk/login/ny-kode?token=a&amp;b"');
  });

  it("keeps the mail's wording and markup", () => {
    const m = resetMail({ to: "mads@example.com", link: "https://oddsanalyse.dk/login/ny-kode?token=abc" });
    expect(m.subject).toBe("Vælg en ny adgangskode til Oddsanalyse");
    expect(m.text).toMatchInlineSnapshot(`
      "Hej,

      Nogen (forhåbentlig dig) bad om at nulstille adgangskoden til din konto på Oddsanalyse.

      Vælg en ny adgangskode her: https://oddsanalyse.dk/login/ny-kode?token=abc

      Linket virker én gang og udløber om 30 minutter. Har du ikke bedt om det, kan du se bort fra mailen; din kode er uændret."
    `);
    expect(m.html).toMatchInlineSnapshot(`
      "<!doctype html><html lang="da"><body style="margin:0;background:#f6f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a19">
      <div style="max-width:520px;margin:0 auto;padding:24px 20px">
      <div style="font-size:13px;font-weight:700;letter-spacing:1px">Oddsanalyse</div>
      <h1 style="font-size:22px;margin:8px 0 12px">Ny adgangskode</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px">Nogen (forhåbentlig dig) bad om at nulstille adgangskoden til din konto på Oddsanalyse.</p>
      <p style="margin:20px 0"><a href="https://oddsanalyse.dk/login/ny-kode?token=abc" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Vælg ny adgangskode</a></p>
      <p style="font-size:12px;color:#77756f;line-height:1.5">Linket virker én gang og udløber om 30 minutter. Har du ikke bedt om det, kan du se bort fra mailen; din kode er uændret.</p>
      </div></body></html>"
    `);
  });
});
