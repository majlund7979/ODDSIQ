// In-play read model over feed data: the Live Markets board, a live match view
// and Market Replay. Prices are the in-play snapshots stored by each ingestion
// run, the score is whatever the feed reported at that run, and the match
// minute is estimated from the clock because the feed has no match clock.
// Goals are placed between the two runs that bracket a score change; the feed
// gives no goal times, cards or other match events.

import type { PrismaClient } from "@/generated/prisma/client";
import type { LiveEvent } from "@/lib/domain/types";
import type { MatchView, ReplayData, ReplayFrame } from "@/lib/demo/store";
import type { MinuteState } from "@/lib/demo/universe";
import { fmtPct, fmtPp, fmtTime } from "@/lib/format";
import { estimatedMinute, inPlayForecast } from "@/lib/model/inplay";
import { buildLeagueModel, forecastFor } from "@/lib/model/league-model";
import { leagueForOddsKey } from "@/lib/model/openfootball";
import { loadResults } from "@/lib/model/pipeline";
import { closingLine } from "@/lib/providers/closing";
import { IN_PLAY_WINDOW_MS } from "@/lib/providers/ingest";
import { consensusAt, realMatchView, type EventData, type EventView, type MarketData, type RealSnapshot } from "./store";

const MIN = 60_000;
/** An in-play price counts only for the run that observed it. */
const LIVE_PRICE_WINDOW_MS = 5 * MIN;

export interface LiveFrame extends MinuteState {
  at: number;
  /** Median bookmaker odds at this run. */
  odds: number[];
}

export interface LiveBoardRow {
  eventId: string;
  selectionId: string;
  sport: string;
  league: string;
  match: string;
  kickoff: number;
  /** Estimated from the clock. */
  minute: number;
  score: { home: number; away: number } | null;
  scoreAt: number | null;
}

const mainMarket = (e: EventData): MarketData | undefined => e.markets.find((m) => m.type === "1X2" || m.type === "ML") ?? e.markets[0];

/** Matches in play now: kicked off within the in-play window, no final result yet. */
export function realLiveBoard(snap: RealSnapshot): LiveBoardRow[] {
  return snap.events
    .filter((e) => e.view.status === "live" && e.view.kickoff > snap.now - IN_PLAY_WINDOW_MS)
    .flatMap((e) => {
      const m = mainMarket(e);
      if (!m) return [];
      const s = e.scores.at(-1);
      return [
        {
          eventId: e.view.id,
          selectionId: m.selections[0].id,
          sport: e.view.sportName,
          league: e.view.leagueName,
          match: `${e.view.homeName} vs ${e.view.awayName}`,
          kickoff: e.view.kickoff,
          minute: estimatedMinute(e.view.kickoff, snap.now),
          score: s ? { home: s.home, away: s.away } : null,
          scoreAt: s?.at ?? null,
        },
      ];
    })
    .sort((a, b) => a.kickoff - b.kickoff);
}

const outcomeProbs = (type: string, f: ReturnType<typeof inPlayForecast>) => (type === "OU25" ? [f.over25, f.under25] : [f.home, f.draw, f.away]);

