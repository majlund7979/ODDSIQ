// Watchlist, My Bets and AI Analyst data over the live read model. Teams and
// leagues are the ones in the feed; recent form comes from the stored results
// (openfootball), matched to feed team names.

import type { PrismaClient } from "@/generated/prisma/client";
import type { PersonalCtx, PersonalEvent } from "@/lib/demo/personal";
import { REAL_MODEL } from "@/lib/model/ensemble";
import { teamKey } from "@/lib/model/teams";
import { realMarketDetail, type EventView, type RealSnapshot } from "./store";

const DAY = 86_400_000;
const FORM_LOOKBACK_MS = 180 * DAY;

export async function realPersonal(prisma: PrismaClient, snap: RealSnapshot): Promise<PersonalCtx> {
  const now = snap.now;
  const views = new Map<string, { view: EventView; firstSelectionId: string | null }>();
  for (const e of snap.events) views.set(e.view.id, { view: e.view, firstSelectionId: (e.markets.find((m) => m.type === "1X2" || m.type === "ML") ?? e.markets[0])?.selections[0]?.id ?? null });
  for (const r of snap.ledger) if (!views.has(r.event.id)) views.set(r.event.id, { view: r.event, firstSelectionId: null });

  const teams = new Map<string, { id: string; name: string; leagueId: string }>();
  const leagues = new Map<string, { id: string; name: string; country: string }>();
  for (const { view: v } of views.values()) {
    teams.set(v.homeTeamId, { id: v.homeTeamId, name: v.homeName, leagueId: v.leagueId });
    teams.set(v.awayTeamId, { id: v.awayTeamId, name: v.awayName, leagueId: v.leagueId });
    leagues.set(v.leagueId, { id: v.leagueId, name: v.leagueName, country: "" });
  }

  const results = new Map<string, "won" | "lost" | "void">();
  for (const e of snap.events) for (const m of e.markets) for (const s of m.selections) if (s.result === "won" || s.result === "lost" || s.result === "void") results.set(s.id, s.result);
  for (const r of snap.ledger) if (r.result) results.set(r.prediction.selectionId, r.result);

  const history = await prisma.historicalMatch.findMany({ where: { date: { gte: new Date(now - FORM_LOOKBACK_MS), lt: new Date(now) } }, orderBy: { date: "desc" } });
  const toEvent = (v: EventView, firstSelectionId: string | null): PersonalEvent => ({ ...v, status: v.status === "live" || v.status === "finished" ? v.status : "scheduled", firstSelectionId });

  const releasedAt = snap.audit.versionChanges.find((v) => v.versionId === REAL_MODEL.ensemble.id)?.firstSeenAt ?? now;
  return {
    now,
    live: true,
    rows: snap.rows,
    ledger: snap.ledger,
    detail: (id) => realMarketDetail(snap, id),
    teams: [...teams.values()],
    leagues: [...leagues.values()],
    models: [{ id: REAL_MODEL.ensemble.id, releasedAt }],
    event: (id) => {
      const hit = views.get(id);
      return hit ? toEvent(hit.view, hit.firstSelectionId) : undefined;
    },
    teamResults: (teamId) => {
      const team = teams.get(teamId);
      if (!team) return [];
      const key = teamKey(team.name);
      return history
        .filter((h) => teamKey(h.home) === key || teamKey(h.away) === key)
        .map((h) => {
          const home = teamKey(h.home) === key;
          return {
            id: `hist-${h.id}`,
            homeTeamId: home ? teamId : `hist:${h.home}`,
            awayTeamId: home ? `hist:${h.away}` : teamId,
            homeName: h.home,
            awayName: h.away,
            leagueId: team.leagueId,
            leagueName: leagues.get(team.leagueId)?.name ?? "",
            kickoff: h.date.getTime(),
            status: "finished" as const,
            score: { home: h.hg, away: h.ag },
            firstSelectionId: null,
          };
        });
    },
    selectionResult: (id) => results.get(id),
  };
}
