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
