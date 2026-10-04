import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { settleFeed } from "./settle-on-visit";
import type { OddsFeed } from "./types";

const NOW = Date.parse("2026-10-04T19:00:00Z");
const quota = { used: 1, remaining: 7000, last: 1 };

function fakes(pendingLeagues: string[]) {
  const finished: string[] = [];
  const asked: string[] = [];
  const prisma = {
    event: {
      findMany: async () => pendingLeagues.map((leagueId) => ({ leagueId })),
      count: async (q: { where: { leagueId: string } }) => (pendingLeagues.includes(q.where.leagueId) ? 1 : 0),
      findUnique: async () => ({ status: "scheduled", markets: [{ type: "1X2", selections: [] }] }),
      update: async (q: { where: { id: string } }) => (finished.push(q.where.id), {}),
    },
    scoreUpdate: { create: async () => ({}) },
    selection: { update: async () => ({}) },
  } as unknown as PrismaClient;
  const feed = {
    competitions: async () => ({ data: [{ key: "soccer_international_friendlies", sportId: "football", name: "Friendlies", group: "Soccer", active: true }], quota }),
    results: async (key: string) => (
      asked.push(key),
      { data: [{ externalId: "9", competitionKey: key, kickoff: NOW - 3 * 3_600_000, home: "Argentina", away: "Burkina Faso", homeScore: 3, awayScore: 0, completed: true }], quota }
    ),
  } as unknown as OddsFeed;
  return { prisma, feed, finished, asked };
}

describe("settleFeed", () => {
  it("settles finished matches in competitions the feed still lists", async () => {
    const { prisma, feed, finished, asked } = fakes(["apf-soccer_international_friendlies", "apf-soccer_gone"]);
    const s = await settleFeed(prisma, feed, "apf", NOW);
    expect(asked).toEqual(["soccer_international_friendlies"]);
    expect(s).toEqual({ competitions: 1, results: 1, error: null });
    expect(finished).toHaveLength(1);
  });

  it("does not call the feed when nothing is waiting", async () => {
    const { prisma, feed, asked } = fakes([]);
    expect(await settleFeed(prisma, feed, "apf", NOW)).toEqual({ competitions: 0, results: 0, error: null });
    expect(asked).toEqual([]);
  });
});
