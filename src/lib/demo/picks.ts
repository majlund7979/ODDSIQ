// Demo inputs for the daily picks (DEMO DATA): expected goals from the
// generator's team strengths, form and head-to-head from finished demo
// matches, Elo fitted on them, and absences from the demo news feed.

import { buildLeagueModel, type LeagueModel } from "@/lib/model/league-model";
import { buildCountModels, forecastCounts, type CountModels, type StatMatch } from "@/lib/model/match-stats";
import { rating } from "@/lib/model/elo";
import type { HistMatch } from "@/lib/model/openfootball";
import type { PickContext } from "@/lib/picks";
import type { InjuryItem } from "@/lib/stats/types";
import { teamById } from "./catalog";
import { expectedGoals } from "./football";
import { Rng } from "./rng";
import { feedTime, findEvent, statusAt, universeEvents } from "./store";

function poisson(rng: Rng, mean: number): number {
  const l = Math.exp(-mean);
  let k = 0;
  let p = rng.next();
  while (p > l) {
    k++;
    p *= rng.next();
  }
  return k;
}

const leagueCache = new Map<string, { history: HistMatch[]; model: LeagueModel; counts: CountModels }>();

function demoLeague(leagueId: string, now: number) {
  const t = feedTime(now);
  const key = `${leagueId}|${t}`;
  const hit = leagueCache.get(key);
  if (hit) return hit;
  if (leagueCache.size > 50) leagueCache.clear();
  const finished = universeEvents(now)
    .filter((e) => e.event.leagueId === leagueId && statusAt(e, t) === "finished")
    .sort((a, b) => a.event.kickoff - b.event.kickoff);
  const history: HistMatch[] = finished.map((e) => ({
    league: leagueId,
    season: "demo",
    date: e.event.kickoff,
    home: teamById.get(e.event.homeTeamId)!.name,
    away: teamById.get(e.event.awayTeamId)!.name,
    hg: e.finalScore.home,
    ag: e.finalScore.away,
  }));
  // Corners, cards and fouls are generated from the demo team strengths, seeded per match.
  const stats: StatMatch[] = finished.map((e, i) => {
    const rng = new Rng(`stats:${e.event.id}`);
    const h = teamById.get(e.event.homeTeamId)!;
    const a = teamById.get(e.event.awayTeamId)!;
    const hc = poisson(rng, 5.4 * Math.exp(0.9 * (h.attack - a.defence) + 0.08));
    const ac = poisson(rng, 4.4 * Math.exp(0.9 * (a.attack - h.defence)));
    const hk = poisson(rng, 1.8 * Math.exp(-0.6 * (h.attack - a.attack)));
    const ak = poisson(rng, 2.1 * Math.exp(-0.6 * (a.attack - h.attack)));
    const hf = poisson(rng, 11 * Math.exp(-0.4 * (h.attack - a.attack)));
    const af = poisson(rng, 11.8 * Math.exp(-0.4 * (a.attack - h.attack)));
    return { ...history[i], corners: [hc, ac], cards: [hk, ak], fouls: [hf, af] };
  });
  const out = { history, model: buildLeagueModel(history, t), counts: buildCountModels(stats, t) };
  leagueCache.set(key, out);
  return out;
}

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
  const { history, model, counts } = demoLeague(ev.event.leagueId, now);
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
    counts: forecastCounts(counts, home.name, away.name),
  };
}
