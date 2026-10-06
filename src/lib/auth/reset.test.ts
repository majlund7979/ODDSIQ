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
});
