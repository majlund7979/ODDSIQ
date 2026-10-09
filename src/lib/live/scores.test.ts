import { describe, expect, it, vi } from "vitest";
import { dayFixtures, findFixture, liveState, liveTone, normalizeFixtures, type LiveFixture } from "./scores";

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
    expect(liveState("1X2:home", fx({}))).toEqual({ clock: "62'", score: [1, 0], state: "won", tone: "winning", finished: false });
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

  it("shares one request between callers at the same time", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ response: [], errors: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const [a, b] = await Promise.all([dayFixtures("k", "2026-10-05", K, fetchImpl), dayFixtures("k", "2026-10-05", K, fetchImpl)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it("gives up on API-Football after three seconds, retries included", async () => {
    vi.useFakeTimers();
    // Node's own AbortSignal.timeout does not run on the test clock; this one does.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), ms);
      return c.signal;
    });
    try {
      // Like fetch with no answer: it only ends when its signal aborts.
      const hang = ((_: string, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
      let outcome: unknown = "waiting";
      dayFixtures("k", "2026-10-06", K, hang).then(
        () => (outcome = "answered"),
        (e) => (outcome = e),
      );
      await vi.advanceTimersByTimeAsync(2_999);
      expect(outcome).toBe("waiting");
      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toMatchObject({ name: "TimeoutError" });
      expect(timeout).toHaveBeenCalledWith(3000);
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("liveTone", () => {
  it("colours each bet by how it stands on the score", () => {
    expect(liveTone("1X2:home", [0, 0], false)).toBe("neutral");
    expect(liveTone("1X2:home", [1, 0], false)).toBe("winning");
    expect(liveTone("1X2:home", [0, 1], false)).toBe("behind");
    expect(liveTone("1X2:home", [0, 1], true)).toBe("lost");
    expect(liveTone("1X2:home", [2, 1], true)).toBe("won");
    // Over 2,5: no goal or one goal is behind, two goals is level, three is home already.
    expect(liveTone("OU:over:2.5", [0, 0], false)).toBe("behind");
    expect(liveTone("OU:over:2.5", [1, 0], false)).toBe("behind");
    expect(liveTone("OU:over:2.5", [1, 1], false)).toBe("neutral");
    expect(liveTone("OU:over:2.5", [2, 1], false)).toBe("won");
    expect(liveTone("OU:under:2.5", [1, 1], false)).toBe("winning");
    expect(liveTone("OU:under:2.5", [2, 1], false)).toBe("lost");
    expect(liveTone("BTTS:yes", [1, 0], false)).toBe("neutral");
    expect(liveTone("BTTS:yes", [1, 1], false)).toBe("won");
    expect(liveTone("BTTS:no", [1, 1], false)).toBe("lost");
    expect(liveTone("DC:1X", [0, 0], false)).toBe("winning");
    expect(liveTone("DC:1X", [0, 1], false)).toBe("behind");
    expect(liveTone("COUNT:corners:over@9.5", [0, 0], false)).toBe("unknown");
  });
});
