import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { matchOutcomes, readRecordedPicks } from "./pick-records";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 8, 15, 30);

const record = (eventId: string, kickoff: number, category: string, spec: string, odds: number | null, teams = ["Manchester United", "Tottenham Hotspur"]) => ({
  eventId,
  kickoff: new Date(kickoff),
  leagueName: "Premier League",
  leagueCode: "en.1",
  home: teams[0],
  away: teams[1],
  category,
  outcome: "x",
  spec,
  probability: 0.6,
  odds,
});

// e1 has its score on the event; e2 only in the results CSV, under other spellings; e3 has nothing yet.
const RECORDS = [
  record("apf-e1", NOW - 3 * HOUR, "vinder", "1X2:home", 2.1),
  record("apf-e1", NOW - 3 * HOUR, "maal", "OU:over:2.5", 1.9),
  record("apf-e1", NOW - 3 * HOUR, "hjorne", "COUNT:corners:over@9.5", null),
  record("apf-e2", NOW - 2 * DAY, "vinder", "1X2:away", 3.4, ["Arsenal", "Chelsea"]),
  record("apf-e2", NOW - 2 * DAY, "kort", "COUNT:cards:under@3.5", null, ["Arsenal", "Chelsea"]),
  record("apf-e2", NOW - 2 * DAY, "dobbelt", "DC:X2", 1.6, ["Arsenal", "Chelsea"]),
  record("apf-e3", NOW - 4 * DAY, "btts", "BTTS:yes", 1.8, ["Leeds United", "Fulham"]),
];

function stub() {
  const calls = { odds: 0 };
  const prisma = {
    pickRecord: { findMany: async () => RECORDS },
    event: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => (id === "apf-e1" ? { id, status: "finished", homeScore: 2, awayScore: 1 } : { id, status: "scheduled", homeScore: null, awayScore: null })),
    },
    matchStat: {
      findMany: async () => [
        { league: "en.1", date: new Date(NOW - 3 * HOUR), home: "Man United", away: "Tottenham", hg: 2, ag: 1, hthg: 1, htag: 0, hc: 6, ac: 5, hcards: 2, acards: 3, hf: 10, af: 12 },
        { league: "en.1", date: new Date(NOW - 2 * DAY), home: "Arsenal FC", away: "Chelsea FC", hg: 0, ag: 0, hthg: 0, htag: 0, hc: 4, ac: 3, hcards: 1, acards: 1, hf: 9, af: 8 },
      ],
    },
    oddsSnapshot: {
      findMany: async ({ where }: { where: { selectionId: { in: string[] } } }) => {
        calls.odds++;
        const price: Record<string, number> = { home: 2, draw: 3.5, away: 4, over: 1.8, under: 2 };
        return where.selectionId.in.flatMap((id) => {
          const kickoff = RECORDS.find((r) => id.startsWith(`${r.eventId}-`))!.kickoff.getTime();
          return ["apf-bet365", "apf-bwin"].map((bookmakerId) => ({ selectionId: id, bookmakerId, observedAt: new Date(kickoff - HOUR), odds: price[id.slice(id.lastIndexOf("-") + 1)] ?? 2 }));
        });
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, calls };
}

describe("recorded picks", () => {
  it("settles and adds the closing line by default", async () => {
    const { prisma, calls } = stub();
    const picks = await readRecordedPicks(prisma, NOW, 7);
    expect(calls.odds).toBe(1);
    expect(picks.map((p) => p.result)).toEqual(["won", "won", "won", "lost", "won", "won", null]);
    expect(picks[0].close).toMatchObject({ odds: 2, books: 2 });
    expect(picks[2].close).toBeNull();
    expect(picks[3].close).toMatchObject({ odds: 4, books: 2 });
    expect(picks[3].close!.clv).toBeCloseTo(3.4 * picks[3].close!.probability - 1, 10);
  });

  it("leaves out the closing lines without asking for the odds", async () => {
    const { prisma, calls } = stub();
    const without = await readRecordedPicks(prisma, NOW, 7, { close: false });
    expect(calls.odds).toBe(0);
    expect(without.every((p) => p.close === undefined)).toBe(true);
    const full = await readRecordedPicks(stub().prisma, NOW, 7);
    expect(without).toEqual(full.map((p) => ({ ...p, close: undefined })));
  });

  it("settles every bet type of a match the same way as one at a time", async () => {
    const { prisma } = stub();
    const together = await matchOutcomes(prisma, RECORDS);
    const alone = await Promise.all(RECORDS.map(async (r) => (await matchOutcomes(prisma, [r]))[0]));
    expect(together).toEqual(alone);
    expect(together[0]).toEqual({ goals: [2, 1], ht: [1, 0], corners: [6, 5], cards: [2, 3], fouls: [10, 12] });
    expect(together[3]).toEqual({ goals: [0, 0], ht: [0, 0], corners: [4, 3], cards: [1, 1], fouls: [9, 8] });
    expect(together[6]).toEqual({ goals: null, ht: null, corners: null, cards: null, fouls: null });
  });
});
