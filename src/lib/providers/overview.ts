// Read model for the Data Feed page: recent ingestion runs and the latest (or
// closing) consensus for every feed event around now.

import type { PrismaClient } from "@/generated/prisma/client";
import { closingLine, type ClosingLine } from "./closing";

const DAY = 86_400_000;

export interface FeedEventRow {
  id: string;
  league: string;
  home: string;
  away: string;
  kickoff: number;
  status: string;
  score: string | null;
  market: string | null;
  /** Consensus at the latest observation, or the closing line once kicked off. */
  line: (ClosingLine & { basis: "latest" | "closing"; names: string[]; results: (string | null)[] }) | null;
  snapshots: number;
  /** Statistics feed status for the match, if it has been matched. */
  teamNews: { lineups: boolean; absences: number | null; xg: string | null } | null;
}

export async function feedOverview(prisma: PrismaClient, now: number) {
  const runs = await prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  const events = await prisma.event.findMany({
    where: { externalId: { not: null }, kickoff: { gt: new Date(now - 3 * DAY), lt: new Date(now + 10 * DAY) } },
    orderBy: { kickoff: "asc" },
    take: 60,
    include: {
      league: true,
      homeTeam: true,
      awayTeam: true,
      markets: { where: { type: { in: ["1X2", "ML"] } }, include: { selections: { orderBy: { id: "asc" }, include: { snapshots: { orderBy: { observedAt: "asc" } } } } } },
      statsFixtures: { orderBy: { syncedAt: "desc" }, take: 1, include: { _count: { select: { injuries: true } } } },
    },
  });

  const rows: FeedEventRow[] = events.map((e) => {
    const kickoff = e.kickoff.getTime();
    const m = e.markets[0];
    const order = (id: string) => ["home", "draw", "away"].findIndex((k) => id.endsWith(`-${k}`));
    const sels = m ? [...m.selections].sort((a, b) => order(a.id) - order(b.id)) : [];
    const points = sels.flatMap((s) => s.snapshots.map((p) => ({ bookmakerId: p.bookmakerId, selectionId: s.id, observedAt: p.observedAt.getTime(), odds: Number(p.odds) })));
    const basis = now >= kickoff ? "closing" : "latest";
    const line = sels.length ? closingLine(points, sels.map((s) => s.id), Math.min(now, kickoff)) : null;
    return {
      id: e.id,
      league: e.league.name,
      home: e.homeTeam.name,
      away: e.awayTeam.name,
      kickoff,
      status: e.status,
      score: e.homeScore !== null && e.awayScore !== null ? `${e.homeScore}–${e.awayScore}` : null,
      market: m?.type ?? null,
      line: line ? { ...line, basis, names: sels.map((s) => s.name), results: sels.map((s) => s.result) } : null,
      snapshots: points.length,
      teamNews: e.statsFixtures[0]
        ? {
            lineups: e.statsFixtures[0].lineupsAt !== null,
            absences: e.statsFixtures[0].injuriesAt !== null ? e.statsFixtures[0]._count.injuries : null,
            xg: e.statsFixtures[0].homeXg !== null && e.statsFixtures[0].awayXg !== null ? `${e.statsFixtures[0].homeXg.toFixed(2)}–${e.statsFixtures[0].awayXg.toFixed(2)}` : null,
          }
        : null,
    };
  });
  return { runs, events: rows };
}