/** Kickoff frame plus one frame per in-play run up to `until`, and the goals inferred from score changes. */
export function inPlayFrames(e: EventData, m: MarketData, xg: { home: number; away: number } | null, until: number): { minutes: LiveFrame[]; timeline: LiveEvent[]; timelineAt: number[] } {
  const ko = e.view.kickoff;
  const ids = m.selections.map((s) => s.id);
  const preRuns = m.runs.filter((r) => r <= ko);
  const close = preRuns.length ? consensusAt(m, preRuns.at(-1)!) : null;
  const model = (minute: number, score: { home: number; away: number }) => (xg && m.type !== "ML" ? outcomeProbs(m.type, inPlayForecast(xg, minute, score)) : ids.map(() => NaN));
  const minutes: LiveFrame[] = [];
  if (close) {
    const zero = { home: 0, away: 0 };
    minutes.push({ at: ko, minute: 0, score: zero, market: close.selections.map((s) => s.fairProbability) as MinuteState["market"], model: model(0, zero) as MinuteState["model"], odds: close.selections.map((s) => s.medianOdds) });
  }
  const scores = e.scores.filter((s) => s.at <= until);
  let score = { home: 0, away: 0 };
  for (const r of m.liveRuns) {
    if (r > until) break;
    score = [...scores].reverse().find((s) => s.at <= r) ?? score;
    const line = closingLine(m.livePoints, ids, r, LIVE_PRICE_WINDOW_MS);
    if (!line) continue;
    const minute = estimatedMinute(ko, r);
    const sc = { home: score.home, away: score.away };
    minutes.push({ at: r, minute, score: sc, market: line.selections.map((s) => s.fairProbability) as MinuteState["market"], model: model(minute, sc) as MinuteState["model"], odds: line.selections.map((s) => s.medianOdds) });
  }

  const timeline: LiveEvent[] = [];
  const timelineAt: number[] = [];
  let prev = { at: ko, home: 0, away: 0 };
  for (const s of scores) {
    const from = estimatedMinute(ko, prev.at);
    const to = estimatedMinute(ko, s.at);
    const window = from === to ? `${to}′` : `between ${from}′ and ${to}′`;
    for (const side of ["home", "away"] as const) {
      const name = side === "home" ? e.view.homeName : e.view.awayName;
      for (let g = prev[side]; g < s[side]; g++) {
        timeline.push({ eventId: e.view.id, minute: to, kind: "goal", team: side, description: `${name} goal. Score ${s.home}–${s.away}, first reported by the feed ${window}.` });
        timelineAt.push(s.at);
      }
      if (s[side] < prev[side]) timeline.push({ eventId: e.view.id, minute: to, kind: "var", team: side, description: `Score corrected to ${s.home}–${s.away} by the feed.` });
      if (s[side] < prev[side]) timelineAt.push(s.at);
    }
    prev = s;
  }
  return { minutes, timeline, timelineAt };
}

const xgOf = (e: EventData) => (e.forecast && "f" in e.forecast ? e.forecast.f.expectedGoals : null);

/** A match in play (or finished) with its in-play frames up to now. */
export function realLiveView(snap: RealSnapshot, eventId: string): MatchView | undefined {
  const e = snap.events.find((x) => x.view.id === eventId);
  const view = realMatchView(snap, eventId);
  const m = e && mainMarket(e);
  if (!e || !view || !m) return undefined;
  const { minutes, timeline } = inPlayFrames(e, m, xgOf(e), snap.now);
  return { ...view, minutes, timeline };
}

/** Plain facts for the Live page's intelligence panel. Never says why a price moved. */
export function realLiveIntelligence(view: MatchView, sel: number): { facts: string[]; possible: string[] } {
  const e = view.event;
  const name = view.selections[sel]?.name ?? "Selection";
  const frames = view.minutes as LiveFrame[];
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last || frames.length < 2) {
    return { facts: [`No in-play prices have been stored for ${e.homeName} vs ${e.awayName} yet. They arrive with each live feed run while the match is on.`], possible: [] };
  }
  const facts: string[] = [];
  facts.push(`${e.homeName} ${last.score.home}–${last.score.away} ${e.awayName} as reported at the latest feed run (${fmtTime(last.at)} UTC, about ${last.minute}′).`);
  const d = (last.market[sel] - first.market[sel]) * 100;
  facts.push(`The market gives ${name} ${fmtPct(last.market[sel])}, ${fmtPp(d)} since kickoff (${fmtPct(first.market[sel])}).`);
  if (Number.isFinite(last.model[sel])) {
    const gap = (last.model[sel] - last.market[sel]) * 100;
    facts.push(`The in-play model gives ${fmtPct(last.model[sel])}, ${Math.abs(gap) < 0.05 ? "level with" : `${Math.abs(gap).toFixed(1)} pp ${gap > 0 ? "above" : "below"}`} the market.`);
  }
  const goals = view.timeline.filter((x) => x.kind === "goal").length;
  facts.push(`${goals} goal${goals === 1 ? "" : "s"} reported so far. This feed does not report cards, substitutions or goal times.`);
  let best: { pp: number; from: LiveFrame; to: LiveFrame } | null = null;
  for (let i = 1; i < frames.length; i++) {
    const pp = (frames[i].market[sel] - frames[i - 1].market[sel]) * 100;
    if (!best || Math.abs(pp) > Math.abs(best.pp)) best = { pp, from: frames[i - 1], to: frames[i] };
  }
  if (best && Math.abs(best.pp) >= 0.5) {
    const scored = best.from.score.home !== best.to.score.home || best.from.score.away !== best.to.score.away;
    facts.push(`The largest change between two feed runs for ${name} was ${fmtPp(best.pp)}, between ${best.from.minute}′ and ${best.to.minute}′; the reported score ${scored ? `changed from ${best.from.score.home}–${best.from.score.away} to ${best.to.score.home}–${best.to.score.away}` : "did not change"} over the same interval.`);
  }
  return {
    facts,
    possible: [
      "Match events change the chance of each result, and prices follow.",
      "As time passes with the score unchanged, the leading side's and the draw's probabilities rise.",
      "Events this feed does not report, such as a red card or an injury, can move prices without a change of score.",
    ],
  };
}

