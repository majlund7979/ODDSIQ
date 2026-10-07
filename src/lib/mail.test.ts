import { afterEach, describe, expect, it, vi } from "vitest";

describe("sendMails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sends one request per recipient and keeps going after a refused address", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const to = JSON.parse(init.body).to as string;
      calls.push(to);
      return to.endsWith("@example.com") ? new Response('{"name":"validation_error"}', { status: 422 }) : new Response("{}", { status: 200 });
    });
    const { sendMails } = await import("./mail");
    const mail = (to: string) => ({ to, subject: "s", html: "h", text: "t" });
    const r = await sendMails([mail("a@example.com"), mail("mads@gmail.com"), mail("b@gmail.com")], 0);
    expect(calls).toEqual(["a@example.com", "mads@gmail.com", "b@gmail.com"]);
    expect(r).toMatchObject({ sent: 2, failed: 1 });
    expect(r.error).toContain("Resend 422");
  });
});
