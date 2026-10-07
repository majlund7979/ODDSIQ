// Records the picks shown on Dagens bedste bets the first time they appear,
// and reads them back settled for the results board.

import type { PrismaClient } from "@/generated/prisma/client";
import { leagueForOddsKey } from "@/lib/model/openfootball";
import { matchTeam } from "@/lib/model/teams";
import { allPickDrafts, settle, type MatchOutcome, type RecordedPick } from "@/lib/picks-extra";
import type { Terminal } from "@/lib/terminal";
import { closes } from "./clv";

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const RECORD_COUNT = 10;
export const RESULTS_DAYS = 7;

export const leagueCodeOf = (leagueId: string) => leagueForOddsKey(leagueId.slice(leagueId.indexOf("-") + 1))?.code ?? null;

export async function recordPicks(prisma: PrismaClient, t: Terminal): Promise<number> {
  const drafts = allPickDrafts(t.marketRows(), t.now, RECORD_COUNT, t.pickContext, t.sharpBooks);
  if (!drafts.length) return 0;
  const r = await prisma.pickRecord.createMany({
    data: drafts.map((d) => {
      const [home, away] = d.row.match.split(" vs ");
      return {
        createdAt: new Date(t.now),
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
    skipDuplicates: true,
  });
  return r.count;
}

const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Copenhagen" });

interface SettleRow {
  eventId: string;
  kickoff: Date;
  leagueCode: string | null;
  home: string;
  away: string;
}

/** What happened in each row's match, from the event's score and the match stats; fields stay null until known. */
export async function matchOutcomes(prisma: PrismaClient, rows: SettleRow[]): Promise<MatchOutcome[]> {
  if (!rows.length) return [];
  const events = await prisma.event.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.eventId))] } }, select: { id: true, status: true, homeScore: true, awayScore: true } });
  const scores = new Map(events.map((e) => [e.id, e.status === "finished" && e.homeScore !== null && e.awayScore !== null ? ([e.homeScore, e.awayScore] as [number, number]) : null]));
  const codes = [...new Set(rows.map((r) => r.leagueCode).filter((c): c is string => Boolean(c)))];
  const first = Math.min(...rows.map((r) => r.kickoff.getTime()));
  const stats = codes.length ? await prisma.matchStat.findMany({ where: { league: { in: codes }, date: { gte: new Date(first - 2 * DAY) } } }) : [];
  const pair = (a: number | null, b: number | null): [number, number] | null => (a === null || b === null ? null : [a, b]);
  return rows.map((r) => {
    const near = stats.filter((s) => s.league === r.leagueCode && Math.abs(s.date.getTime() - r.kickoff.getTime()) <= 1.5 * DAY);
    const s = near.find((x) => matchTeam(r.home, [x.home]) && matchTeam(r.away, [x.away]));
    return {
      goals: scores.get(r.eventId) ?? pair(s?.hg ?? null, s?.ag ?? null),
      ht: s ? pair(s.hthg, s.htag) : null,
      corners: s ? pair(s.hc, s.ac) : null,
      cards: s ? pair(s.hcards, s.acards) : null,
      fouls: s ? pair(s.hf, s.af) : null,
    };
  });
}

export async function readRecordedPicks(prisma: PrismaClient, now: number, days = RESULTS_DAYS): Promise<RecordedPick[]> {
  const rows = await prisma.pickRecord.findMany({ where: { kickoff: { gte: new Date(now - days * DAY), lte: new Date(now - 2 * HOUR) } }, orderBy: { kickoff: "desc" } });
  const [outcomes, close] = await Promise.all([matchOutcomes(prisma, rows), closes(prisma, rows)]);
  return rows.map((r, i) => ({
    day: dayKey(r.kickoff.getTime()),
    kickoff: r.kickoff.getTime(),
    league: r.leagueName,
    match: `${r.home} vs ${r.away}`,
    category: r.category,
    outcome: r.outcome,
    probability: r.probability,
    odds: r.odds,
    result: settle(r.spec, outcomes[i]),
    close: close[i],
  }));
}
