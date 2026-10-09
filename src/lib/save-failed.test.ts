import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A database that does not answer, so each action takes its own error path.
vi.mock("@/lib/db", () => ({
  DATABASE_CONFIGURED: true,
  db: () => {
    throw new Error("database down");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const EMAIL = "ven@example.com";
const PASSWORD = "korrekt-hest-batteri";

describe("what the account forms say when the database does not answer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OWNER_EMAIL", "ejer@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("says log-in does not work, not that something was not saved", async () => {
    const { signIn } = await import("@/app/auth-actions");
    expect(await signIn({}, form({ email: EMAIL, password: PASSWORD }))).toEqual({ email: EMAIL, error: "Login virker ikke lige nu. Prøv igen om lidt." });
  });

  it("says the reset link cannot be sent", async () => {
    const { requestReset } = await import("@/app/reset-actions");
    expect(await requestReset({}, form({ email: EMAIL }))).toEqual({ email: EMAIL, error: "Vi kan ikke sende linket lige nu. Prøv igen om lidt." });
  });

  it("keeps the save message where something is saved", async () => {
    const { signUp } = await import("@/app/auth-actions");
    const { resetPassword } = await import("@/app/reset-actions");
    const saveFailed = "Det kunne ikke gemmes lige nu. Prøv igen om lidt.";
    expect(await signUp({}, form({ email: EMAIL, password: PASSWORD }))).toEqual({ email: EMAIL, error: saveFailed });
    expect(await resetPassword({}, form({ token: "t", password: PASSWORD, repeat: PASSWORD }))).toEqual({ error: saveFailed });
  });
});
