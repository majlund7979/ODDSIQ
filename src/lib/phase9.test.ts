import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { allowAttempt, ATTEMPT_LIMIT, hashPassword, validateCredentials, verifyPassword } from "@/lib/auth/password";
import { safeNext } from "@/lib/auth/redirect";
import { ACTIVE_STATUSES } from "@/lib/billing/plans";
import { planUpdateFromEvent, verifyStripeSignature } from "@/lib/billing/stripe";
import { closingLine, settle } from "@/lib/providers/closing";
import { feedConfig } from "@/lib/providers/config";
import { FIXTURE_KICKOFF, FixtureFeed } from "@/lib/providers/fixture-feed";
import { bookMargins, feedIds, slug } from "@/lib/providers/ingest";
import { normalizeOdds, normalizeScores, quotaFrom, sportIdFor } from "@/lib/providers/the-odds-api";

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterz", a)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });

  it("validates email and length", () => {
    expect(validateCredentials("not-an-email", "longenough123")).not.toBeNull();
    expect(validateCredentials("a@b.co", "short")).not.toBeNull();
    expect(validateCredentials("a@b.co", "longenough123")).toBeNull();
  });

  it("rate-limits attempts per key within the window", () => {
    const key = `test:${Math.random()}`;
    const t = 1_000_000;
    for (let i = 0; i < ATTEMPT_LIMIT.max; i++) expect(allowAttempt(key, t)).toBe(true);
    expect(allowAttempt(key, t + 1)).toBe(false);
    expect(allowAttempt(key, t + ATTEMPT_LIMIT.windowMs + 1)).toBe(true);
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/watchlist")).toBe("/watchlist");
    expect(safeNext("//evil.example")).toBe("/picks");
    expect(safeNext("/\\evil.example")).toBe("/picks");
    expect(safeNext("https://evil.example")).toBe("/picks");
    expect(safeNext(null)).toBe("/picks");
    expect(safeNext("/picks/resultater?type=vinder&antal=5")).toBe("/picks/resultater?type=vinder&antal=5");
    expect(safeNext("/")).toBe("/");
  });

  it("refuses paths a browser would turn into another site", () => {
    for (const v of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\\/evil.example", "/a\\b", "/ /evil.example", "/ x", "/\x7f/x"]) expect(safeNext(v)).toBe("/picks");
    expect(safeNext("/\t/evil.example", "/picks/liga")).toBe("/picks/liga");
  });
});

describe("Stripe webhooks", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "ping" });
  const sign = (t: number, b = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${b}`).digest("hex")}`;

  it("accepts a valid signature and rejects tampered or stale ones", () => {
    const now = 1_800_000_000;
    expect(verifyStripeSignature(body, sign(now), secret, now)).toBe(true);
    expect(verifyStripeSignature(body + " ", sign(now), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(now - 301), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(now), "whsec_other", now)).toBe(false);
  });

  it("maps subscription events onto plans", () => {
    const checkout = planUpdateFromEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", customer: "cus_1", client_reference_id: "usr_1" } } }, ACTIVE_STATUSES);
    expect(checkout).toMatchObject({ userId: "usr_1", customerId: "cus_1", plan: "pro" });
    const updated = planUpdateFromEvent({ type: "customer.subscription.updated", data: { object: { customer: "cus_1", status: "past_due", items: { data: [{ current_period_end: 1_800_000_000 }] } } } }, ACTIVE_STATUSES);
    expect(updated).toMatchObject({ plan: "pro", status: "past_due" });
    expect(updated?.renewsAt?.getTime()).toBe(1_800_000_000_000);
    const deleted = planUpdateFromEvent({ type: "customer.subscription.deleted", data: { object: { customer: "cus_1", status: "active" } } }, ACTIVE_STATUSES);
    expect(deleted).toMatchObject({ plan: "free", status: "canceled" });
    expect(planUpdateFromEvent({ type: "invoice.paid", data: { object: { customer: "cus_1" } } }, ACTIVE_STATUSES)).toBeNull();
  });
});

