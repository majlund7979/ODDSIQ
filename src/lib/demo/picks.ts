// Demo inputs for the daily picks (DEMO DATA): expected goals from the
// generator's team strengths, form and head-to-head from finished demo
// matches, Elo fitted on them, and absences from the demo news feed.

import { buildLeagueModel } from "@/lib/model/league-model";
import { rating } from "@/lib/model/elo";
import type { HistMatch } from "@/lib/model/openfootball";
import type { PickContext } from "@/lib/picks";
import type { InjuryItem } from "@/lib/stats/types";
import { teamById } from "./catalog";
import { expectedGoals } from "./football";
import { feedTime, findEvent, statusAt, universeEvents } from "./store";

const ROLE_DA: Record<string, string> = {
  "first-choice striker": "Førsteangriber",
  "starting goalkeeper": "Målmand",
  "first-choice centre-back": "Midterforsvarer",
  "creative midfielder": "Kreativ midtbane",
  captain: "Anfører",
};

export function demoPickContext(eventId: string, now: number): PickContext | null {
  const ev = findEvent(eventId, now);
  if (!ev || ev.event.sportId !== "football") return null;
  const t = feedTime(now);
  const home = teamById.get(ev.event.homeTeamId)!;
  const away = teamById.get(ev.event.awayTeamId)!;
  const history: HistMatch[] = universeEvents(now)
    .filter((e) => e.event.leagueId === ev.event.leagueId && statusAt(e, t) === "finished")
    .sort((a, b) => a.event.kickoff - b.event.kickoff)
    .map((e) => ({
      league: e.event.leagueId,
      season: "demo",
      date: e.event.kickoff,
      home: teamById.get(e.event.homeTeamId)!.name,
      away: teamById.get(e.event.awayTeamId)!.name,
      hg: e.finalScore.home,
      ag: e.finalScore.away,
    }));
  const model = buildLeagueModel(history, t);
  const injuries: InjuryItem[] = ev.news
    .filter((n) => n.at <= t && (n.kind === "injury" || n.kind === "suspension"))
    .map((n) => {
      const side = n.text.startsWith(home.name) ? "home" : "away";
      const team = side === "home" ? home.name : away.name;
      const role = Object.keys(ROLE_DA).find((r) => n.text.includes(r));
      return { side, team, player: role ? ROLE_DA[role] : "Spiller", status: n.kind === "injury" ? "doubtful" : "out", reason: n.text };
    });
  return {
    expectedGoals: expectedGoals(home.attack, home.defence, away.attack, away.defence),
    news: { provider: "demo", syncedAt: t, lineups: [], lineupsAt: null, injuries, injuriesAt: t, xg: null, form: { home: null, away: null } },
    teams: { home: home.name, away: away.name, homeElo: rating(model.elo, home.name), awayElo: rating(model.elo, away.name), history },
  };
}
