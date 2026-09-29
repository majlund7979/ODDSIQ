// Tamper-evident prediction ledger. Each entry's hash covers its own immutable
// fields plus the previous entry's hash, so changing, removing or reordering
// any past prediction breaks every hash after it.

import { createHash } from "node:crypto";
import type { Prediction } from "@/lib/domain/types";

export const GENESIS_HASH = "0".repeat(64);

export type UnhashedPrediction = Omit<Prediction, "hash" | "prevHash">;

/** Fixed field order; numbers rendered with full precision. */
export function canonicalPayload(p: UnhashedPrediction, prevHash: string): string {
  return [
    p.seq,
    p.id,
    new Date(p.createdAt).toISOString(),
    p.eventId,
    p.marketId,
    p.selectionId,
    p.modelVersionId,
    p.probability.toFixed(6),
    p.ciLow.toFixed(6),
    p.ciHigh.toFixed(6),
    p.confidence,
    p.odds.toFixed(3),
    p.bookmakerId,
    prevHash,
  ].join("|");
}

export function hashPrediction(p: UnhashedPrediction, prevHash: string): string {
  return createHash("sha256").update(canonicalPayload(p, prevHash)).digest("hex");
}

/** Appends to a chain and returns a frozen entry. */
export function appendPrediction(chain: readonly Prediction[], p: Omit<UnhashedPrediction, "seq">): Prediction {
  const prevHash = chain.length ? chain[chain.length - 1].hash : GENESIS_HASH;
  const seq = chain.length + 1;
  const entry = { ...p, seq };
  return Object.freeze({ ...entry, prevHash, hash: hashPrediction(entry, prevHash) });
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  /** First sequence number where the chain breaks, if any. */
  brokenAt: number | null;
  reason: string | null;
}

export function verifyChain(chain: readonly Prediction[]): ChainVerification {
  let prev = GENESIS_HASH;
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    if (p.seq !== i + 1) return { ok: false, checked: i, brokenAt: p.seq, reason: "Sequence gap (missing or deleted prediction)" };
    if (p.prevHash !== prev) return { ok: false, checked: i, brokenAt: p.seq, reason: "Link to previous prediction does not match" };
    if (hashPrediction(p, p.prevHash) !== p.hash) return { ok: false, checked: i, brokenAt: p.seq, reason: "Prediction content changed after it was recorded" };
    prev = p.hash;
  }
  return { ok: true, checked: chain.length, brokenAt: null, reason: null };
}