const xgCache = new Map<string, { home: number; away: number } | null>();

/** Expected goals from a model fitted only on results before kickoff, so a replay never uses the match's own result. */
async function preKickoffXg(prisma: PrismaClient, e: EventData): Promise<{ home: number; away: number } | null> {
  if (xgCache.has(e.view.id)) return xgCache.get(e.view.id)!;
  const league = leagueForOddsKey(e.oddsKey);
  let xg: { home: number; away: number } | null = null;
  if (league) {
    const model = buildLeagueModel(await loadResults(prisma, league.code, e.view.kickoff), e.view.kickoff);
    const r = forecastFor(model, e.view.homeName, e.view.awayName, league.name);
    xg = r.ok ? r.forecast.expectedGoals : null;
  }
  xgCache.set(e.view.id, xg);
  return xg;
}

/** Finished feed matches that can be replayed (the read model keeps a week). */
export function realReplayEvents(snap: RealSnapshot): EventView[] {
  return snap.events
    .filter((e) => e.view.status === "finished" && mainMarket(e)?.runs.some((r) => r <= e.view.kickoff))
    .map((e) => e.view)
    .sort((a, b) => b.kickoff - a.kickoff);
}

export async function realReplayData(prisma: PrismaClient, snap: RealSnapshot, eventId: string): Promise<ReplayData | undefined> {
  const e = snap.events.find((x) => x.view.id === eventId);
  const m = e && mainMarket(e);
  const base = realMatchView(snap, eventId);
  if (!e || !m || !base || e.view.status !== "finished") return undefined;
  const ko = e.view.kickoff;
  const preds = m.selections.map((s) => snap.predictionsBySelection.get(s.id));
  const frames: ReplayFrame[] = m.runs
    .filter((r) => r <= ko)
    .flatMap((at) => {
      const line = consensusAt(m, at);
      return line ? [{ at, phase: "pre" as const, odds: line.selections.map((s) => s.medianOdds), market: line.selections.map((s) => s.fairProbability), model: preds.map((p) => (p && p.createdAt <= at ? p.probability : null)) }] : [];
    });
  if (!frames.length) return undefined;
  const kickoffIndex = frames.length - 1;
  const { minutes, timeline, timelineAt } = inPlayFrames(e, m, await preKickoffXg(prisma, e), Infinity);
  for (const f of minutes) {
    if (f.minute === 0) continue;
    frames.push({ at: f.at, phase: "live", minute: f.minute, score: f.score, odds: f.odds, market: [...f.market], model: f.model.map((p) => (Number.isFinite(p) ? p : null)) });
  }
  const first = preds.find((p) => p);
  const ledger = new Map(snap.ledger.map((r) => [r.prediction.selectionId, r]));
  return {
    view: { ...base, minutes, timeline },
    frames,
    kickoffIndex,
    predictionAt: first?.createdAt ?? null,
    events: [
      ...(e.news?.lineupsAt ? [{ at: e.news.lineupsAt, kind: "lineup", text: "Lineups confirmed" }] : []),
      ...(first ? [{ at: first.createdAt, kind: "prediction", text: `Prediction ledgered (${first.modelVersionId})` }] : []),
      { at: ko, kind: "kickoff", text: "Kickoff: pre-match market closes" },
      ...timeline.map((t, i) => ({ at: timelineAt[i], kind: t.kind, text: `${t.minute}′ ${t.description}` })),
    ].sort((a, b) => a.at - b.at),
    clv: m.selections.map((s) => ledger.get(s.id)?.clv ?? null),
  };
}
