// Demo inputs for the daily picks (DEMO DATA): expected goals from the
// generator's team strengths, form and head-to-head from finished demo
// matches, Elo fitted on them, and absences from the demo news feed.

import { buildLeagueModel, type LeagueModel } from "@/lib/model/league-model";
import { buildCountModels, forecastCounts, halfTimeShare, type CountModels, type StatMatch } from "@/lib/model/match-stats";
import { allPickDrafts, settle, type MatchOutcome, type RecordedPick } from "@/lib/picks-extra";
import { LIVE_WINDOW_MS, liveState, type LivePick } from "@/lib/live/scores";
import { rating } from "@/lib/model/elo";
import type { HistMatch } from "@/lib/model/openfootball";
import type { PickContext } from "@/lib/picks";
import { COMPARISON_KEYS, type AfPrediction } from "@/lib/stats/af-predictions";
import { clubEloProbs } from "@/lib/stats/clubelo";
import type { InjuryItem } from "@/lib/stats/types";
import { LEAGUES, teamById } from "./catalog";
import { expectedGoals } from "./football";
import { Rng } from "./rng";
import { feedTime, findEvent, marketRows, statusAt, universeEvents } from "./store";

/** Demo referees: each has a fixed card tendency. */
const REFEREES: { name: string; cards: number }[] = [
  { name: "A Taylor", cards: 1.0 },
  { name: "M Oliver", cards: 0.95 },
  { name: "S Hooper", cards: 1.15 },
  { name: "C Kavanagh", cards: 1.25 },
  { name: "P Tierney", cards: 0.85 },
  { name: "J Brooks", cards: 1.1 },
  { name: "R Jones", cards: 0.8 },
  { name: "T Robinson", cards: 1.35 },
];
const refereeFor = (eventId: string) => REFEREES[new Rng(`ref:${eventId}`).int(0, REFEREES.length - 1)];

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

const leagueCache = new Map<string, { history: HistMatch[]; model: LeagueModel; counts: CountModels; htShare: ReturnType<typeof halfTimeShare>; outcomes: Map<string, MatchOutcome> }>();

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
    const ref = refereeFor(e.event.id).cards;
    const hk = poisson(rng, ref * 1.8 * Math.exp(-0.6 * (h.attack - a.attack)));
    const ak = poisson(rng, ref * 2.1 * Math.exp(-0.6 * (a.attack - h.attack)));
    const hf = poisson(rng, 11 * Math.exp(-0.4 * (h.attack - a.attack)));
    const af = poisson(rng, 11.8 * Math.exp(-0.4 * (a.attack - h.attack)));
    const half = (g: number) => Array.from({ length: g }, () => rng.chance(0.44)).filter(Boolean).length;
    const goals: [number, number] = [history[i].hg, history[i].ag];
    return { ...history[i], corners: [hc, ac], cards: [hk, ak], fouls: [hf, af], goals, ht: [half(goals[0]), half(goals[1])], referee: refereeFor(e.event.id).name };
  });
  const outcomes = new Map(finished.map((e, i) => [e.event.id, { goals: stats[i].goals!, ht: stats[i].ht!, corners: stats[i].corners, cards: stats[i].cards, fouls: stats[i].fouls } as MatchOutcome]));
  const out = { history, model: buildLeagueModel(history, t), counts: buildCountModels(stats, t), htShare: halfTimeShare(stats, t), outcomes };
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

/** Demo leagues' rough level on ClubElo's scale, so the cross-league ratings differ by league. */
const DEMO_CLUB_LEVEL: Record<string, number> = { epl: 300, laliga: 270, bundesliga: 250, seriea: 240, ligue1: 200, eredivisie: 120, championship: 100, superliga: 60 };
const DEMO_COUNTRY: Record<string, string> = { England: "ENG", Spain: "ESP", Germany: "GER", Italy: "ITA", France: "FRA", Netherlands: "NED", Denmark: "DEN" };

export function demoPickContext(eventId: string, now: number): PickContext | null {
  const ev = findEvent(eventId, now);
  if (!ev || ev.event.sportId !== "football") return null;
  const t = feedTime(now);
  const home = teamById.get(ev.event.homeTeamId)!;
  const away = teamById.get(ev.event.awayTeamId)!;
  const { history, model, counts, htShare } = demoLeague(ev.event.leagueId, now);
  const referee = refereeFor(ev.event.id).name;
  const injuries: InjuryItem[] = ev.news
    .filter((n) => n.at <= t && (n.kind === "injury" || n.kind === "suspension"))
    .map((n) => {
      const side = n.text.startsWith(home.name) ? "home" : "away";
      const team = side === "home" ? home.name : away.name;
      const role = Object.keys(ROLE_DA).find((r) => n.text.includes(r));
      return { side, team, player: role ? ROLE_DA[role] : "Spiller", status: n.kind === "injury" ? "doubtful" : "out", reason: n.text };
    });
  // DEMO DATA: derived from the demo Elo plus a league level; deterministic, no ClubElo call.
  const clubElo = (() => {
    const lvl = DEMO_CLUB_LEVEL[ev.event.leagueId] ?? 0;
    const country = DEMO_COUNTRY[LEAGUES.find((l) => l.id === ev.event.leagueId)?.country ?? ""] ?? "";
    const club = (name: string) => ({ club: name, country, level: 1, elo: Math.round(rating(model.elo, name) + lvl) });
    return { home: club(home.name), away: club(away.name), date: Math.floor(t / 86_400_000) * 86_400_000, source: "DEMO DATA" };
  })();
  return {
    expectedGoals: expectedGoals(home.attack, home.defence, away.attack, away.defence),
    news: { provider: "demo", syncedAt: t, lineups: [], lineupsAt: null, injuries, injuriesAt: t, xg: null, form: { home: null, away: null }, referee },
    teams: { home: home.name, away: away.name, homeElo: rating(model.elo, home.name), awayElo: rating(model.elo, away.name), history },
    counts: forecastCounts(counts, home.name, away.name, referee),
    htShare,
    clubElo,
    afPrediction: demoAfPrediction(ev.event.id, rating(model.elo, home.name), rating(model.elo, away.name), t),
  };
}