describe("The Odds API adapter", () => {
  it("maps sport keys onto ODDSIQ sports", () => {
    expect(sportIdFor("soccer_epl")).toBe("football");
    expect(sportIdFor("icehockey_nhl")).toBe("ice-hockey");
    expect(sportIdFor("cricket_ipl")).toBe("cricket");
  });

  it("normalizes h2h to 1X2 and totals at 2.5 to OU25, skipping incomplete markets", async () => {
    const { data } = await new FixtureFeed().odds("soccer_epl");
    const ars = data.find((e) => e.home === "Arsenal")!;
    expect(ars.kickoff).toBe(FIXTURE_KICKOFF);
    const books1x2 = new Set(ars.prices.filter((p) => p.market === "1X2").map((p) => p.bookmakerKey));
    expect([...books1x2].sort()).toEqual(["pinnacle", "williamhill"]); // unibet quoted only two outcomes
    const ou = ars.prices.filter((p) => p.market === "OU25");
    expect(ou.map((p) => `${p.bookmakerKey}:${p.selection}`).sort()).toEqual(["pinnacle:over", "pinnacle:under"]); // the 3.5 line is ignored
    expect(ars.prices.find((p) => p.bookmakerKey === "pinnacle" && p.selection === "draw")?.odds).toBe(3.55);
  });

  it("treats two-way h2h outside football as moneyline", () => {
    const [e] = normalizeOdds([
      { id: "x", sport_key: "basketball_nba", commence_time: "2026-10-03T00:00:00Z", home_team: "A", away_team: "B", bookmakers: [{ key: "k", title: "K", last_update: "2026-10-02T00:00:00Z", markets: [{ key: "h2h", outcomes: [{ name: "A", price: 1.5 }, { name: "B", price: 2.6 }] }] }] },
    ]);
    expect(e.prices.map((p) => `${p.market}:${p.selection}`)).toEqual(["ML:home", "ML:away"]);
  });

  it("reads scores and quota headers", () => {
    const [r] = normalizeScores([{ id: "x", sport_key: "soccer_epl", commence_time: "2026-10-03T14:00:00Z", completed: true, home_team: "A", away_team: "B", scores: [{ name: "B", score: "3" }, { name: "A", score: "1" }] }]);
    expect([r.homeScore, r.awayScore]).toEqual([1, 3]);
    expect(quotaFrom(new Headers({ "x-requests-remaining": "480", "x-requests-used": "20", "x-requests-last": "2" }))).toEqual({ remaining: 480, used: 20, last: 2 });
  });

  it("estimates credits per run from the settings", () => {
    expect(feedConfig({ ODDS_API_KEY: "k", ODDS_SPORTS: "soccer_epl, soccer_denmark_superliga", ODDS_REGIONS: "uk,eu", ODDS_MARKETS: "h2h,totals" }).creditsPerRun).toBe(8);
    expect(feedConfig({}).apiKey).toBeNull();
    expect(feedConfig({ ODDS_MARKETS: "spreads" }).markets).toBe("h2h");
  });
});

describe("ingestion helpers", () => {
  it("builds stable namespaced ids", () => {
    expect(slug("Borussia Mönchengladbach")).toBe("borussia-monchengladbach");
    const ids = feedIds("toa", { externalId: "abc", competitionKey: "soccer_epl", home: "Arsenal", away: "Chelsea" });
    expect(ids.selectionId("1X2", "draw")).toBe("toa-abc-1x2-draw");
    expect(ids.homeTeamId).toBe("toa-soccer_epl-arsenal");
  });

  it("computes each bookmaker's average margin over complete markets", async () => {
    const { data } = await new FixtureFeed().odds("soccer_epl");
    const m = bookMargins(data);
    expect(m.has("unibet_eu")).toBe(false);
    expect(m.get("pinnacle")!).toBeGreaterThan(0);
    expect(m.get("williamhill")!).toBeGreaterThan(m.get("pinnacle")!);
  });
});

describe("closing line", () => {
  const K = 10_000_000;
  const H = 3_600_000;
  const ids = ["h", "d", "a"];
  const pts = (book: string, at: number, odds: number[]) => ids.map((s, i) => ({ bookmakerId: book, selectionId: s, observedAt: at, odds: odds[i] }));

  it("uses each book's last price at or before kickoff", () => {
    const line = closingLine([...pts("b1", K - 3 * H, [2.2, 3.4, 3.6]), ...pts("b1", K - 10 * 60_000, [2.0, 3.5, 4.0]), ...pts("b1", K + 60_000, [1.5, 4, 7]), ...pts("b2", K - H, [2.1, 3.3, 3.8])], ids, K)!;
    expect(line.books).toBe(2);
    expect(line.selections[0].medianOdds).toBeCloseTo(2.05);
    expect(line.selections.reduce((s, x) => s + x.fairProbability, 0)).toBeCloseTo(1);
    expect(line.observedAt).toBe(K - 10 * 60_000);
  });

  it("keeps the consensus on The Odds API's books where API-Football's are added next to them", () => {
    const line = closingLine([...pts("toa-a", K - H, [2.0, 3.5, 4.0]), ...pts("toa-b", K - H, [2.2, 3.4, 3.6]), ...pts("apf-bet365", K - H, [1.5, 4, 7])], ids, K)!;
    expect(line.books).toBe(2);
    expect(line.selections[0].medianOdds).toBeCloseTo(2.1);
    expect(closingLine(pts("apf-bet365", K - H, [1.5, 4, 7]), ids, K)!.books).toBe(1);
  });

  it("ignores stale books and incomplete quotes", () => {
    expect(closingLine(pts("b1", K - 7 * H, [2, 3.5, 4]), ids, K)).toBeNull();
    const partial = pts("b2", K - H, [2, 3.5, 4]).slice(0, 2);
    expect(closingLine([...partial, ...pts("b1", K - H, [2, 3.5, 4])], ids, K)!.books).toBe(1);
  });

  it("settles markets from the final score", () => {
    expect(settle("1X2", "draw", 1, 1)).toBe("won");
    expect(settle("1X2", "home", 1, 1)).toBe("lost");
    expect(settle("OU25", "over", 2, 1)).toBe("won");
    expect(settle("ML", "home", 2, 2)).toBe("void");
    expect(settle("BTTS", "yes", 1, 1)).toBe("won");
    expect(settle("BTTS", "no", 2, 0)).toBe("won");
    expect(settle("DC", "1x", 1, 1)).toBe("won");
    expect(settle("DC", "x2", 2, 1)).toBe("lost");
    expect(settle("DC", "12", 0, 0)).toBe("lost");
  });
});
