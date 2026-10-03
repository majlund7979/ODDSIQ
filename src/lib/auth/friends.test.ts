import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwner, parseEmails } from "./friends";

afterEach(() => vi.unstubAllEnvs());

describe("friends-only access", () => {
  it("parses email lists from env vars", () => {
    expect(parseEmails(" Mads@Example.com, jonas@example.com;peter@example.com\nmads@example.com ")).toEqual(["mads@example.com", "jonas@example.com", "peter@example.com"]);
    expect(parseEmails(undefined)).toEqual([]);
  });

  it("recognises the owner case-insensitively", () => {
    vi.stubEnv("OWNER_EMAIL", "Mads@Example.com");
    expect(isOwner(" mads@example.com")).toBe(true);
    expect(isOwner("jonas@example.com")).toBe(false);
  });
});
