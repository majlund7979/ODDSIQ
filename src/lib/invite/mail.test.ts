import { describe, expect, it } from "vitest";
import { inviteMail, senderName, validEmail } from "./mail";

describe("inviteMail", () => {
  it("links to signup and names the sender", () => {
    const m = inviteMail({ to: "ven@x.dk", name: "Ole", from: "Mads", site: "https://oddsanalyse.dk" });
    expect(m.to).toBe("ven@x.dk");
    expect(m.subject).toBe("Mads inviterer dig til Oddsanalyse");
    expect(m.text).toContain("https://oddsanalyse.dk/signup");
    expect(m.text.startsWith("Hej Ole,")).toBe(true);
    expect(m.html).toContain('href="https://oddsanalyse.dk/signup"');
    expect(m.text).not.toMatch(/garanteret|lock/i);
  });

  it("escapes names in the html", () => {
    const m = inviteMail({ to: "a@b.dk", name: "<b>", from: "M&M", site: "https://x" });
    expect(m.html).toContain("&lt;b&gt;");
    expect(m.html).toContain("M&amp;M");
    expect(m.html).not.toContain("<b>,");
  });

  it("keeps the mail's wording and markup", () => {
    const m = inviteMail({ to: "ven@x.dk", name: "Ole", from: "Mads & co", site: "https://oddsanalyse.dk" });
    expect(m.text).toMatchInlineSnapshot(`
      "Hej Ole,

      Mads & co vil gerne have dig med på Oddsanalyse: dagens bedste fodboldbets med chance, odds og vores resultater, plus en liga, hvor I kan dyste mod hinanden.

      Opret en gratis konto her: https://oddsanalyse.dk/signup

      Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+."
    `);
    expect(m.html).toMatchInlineSnapshot(`
      "<!doctype html><html lang="da"><body style="margin:0;background:#f6f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a19">
      <div style="max-width:520px;margin:0 auto;padding:24px 20px">
      <div style="font-size:13px;font-weight:700;letter-spacing:1px">Oddsanalyse</div>
      <h1 style="font-size:22px;margin:8px 0 12px">Hej Ole</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px"><b>Mads &amp; co</b> vil gerne have dig med på Oddsanalyse: dagens bedste fodboldbets med chance, odds og vores resultater, plus en liga, hvor I kan dyste mod hinanden.</p>
      <p style="margin:20px 0"><a href="https://oddsanalyse.dk/signup" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Opret gratis konto</a></p>
      <p style="font-size:12px;color:#77756f;line-height:1.5">Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+.<br>Du får kun denne ene mail, fordi Mads &amp; co skrev din adresse.</p>
      </div></body></html>"
    `);
  });
});

describe("helpers", () => {
  it("validates emails", () => {
    expect(validEmail("a@b.dk")).toBe(true);
    expect(validEmail("nope")).toBe(false);
  });
  it("falls back to the part before the @", () => {
    expect(senderName("mads@test.dk", null)).toBe("mads");
    expect(senderName("mads@test.dk", " Mads L ")).toBe("Mads L");
  });
});
