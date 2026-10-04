import { describe, expect, it } from "vitest";
import { dayFixtures, findFixture, liveState, normalizeFixtures, type LiveFixture } from "./scores";

const K = Date.UTC(2026, 9, 4, 18);
const fx = (o: Partial<LiveFixture>): LiveFixture => ({ id: "1", home: "Arsenal", away: "Chelsea", kickoff: K, status: "2H", minute: 62, goals: [1, 0], ...o });

describe("live scores", () => {
  it("reads API-Football fixtures", () => {
    const [f] = normalizeFixtures([{ fixture: { id: 7, timestamp: K / 1000, status: { short: "1H", elapsed: 12 } }, teams: { home: { name: "A" }, away: { name: "B" } }, goals: { home: 0, away: null } }]);
    expect(f).toEqual({ id: "7", home: "A", away: "B", kickoff: K, status: "1H", minute: 12, goals: null });
  });

  it("finds the fixture by id or by kickoff and names", () => {
    const list = [fx({ id: "11", home: "Manchester United", away: "West Ham United" }), fx({ id: "12" })];
    expect(findFixture({ eventId: "apf-12", home: "x", away: "y", kickoff: 0 }, list)?.id).toBe("12");
    expect(findFixture({ eventId: "toa-abc", home: "Man United", away: "West Ham", kickoff: K + 5 * 60_000 }, list)?.id).toBe("11");
    expect(findFixture({ eventId: "toa-abc", home: "Arsenal", away: "Chelsea", kickoff: K + 3 * 3_600_000 }, list)).toBeNull();
  });

  it("says how the bet stands on the current score", () => {
    expect(liveState("1X2:home", fx({}))).toEqual({ clock: "62'", score: [1, 0], state: "won", finished: false });
    expect(liveState("OU:over:2.5", fx({ status: "HT", minute: 45 }))).toMatchObject({ clock: "Pause", state: "lost" });
    expect(liveState("BTTS:no", fx({ status: "FT", minute: 90 }))).toMatchObject({ clock: "Slut", state: "won", finished: true });
    expect(liveState("COUNT:corners:over@9.5", fx({})).state).toBeNull();
  });

  it("fetches a day once a minute", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ response: [], errors: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await dayFixtures("k", "2026-10-04", K, fetchImpl);
    await dayFixtures("k", "2026-10-04", K + 30_000, fetchImpl);
    await dayFixtures("k", "2026-10-04", K + 61_000, fetchImpl);
    expect(calls).toBe(2);
  });
});
