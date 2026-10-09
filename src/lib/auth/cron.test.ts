import { afterEach, describe, expect, it, vi } from "vitest";
import { cronAuthorized, lastLine } from "./cron";

afterEach(() => vi.unstubAllEnvs());

const call = (authorization?: string) => new Request("https://oddsanalyse.dk/api/cron/ingest", { headers: authorization === undefined ? {} : { authorization } });

describe("cron key", () => {
  it("accepts exactly Bearer and the secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-test");
    expect(cronAuthorized(call("Bearer s3cret-test"))).toBe(true);
  });

  it("refuses a wrong secret, a missing header and an unset CRON_SECRET", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-test");
    expect(cronAuthorized(call("Bearer s3cret-tesX"))).toBe(false);
    expect(cronAuthorized(call("Bearer s3cret"))).toBe(false);
    expect(cronAuthorized(call("s3cret-test"))).toBe(false);
    expect(cronAuthorized(call())).toBe(false);
    vi.stubEnv("CRON_SECRET", undefined);
    expect(cronAuthorized(call("Bearer undefined"))).toBe(false);
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAuthorized(call("Bearer "))).toBe(false);
  });

  it("refuses a header with the same number of characters but more bytes, without throwing", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-test");
    expect(() => cronAuthorized(call("Bearer s3cret-tést"))).not.toThrow();
    expect(cronAuthorized(call("Bearer s3cret-tést"))).toBe(false);
  });
});

describe("lastLine", () => {
  it("keeps the last line of an error's message", () => {
    expect(lastLine(new Error("\nInvalid `prisma.user.findMany()` invocation:\n\n\nCan't reach database server\n"))).toBe("Can't reach database server");
    expect(lastLine("plain")).toBe("plain");
  });
});
