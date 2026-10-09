import { afterEach, describe, expect, it, vi } from "vitest";

let sent: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(sent) }));

const { siteOrigin } = await import("./site-url");

afterEach(() => {
  vi.unstubAllEnvs();
  sent = {};
});

describe("siteOrigin", () => {
  it("uses APP_URL when it is set", async () => {
    vi.stubEnv("APP_URL", "https://oddsanalyse.dk/");
    sent = { host: "evil.example" };
    expect(await siteOrigin()).toBe("https://oddsanalyse.dk");
  });

  it("falls back to the request's host, over http or https only", async () => {
    vi.stubEnv("APP_URL", "");
    sent = { host: "localhost:3000", "x-forwarded-proto": "http" };
    expect(await siteOrigin()).toBe("http://localhost:3000");
    sent = { host: "oddsanalyse.dk", "x-forwarded-proto": "javascript" };
    expect(await siteOrigin()).toBe("https://oddsanalyse.dk");
    sent = { host: "evil.example/x?", "x-forwarded-proto": "https" };
    expect(await siteOrigin()).toBe("https://oddsanalyse.dk");
  });
});
