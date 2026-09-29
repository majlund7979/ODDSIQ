import { describe, expect, it } from "vitest";
import type { Prediction } from "@/lib/domain/types";
import { appendPrediction, GENESIS_HASH, verifyChain } from "./hash";

function build(n: number): Prediction[] {
  const chain: Prediction[] = [];
  for (let i = 0; i < n; i++) {
    chain.push(
      appendPrediction(chain, {
        id: `p${i}`,
        createdAt: Date.UTC(2026, 0, 1) + i * 60_000,
        eventId: "e",
        marketId: "m",
        selectionId: `s${i}`,
        modelVersionId: "football-ensemble-v1.4",
        probability: 0.5 + i / 100,
        ciLow: 0.45,
        ciHigh: 0.6,
        confidence: 70,
        odds: 2.05,
        bookmakerId: "kestrel",
      }),
    );
  }
  return chain;
}

describe("prediction ledger", () => {
  it("chains entries from the genesis hash", () => {
    const chain = build(5);
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    expect(chain[1].prevHash).toBe(chain[0].hash);
    expect(chain.map((p) => p.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(verifyChain(chain)).toMatchObject({ ok: true, checked: 5 });
  });

  it("freezes entries so they cannot be mutated in memory", () => {
    const [p] = build(1);
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => {
      (p as { probability: number }).probability = 0.9;
    }).toThrow();
  });

  it("detects a changed prediction", () => {
    const chain = build(5);
    chain[2] = { ...chain[2], probability: 0.9 };
    expect(verifyChain(chain)).toMatchObject({ ok: false, brokenAt: 3, reason: expect.stringContaining("changed") });
  });

  it("detects a deleted prediction", () => {
    const chain = build(5);
    chain.splice(1, 1);
    expect(verifyChain(chain)).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it("detects re-ordering and back-dating", () => {
    const chain = build(5);
    const reordered = [chain[0], chain[2], chain[1], chain[3], chain[4]];
    expect(verifyChain(reordered).ok).toBe(false);
    const backdated = build(5);
    backdated[3] = { ...backdated[3], createdAt: backdated[3].createdAt - 86_400_000 };
    expect(verifyChain(backdated)).toMatchObject({ ok: false, brokenAt: 4 });
  });
});
