import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { fixtureFromRow, refreshLineups, refreshLineupsOnVisit } from "./lineups";
import type { StatsFeed, TeamLineup } from "./types";

const NOW = Date.parse("2026-10-04T17:30:00Z");
const row = (id: string, kickoff: number, eventId = `apf-${id}`) => ({
  id: `api-football:${id}`,
  provider: "api-football",
  leagueId: 5,
  eventId,
  kickoff: new Date(kickoff),
  home: "Denmark",
  away: "Spain",
  status: "scheduled",
  homeGoals: null,
  awayGoals: null,
  homeTeamId: 21,
  awayTeamId: 9,
});
const lineup = (side: "home" | "away"): TeamLineup => ({ side, team: side, formation: "4-3-3", coach: null, startXI: [{ name: "A", number: 1, pos: "G" }], substitutes: [] });

function fakes(rows: ReturnType<typeof row>[], published: Set<string>) {
  const calls = { where: null as unknown, upserts: 0, confirmed: [] as string[], asked: [] as string[] };
  const prisma = {
    statsFixture: {
      findMany: async (q: { where: unknown }) => ((calls.where = q.where), rows),
      update: async () => ({}),
    },
    teamLineup: { upsert: async () => (calls.upserts++, {}) },
    event: { update: async (q: { where: { id: string } }) => (calls.confirmed.push(q.where.id), {}) },
  } as unknown as PrismaClient;
  const feed = {
    provider: "api-football",
    lineups: async (f: { id: string }) => (calls.asked.push(f.id), { data: published.has(f.id) ? [lineup("home"), lineup("away")] : [], quota: { remaining: 7000, limit: 7500 } }),
  } as unknown as StatsFeed;
  return { prisma, feed, calls };
}

describe("refreshLineups", () => {
  it("asks only for matched fixtures near kickoff and stores published lineups", async () => {
    const { prisma, feed, calls } = fakes([row("1", NOW + 45 * 60_000), row("2", NOW + 80 * 60_000)], new Set(["1"]));
    const s = await refreshLineups(prisma, feed, { now: NOW });
    expect(calls.asked).toEqual(["1", "2"]);
    expect(s).toMatchObject({ due: 2, fetched: 1, requests: 2, error: null });
    expect(calls.upserts).toBe(2);
    expect(calls.confirmed).toEqual(["apf-1"]);
    const where = calls.where as { lineupsAt: null; kickoff: { gte: Date; lte: Date } };
    expect(where.lineupsAt).toBeNull();
    expect(where.kickoff.lte.getTime()).toBe(NOW + 90 * 60_000);
  });

  it("does nothing when no match is near", async () => {
    const { prisma, feed, calls } = fakes([], new Set());
    expect(await refreshLineups(prisma, feed, { now: NOW })).toMatchObject({ due: 0, requests: 0 });
    expect(calls.asked).toEqual([]);
  });

  it("turns a stored row back into the provider's fixture", () => {
    const f = fixtureFromRow(row("123", NOW));
    expect(f).toMatchObject({ id: "123", home: "Denmark", homeId: 21, kickoff: NOW, status: "scheduled" });
  });
});

describe("refreshLineupsOnVisit", () => {
  it("lets one visit per interval call the provider", async () => {
    const { prisma, feed, calls } = fakes([row("1", NOW + 30 * 60_000)], new Set(["1"]));
    let last: number | null = null;
    (prisma as unknown as { playerStatsSync: object }).playerStatsSync = {
      updateMany: async (q: { where: { fetchedAt: { lt: Date } } }) => {
        if (last === null || last >= q.where.fetchedAt.lt.getTime()) return { count: 0 };
        last = NOW;
        return { count: 1 };
      },
      createMany: async () => {
        if (last !== null) return { count: 0 };
        last = NOW;
        return { count: 1 };
      },
    };
    expect(await refreshLineupsOnVisit(prisma, feed, NOW)).toMatchObject({ fetched: 1 });
    expect(await refreshLineupsOnVisit(prisma, feed, NOW + 60_000)).toBeNull();
    expect(await refreshLineupsOnVisit(prisma, feed, NOW + 5 * 60_000)).toMatchObject({ due: 1 });
    expect(calls.asked).toEqual(["1", "1"]);
  });
});
