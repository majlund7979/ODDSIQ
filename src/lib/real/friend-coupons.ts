// Coupons the friends play from "Din kupon". Like single bets, every leg is
// copied from the page's own pick (found again by match and bet type), so
// nobody can save a probability or a match the page never showed.

import type { PrismaClient } from "@/generated/prisma/client";
import { couponResult, displayName, type FriendBet } from "@/lib/friends";
import { settle, type PickDraft } from "@/lib/picks-extra";
import { leagueCodeOf, matchOutcomes } from "./pick-records";

export const MIN_COUPON_LEGS = 2;
export const MAX_COUPON_LEGS = 5;
const SETTLE_AFTER_MS = 2 * 3_600_000;

/** Combined chance and best odds of the legs; odds are null when a leg has none. Pure. */
export function couponTotals(drafts: Pick<PickDraft, "probability" | "odds">[]): { probability: number; odds: number | null } {
  const probability = drafts.reduce((s, d) => s * d.probability, 1);
  const odds = drafts.every((d) => d.odds && d.odds > 1) ? drafts.reduce((s, d) => s * d.odds!, 1) : null;
  return { probability, odds };
}

export async function saveFriendCoupon(prisma: PrismaClient, userId: string, drafts: PickDraft[], odds: number | null, stake: number): Promise<void> {
  await prisma.friendCoupon.create({
    data: {
      userId,
      stake,
      odds,
      legs: {
        create: drafts.map((d) => {
          const [home, away] = d.row.match.split(" vs ");
          return {
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
            odds: d.odds,
          };
        }),
      },
    },
  });
}

/** Removes a friend's own coupon, only before its first match kicks off. */
export async function deleteFriendCoupon(prisma: PrismaClient, userId: string, id: bigint, now: number): Promise<void> {
  const c = await prisma.friendCoupon.findFirst({ where: { id, userId }, include: { legs: { select: { kickoff: true } } } });
  if (c && c.legs.every((l) => l.kickoff.getTime() > now)) await prisma.friendCoupon.delete({ where: { id } });
}

/**
 * Played coupons as league bets: one bet each, dated by its last match (so a
 * coupon falls in the period it is settled in), newest first. Ids start with
 * "k" so they never clash with single bets.
 */
export async function readFriendCoupons(prisma: PrismaClient, now: number, since: number | null): Promise<FriendBet[]> {
  const coupons = await prisma.friendCoupon.findMany({
    where: since === null ? {} : { legs: { some: { kickoff: { gte: new Date(since) } } } },
    include: { legs: { orderBy: { kickoff: "asc" } }, user: { select: { email: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const done = coupons.flatMap((c) => c.legs).filter((l) => l.kickoff.getTime() <= now - SETTLE_AFTER_MS);
  const outcomes = new Map((await matchOutcomes(prisma, done)).map((o, i) => [done[i].id, o]));
  return coupons
    .filter((c) => c.legs.length > 0)
    .map((c) => {
      const legs = c.legs.map((l) => {
        const o = outcomes.get(l.id);
        return { match: `${l.home} vs ${l.away}`, outcome: l.outcome, kickoff: l.kickoff.getTime(), probability: l.probability, result: o ? settle(l.spec, o) : null };
      });
      const last = c.legs[c.legs.length - 1];
      return {
        id: `k${c.id}`,
        userId: c.userId,
        name: displayName(c.user.displayName, c.user.email),
        kickoff: last.kickoff.getTime(),
        league: [...new Set(c.legs.map((l) => l.leagueName))].join(", "),
        match: `${legs.length} kampe`,
        category: "kupon",
        outcome: `${legs.length} bets`,
        probability: legs.reduce((s, l) => s * l.probability, 1),
        odds: c.odds,
        stake: c.stake,
        result: couponResult(legs),
        legs,
      };
    });
}
