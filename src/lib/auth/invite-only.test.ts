import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// With INVITE_ONLY, an account whose invitation is gone keeps its User row but
// must not get the morning e-mail or save anything.
const OWNER = "ejer@example.com";
const FRIEND = "ven@example.com";
const STRANGER = "fremmed@example.com";
const friends = new Set([FRIEND]);
const updates: unknown[] = [];
const mailed: string[] = [];
let signedIn: { id: string; email: string } | null = null;

vi.mock("@/lib/db", () => ({
  DATABASE_CONFIGURED: true,
  db: () => ({
    user: {
      findMany: async () => [OWNER, FRIEND, STRANGER].map((email) => ({ email })),
      update: async (a: unknown) => void updates.push(a),
    },
    friend: { findUnique: async ({ where }: { where: { email: string } }) => (friends.has(where.email) ? { email: where.email } : null) },
    morningMail: { findUnique: async () => null, upsert: async () => {} },
  }),
}));
vi.mock("@/lib/mail", async (orig) => ({
  ...(await orig<typeof import("@/lib/mail")>()),
  MAIL_CONFIGURED: true,
  sendMails: async (m: { to: string }[]) => (mailed.push(...m.map((x) => x.to)), { sent: m.length, failed: 0, error: null }),
}));
vi.mock("@/lib/terminal", () => ({
  terminal: async () => ({ now: Date.parse("2026-10-08T05:00:00Z"), marketRows: () => [], pickContext: () => null, sharpBooks: { reference: [], price: [] }, dataLabel: "DEMO DATA" }),
}));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), currentUser: async () => signedIn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const redirectedTo = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return String((e as { digest?: string }).digest ?? "").split(";")[2];
  }
  return null;
};

describe("INVITE_ONLY", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OWNER_EMAIL", OWNER);
    vi.stubEnv("INVITE_ONLY", "true");
    vi.stubEnv("CRON_SECRET", "s3cret-test");
    mailed.length = 0;
    updates.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends the morning e-mail only to accounts that are still invited", async () => {
    const { GET } = await import("@/app/api/cron/morning/route");
    const res = await GET(new Request("http://localhost/api/cron/morning?force=1", { headers: { authorization: "Bearer s3cret-test" } }));
    expect(res.status).toBe(200);
    expect(mailed.sort()).toEqual([OWNER, FRIEND].sort());
  });

  it("sends removed friends to /login instead of saving their league profile", async () => {
    const { updateLeagueProfile } = await import("@/app/friends-actions");
    const form = new FormData();
    form.set("displayName", "Ikke inviteret");
    signedIn = { id: "usr_fremmed", email: STRANGER };
    expect(await redirectedTo(updateLeagueProfile(form))).toBe("/login?adgang=fjernet");
    expect(updates).toEqual([]);
    signedIn = { id: "usr_ven", email: FRIEND };
    expect(await redirectedTo(updateLeagueProfile(form))).toBe("/picks/liga?gemt=profil");
    expect(updates).toHaveLength(1);
  });

  it("does not play a coupon for a removed friend", async () => {
    const { playCoupon } = await import("@/app/friends-actions");
    signedIn = { id: "usr_fremmed", email: STRANGER };
    expect(await playCoupon({}, new FormData())).toEqual({ error: "Log ind for at spille kuponen." });
  });
});
