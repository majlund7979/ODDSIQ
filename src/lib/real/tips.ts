// Reads and writes the weekly tipping game. A tip is copied from the page's
// own match (found again by event id), so nobody can tip a match the page
// never showed, and it can only change before kickoff.

import type { PrismaClient } from "@/generated/prisma/client";
import { displayName } from "@/lib/friends";
import { modelPick, resultOf, weekOf, type Side, type Tip, type TipMatch } from "@/lib/tips";
import { leagueCodeOf, matchOutcomes } from "./pick-records";

const SETTLE_AFTER_MS = 2 * 3_600_000;

/** Saves or changes a tip. Returns false when the match has kicked off. */
export async function saveTip(prisma: PrismaClient, userId: string, m: TipMatch, pick: Side, now: number): Promise<boolean> {
  if (m.kickoff <= now) return false;
  const data = { pick, odds: m.odds[pick], modelPick: modelPick(m.model) };
  // Only a tip on a match that has not started may change.
  const changed = await prisma.tipPick.updateMany({ where: { userId, eventId: m.eventId, kickoff: { gt: new Date(now) } }, data });
  if (changed.count) return true;
  if (await prisma.tipPick.findUnique({ where: { userId_eventId: { userId, eventId: m.eventId } }, select: { id: true } })) return false;
  await prisma.tipPick.create({
    data: { userId, eventId: m.eventId, week: weekOf(m.kickoff).id, kickoff: new Date(m.kickoff), home: m.home, away: m.away, league: m.league, leagueCode: leagueCodeOf(m.leagueId), ...data },
  });
  return true;
}

/**
 * Every tip (newest first), settled from the page's own results where it has
 * them, else from stored scores and the results CSVs. `settle: false` uses only
 * the page's own results, for a page that shows no standings.
 */
export async function readTips(prisma: PrismaClient, now: number, known: Map<string, Side | null>, { settle = true }: { settle?: boolean } = {}): Promise<Tip[]> {
  const rows = await prisma.tipPick.findMany({ include: { user: { select: { email: true, displayName: true } } }, orderBy: { kickoff: "desc" }, take: 5000 });
  const open = settle ? rows.filter((r) => !known.get(r.eventId) && r.kickoff.getTime() <= now - SETTLE_AFTER_MS) : [];
  const outcomes = new Map((await matchOutcomes(prisma, open)).map((o, i) => [open[i].id, resultOf(o.goals)]));
  return rows.map((r) => ({
    userId: r.userId,
    name: displayName(r.user.displayName, r.user.email),
    eventId: r.eventId,
    week: r.week,
    kickoff: r.kickoff.getTime(),
    home: r.home,
    away: r.away,
    pick: r.pick as Side,
    odds: r.odds,
    modelPick: (r.modelPick as Side | null) ?? null,
    result: known.get(r.eventId) ?? outcomes.get(r.id) ?? null,
  }));
}
