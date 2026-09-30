// Appends predictions to the database ledger. A transaction-scoped advisory
// lock serialises writers, so two jobs can never race for the same sequence
// number; the database triggers reject anything that does not extend the chain.

import type { PrismaClient } from "@/generated/prisma/client";
import { GENESIS_HASH, hashPrediction } from "./hash";
import type { UnhashedPrediction } from "./hash";

const LEDGER_LOCK = 7_318_004;

export async function appendPredictions(prisma: PrismaClient, entries: Omit<UnhashedPrediction, "seq">[]): Promise<number> {
  if (!entries.length) return 0;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK})`;
    const last = await tx.prediction.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
    let seq = last?.seq ?? 0;
    let prevHash = last?.hash ?? GENESIS_HASH;
    for (const e of entries) {
      seq++;
      const entry = { ...e, seq };
      const hash = hashPrediction(entry, prevHash);
      await tx.prediction.create({ data: { ...entry, createdAt: new Date(e.createdAt), prevHash, hash } });
      prevHash = hash;
    }
    return entries.length;
  });
}