/** DEMO DATA: API-Football-style percentages from the demo Elo, rounded to 5 % like the real ones; comparison seeded by the match id. */
function demoAfPrediction(eventId: string, homeElo: number, awayElo: number, t: number): AfPrediction {
  const e = clubEloProbs(homeElo, awayElo);
  const r5 = (x: number) => Math.round(x * 20) / 20;
  const home = r5(e.home);
  const away = r5(e.away);
  const rng = new Rng(`afpred:${eventId}`);
  const lean = e.home - e.away;
  const comparison = COMPARISON_KEYS.map((key) => {
    const h = Math.min(0.85, Math.max(0.15, 0.5 + lean * 0.3 + (rng.next() - 0.5) * 0.3));
    return { key, home: h, away: 1 - h };
  });
  return { fixtureId: 0, percent: { home, draw: Math.max(0, 1 - home - away), away }, comparison, advice: null, winner: null, fetchedAt: t, source: "DEMO DATA" };
}

/**
 * The results board in demo mode: what the page would have shown on each of
 * the last days (picks made at 10:00 UTC), settled against the demo results.
 */
const recordedCache = new Map<string, RecordedPick[]>();

export function demoRecordedPicks(now: number, days = 7): RecordedPick[] {
  const t = feedTime(now);
  const key = `${Math.floor(t / 3_600_000)}|${days}`;
  const hit = recordedCache.get(key);
  if (hit) return hit;
  if (recordedCache.size > 20) recordedCache.clear();
  const result = computeRecorded(now, t, days);
  recordedCache.set(key, result);
  return result;
}

function computeRecorded(now: number, t: number, days: number): RecordedPick[] {
  const out: RecordedPick[] = [];
  for (let d = 1; d <= days; d++) {
    const at = Math.floor((t - d * 86_400_000) / 86_400_000) * 86_400_000 + 10 * 3_600_000;
    const drafts = allPickDrafts(marketRows(at), at, 10, (id) => demoPickContext(id, at));
    for (const p of drafts) {
      if (p.row.kickoff > t - 2 * 3_600_000) continue;
      const o = demoLeague(p.row.leagueId, now).outcomes.get(p.row.eventId);
      out.push({
        day: new Date(p.row.kickoff).toLocaleDateString("en-CA", { timeZone: "Europe/Copenhagen" }),
        kickoff: p.row.kickoff,
        league: p.row.league,
        match: p.row.match,
        category: p.category,
        outcome: p.outcome,
        probability: p.probability,
        odds: p.odds,
        result: o ? settle(p.spec, o) : null,
      });
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.kickoff - a.kickoff)
    .filter((p) => {
      const k = `${p.match}|${p.kickoff}|${p.category}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/**
 * DEMO DATA live scores: the picks made three hours ago whose matches are on
 * now, with a score drawn per match and minute (seeded, so stable on reload).
 */
export function demoLivePicks(category: string, now: number): LivePick[] {
  const t = feedTime(now);
  const at = t - 3 * 3_600_000;
  const drafts = allPickDrafts(marketRows(at), at, 10, (id) => demoPickContext(id, at)).filter((p) => p.category === category && p.row.kickoff <= t && p.row.kickoff > t - LIVE_WINDOW_MS);
  return drafts.map((p) => {
    const raw = Math.floor((t - p.row.kickoff) / 60_000);
    const minute = raw < 45 ? raw + 1 : raw < 60 ? 45 : Math.min(90, raw - 14);
    const status = raw < 45 ? "1H" : raw < 60 ? "HT" : raw < 110 ? "2H" : "FT";
    const goals: [number, number] = [0, 0];
    // One seeded draw per side per 5-minute block keeps the score from jumping around between polls.
    for (let b = 0; b < Math.floor(minute / 5); b++) {
      const r = new Rng(`live:${p.row.eventId}:${b}`);
      if (r.next() < 0.07) goals[0]++;
      if (r.next() < 0.055) goals[1]++;
    }
    const [home, away] = p.row.match.split(" vs ");
    const f = { id: p.row.eventId, home, away, kickoff: p.row.kickoff, status, minute, goals };
    return { key: `${p.row.eventId}|${p.category}`, match: p.row.match, league: `${p.row.league} · DEMO DATA`, outcome: p.outcome, ...liveState(p.spec, f) };
  });
}
