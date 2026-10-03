// Reads and writes the friends' saved bets. A bet is always copied from the
// page's own pick (found again by match and bet type), so nobody can save a
// probability or a match the page never showed.

import type { PrismaClient } from "@/generated/prisma/client";
import { displayName, type FriendBet } from "@/lib/friends";
import { allPickDrafts, settle, type PickDraft } from "@/lib/picks-extra";
import type { Terminal } from "@/lib/terminal";
import { leagueCodeOf, matchOutcomes } from "./pick-records";

/** Enough picks per bet type to cover every card the page can show. */
const DRAFT_COUNT = 50;
const SETTLE_AFTER_MS = 2 * 3_600_000;

/** The pick the page shows for this match and bet type, if it is still open. */
export function findDraft(t: Terminal, eventId: string, category: string): PickDraft | null {
  return allPickDrafts(t.marketRows(), t.now, DRAFT_COUNT, t.pickContext).find((d) => d.row.eventId === eventId && d.category === category) ?? null;
}

export async function saveFriendBet(prisma: PrismaClient, userId: string, d: PickDraft, odds: number | null, stake: number): Promise<void> {
  const [home, away] = d.row.match.split(" vs ");
  const data = {
    userId,
    eventId: d.row.eventId,
    kickoff: new Date(d.row.kickoff),
    leagueName: d.row.league,
    leagueCode: leagueCodeOf(d.row.leagueId),
    home,
    away,
    category: d.category,
    outcome: d.outcome,
    spec: d.spec,
    probability: d.probability,
    odds,
    stake,
  };
  await prisma.friendBet.upsert({
    where: { userId_eventId_spec: { userId, eventId: d.row.eventId, spec: d.spec } },
    create: data,
    update: { odds, stake },
  });
}

/** Removes a friend's own bet, only before kickoff. */
export async function deleteFriendBet(prisma: PrismaClient, userId: string, id: bigint, now: number): Promise<void> {
  await prisma.friendBet.deleteMany({ where: { id, userId, kickoff: { gt: new Date(now) } } });
}

/** Saved bets with kickoff from `since` (all when null), newest first, settled where the result is known. */
export async function readFriendBets(prisma: PrismaClient, now: number, since: number | null): Promise<FriendBet[]> {
  const rows = await prisma.friendBet.findMany({
    where: since === null ? {} : { kickoff: { gte: new Date(since) } },
    include: { user: { select: { email: true, displayName: true } } },
    orderBy: { kickoff: "desc" },
    take: 2000,
  });
  const done = rows.filter((r) => r.kickoff.getTime() <= now - SETTLE_AFTER_MS);
  const outcomes = new Map((await matchOutcomes(prisma, done)).map((o, i) => [done[i].id, o]));
  return rows.map((r) => {
    const o = outcomes.get(r.id);
    return {
      id: String(r.id),
      userId: r.userId,
      name: displayName(r.user.displayName, r.user.email),
      kickoff: r.kickoff.getTime(),
      league: r.leagueName,
      match: `${r.home} vs ${r.away}`,
      category: r.category,
      outcome: r.outcome,
      probability: r.probability,
      odds: r.odds,
      stake: r.stake,
      result: o ? settle(r.spec, o) : null,
    };
  });
}

/** The current user's saved bets on matches that have not kicked off, keyed by "eventId|category". */
export async function openBetKeys(prisma: PrismaClient, userId: string, now: number): Promise<Set<string>> {
  const rows = await prisma.friendBet.findMany({ where: { userId, kickoff: { gt: new Date(now) } }, select: { eventId: true, category: true } });
  return new Set(rows.map((r) => `${r.eventId}|${r.category}`));
}
