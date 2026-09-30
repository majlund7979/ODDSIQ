// Personal terminal: watchlist items, tracked positions and the rule-based
// "My Market Assistant". Nothing here decides for the user; answers only
// summarise the supplied data against thresholds the user chose.

import { fmtOdds, fmtPct, fmtPp, fmtSignedPct } from "@/lib/format";
import { clv } from "@/lib/metrics/clv";
import { mean } from "@/lib/metrics/stats";
import { isSettled, segmentStats } from "./analytics";
import { LEAGUES, TEAMS } from "./catalog";
import { MODEL_VERSIONS } from "./models";
import { eventView, findEvent, ledgerRows, marketDetail, marketRows, universeEvents, type LedgerRow, type MarketDetail, type MarketRow } from "./store";

// ---------------------------------------------------------------------------
// Watchlist

export type WatchKind = "team" | "league" | "event" | "market" | "model";

export interface WatchItem {
  kind: WatchKind;
  id: string;
}

export const WATCH_KINDS: { kind: WatchKind; code: string; label: string }[] = [
  { kind: "team", code: "t", label: "Teams" },
  { kind: "league", code: "l", label: "Leagues" },
  { kind: "event", code: "e", label: "Matches" },
  { kind: "market", code: "s", label: "Markets" },
  { kind: "model", code: "m", label: "Models" },
];

export const MAX_WATCH_ITEMS = 60;

export function encodeWatchlist(items: WatchItem[]): string {
  return items
    .slice(0, MAX_WATCH_ITEMS)
    .map((i) => `${WATCH_KINDS.find((k) => k.kind === i.kind)!.code}:${i.id}`)
    .join(",");
}

export function decodeWatchlist(raw: string | undefined): WatchItem[] {
  if (!raw) return [];
  const out: WatchItem[] = [];
  for (const part of raw.split(",")) {
    const [code, ...rest] = part.split(":");
    const kind = WATCH_KINDS.find((k) => k.code === code)?.kind;
    const id = rest.join(":");
    if (kind && /^[a-z0-9._-]{1,80}$/i.test(id) && !out.some((o) => o.kind === kind && o.id === id)) out.push({ kind, id });
  }
  return out.slice(0, MAX_WATCH_ITEMS);
}

export function toggleWatchItem(items: WatchItem[], item: WatchItem): WatchItem[] {
  const has = items.some((i) => i.kind === item.kind && i.id === item.id);
  return has ? items.filter((i) => !(i.kind === item.kind && i.id === item.id)) : [...items, item].slice(-MAX_WATCH_ITEMS);
}

// ---------------------------------------------------------------------------
// Data the personal features read. The demo universe and the live read model
// each provide one, so every function below works on either.

export interface PersonalEvent {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  leagueId: string;
  leagueName: string;
  kickoff: number;
  status: "scheduled" | "live" | "finished";
  score?: { home: number; away: number };
  /** First selection of the main market, for links. */
  firstSelectionId: string | null;
}

export interface PersonalCtx {
  now: number;
  /** Live data: no in-play terminal or replay to link to. */
  live: boolean;
  rows: MarketRow[];
  ledger: LedgerRow[];
  detail(selectionId: string): MarketDetail | undefined;
  teams: { id: string; name: string; leagueId: string }[];
  leagues: { id: string; name: string; country: string }[];
  models: { id: string; releasedAt: number }[];
  event(eventId: string): PersonalEvent | undefined;
  /** Finished matches involving the team, newest first. */
  teamResults(teamId: string): PersonalEvent[];
  selectionResult(selectionId: string): "won" | "lost" | "void" | undefined;
}

const demoEvent = (eventId: string, now: number): PersonalEvent | undefined => {
  const ev = findEvent(eventId, now);
  if (!ev) return undefined;
  const v = eventView(ev, now);
  return { ...v, firstSelectionId: ev.markets[0]?.selections[0]?.selection.id ?? null };
};

let demoCache: { now: number; ctx: PersonalCtx } | null = null;

export function demoPersonal(now: number): PersonalCtx {
  if (demoCache?.now === now) return demoCache.ctx;
  const ctx: PersonalCtx = {
    now,
    live: false,
    rows: marketRows(now),
    ledger: ledgerRows(now),
    detail: (id) => marketDetail(id, now),
    teams: TEAMS,
    leagues: LEAGUES,
    models: MODEL_VERSIONS.filter((m) => m.familyId === "ensemble"),
    event: (id) => demoEvent(id, now),
    teamResults: (teamId) =>
      universeEvents(now)
        .filter((e) => (e.event.homeTeamId === teamId || e.event.awayTeamId === teamId) && e.event.kickoff + 3 * 3_600_000 < now)
        .map((e) => ({ ...eventView(e, now), firstSelectionId: e.markets[0]?.selections[0]?.selection.id ?? null }))
        .filter((v) => v.status === "finished" && v.score)
        .sort((a, b) => b.kickoff - a.kickoff),
    selectionResult: (id) => {
      const d = marketDetail(id, now);
      if (!d || d.event.status !== "finished") return undefined;
      return findEvent(d.row.eventId, now)?.markets.flatMap((m) => m.selections).find((s) => s.selection.id === id)?.selection.result;
    },
  };
  demoCache = { now, ctx };
  return ctx;
}

export interface ResolvedWatchItem extends WatchItem {
  label: string;
  detail: string;
  href: string;
}

export function resolveWatchItemOf(item: WatchItem, ctx: PersonalCtx): ResolvedWatchItem | null {
  switch (item.kind) {
    case "team": {
      const t = ctx.teams.find((x) => x.id === item.id);
      return t ? { ...item, label: t.name, detail: ctx.leagues.find((l) => l.id === t.leagueId)?.name ?? "", href: `/ai-analyst?q=${encodeURIComponent(`analyze ${t.name}`)}` } : null;
    }
    case "league": {
      const l = ctx.leagues.find((x) => x.id === item.id);
      return l ? { ...item, label: l.name, detail: l.country, href: `/markets?q=${encodeURIComponent(l.name)}` } : null;
    }
    case "event": {
      const v = ctx.event(item.id);
      if (!v) return null;
      const href = ctx.live || v.status === "scheduled" ? (v.firstSelectionId ? `/markets/${v.firstSelectionId}` : "/matches") : v.status === "finished" ? `/market-replay?event=${v.id}` : `/live?event=${v.id}`;
      return { ...item, label: `${v.homeName} vs ${v.awayName}`, detail: `${v.leagueName} · ${v.status}`, href };
    }
    case "market": {
      const d = ctx.detail(item.id);
      return d ? { ...item, label: `${d.row.match} · ${d.row.selection}`, detail: `${d.row.market} · ${d.event.status}`, href: `/markets/${item.id}` } : null;
    }
    case "model": {
      const m = ctx.models.find((v) => v.id === item.id);
      return m ? { ...item, label: m.id, detail: `released ${new Date(m.releasedAt).toISOString().slice(0, 10)}`, href: ctx.live ? "/model-lab/real-model" : "/model-lab" } : null;
    }
  }
}

export const resolveWatchItem = (item: WatchItem, now: number) => resolveWatchItemOf(item, demoPersonal(now));

/** Case-insensitive name lookup for teams and leagues, used by /watch and the analyst. */
export function findByNameOf(query: string, ctx: Pick<PersonalCtx, "teams" | "leagues">): WatchItem | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const team = ctx.teams.find((t) => t.name.toLowerCase() === q) ?? ctx.teams.find((t) => t.name.toLowerCase().includes(q));
  if (team) return { kind: "team", id: team.id };
  const league = ctx.leagues.find((l) => l.name.toLowerCase() === q || l.name.toLowerCase().includes(q));
  if (league) return { kind: "league", id: league.id };
  return null;
}

export const findByName = (query: string) => findByNameOf(query, { teams: TEAMS, leagues: LEAGUES });

/** Open (scheduled or live) market rows covered by the watchlist. */
export function watchedRowsOf(items: WatchItem[], ctx: PersonalCtx): MarketRow[] {
  if (!items.length) return [];
  const teams = new Set(items.filter((i) => i.kind === "team").map((i) => i.id));
  const leagues = new Set(items.filter((i) => i.kind === "league").map((i) => i.id));
  const events = new Set(items.filter((i) => i.kind === "event").map((i) => i.id));
  const markets = new Set(items.filter((i) => i.kind === "market").map((i) => i.id));
  const teamsOf = new Map<string, PersonalEvent | undefined>();
  return ctx.rows.filter((r) => {
    if (markets.has(r.selectionId) || events.has(r.eventId) || leagues.has(r.leagueId)) return true;
    if (!teams.size) return false;
    if (!teamsOf.has(r.eventId)) teamsOf.set(r.eventId, ctx.event(r.eventId));
    const t = teamsOf.get(r.eventId);
    return !!t && (teams.has(t.homeTeamId) || teams.has(t.awayTeamId));
  });
}

export const watchedRows = (items: WatchItem[], now: number) => watchedRowsOf(items, demoPersonal(now));

export interface ModelRecord {
  versionId: string;
  n: number;
  brier: number;
  marketBrier: number;
  avgClv: number;
  clvN: number;
  periodDays: number;
}

export function modelRecordOf(versionId: string, ctx: PersonalCtx, periodDays = 28): ModelRecord {
  const rows = ctx.ledger.filter((r) => r.prediction.modelVersionId === versionId && r.prediction.createdAt > ctx.now - periodDays * 86_400_000);
  const s = segmentStats(rows);
  return { versionId, n: s.n, brier: s.brier, marketBrier: s.marketBrier, avgClv: s.avgClv, clvN: s.clvN, periodDays };
}

export const modelRecord = (versionId: string, now: number, periodDays = 28) => modelRecordOf(versionId, demoPersonal(now), periodDays);

// ---------------------------------------------------------------------------
// My Market Assistant

export const ASSISTANT_QUESTIONS = [
  { id: "interesting", label: "Anything interesting in my watchlist?" },
  { id: "moved", label: "Which of my markets moved most?" },
  { id: "live", label: "What is live right now?" },
  { id: "soon", label: "What starts in the next 24 hours?" },
  { id: "record", label: "How have the models done on my teams?" },
] as const;

export type AssistantQuestion = (typeof ASSISTANT_QUESTIONS)[number]["id"];

export interface AssistantAnswer {
  question: string;
  sentences: string[];
  /** Rows the answer refers to, in the order mentioned. */
  rows: MarketRow[];
}

/** Maps free text to one of the fixed questions; returns null when nothing fits. */
export function matchAssistantQuestion(text: string): AssistantQuestion | null {
  const t = text.toLowerCase();
  if (/(live|in play|right now|playing)/.test(t)) return "live";
  if (/(moved|movement|drift|shorten|price change)/.test(t)) return "moved";
  if (/(soon|today|tonight|tomorrow|next|upcoming|start)/.test(t)) return "soon";
  if (/(record|history|how ha(s|ve)|accura|clv|perform)/.test(t)) return "record";
  if (/(interesting|disagree|edge|differ|anything|watchlist)/.test(t)) return "interesting";
  return null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const assistantAnswer = (q: AssistantQuestion, items: WatchItem[], thresholdPp: number, now: number) => assistantAnswerOf(q, items, thresholdPp, demoPersonal(now));

export function assistantAnswerOf(q: AssistantQuestion, items: WatchItem[], thresholdPp: number, ctx: PersonalCtx): AssistantAnswer {
  const now = ctx.now;
  const question = ASSISTANT_QUESTIONS.find((x) => x.id === q)!.label;
  if (!items.length) return { question, sentences: ["Your watchlist is empty. Add teams, leagues, matches, markets or models and I can summarise them."], rows: [] };
  const rows = watchedRowsOf(items, ctx);
  const pre = rows.filter((r) => r.status === "scheduled");

  switch (q) {
    case "interesting": {
      const hits = pre.filter((r) => r.edgePp !== null && Math.abs(r.edgePp) >= thresholdPp).sort((a, b) => Math.abs(b.edgePp!) - Math.abs(a.edgePp!));
      const events = new Set(hits.map((r) => r.eventId));
      if (!hits.length) return { question, sentences: [`None of the ${plural(pre.length, "pre-match market")} in your watchlist has a model-market difference of ${thresholdPp} pp or more.`], rows: [] };
      const top = hits[0];
      const s = [
        `${plural(events.size, "match", "matches")} in your watchlist currently ${events.size === 1 ? "has" : "have"} model-market differences of at least your saved threshold of ${thresholdPp} pp (${plural(hits.length, "selection")}).`,
        `The largest is ${top.match}, ${top.market}: ${top.selection}, at ${fmtPp(top.edgePp)} (model ${fmtPct(top.modelProbability)}, market ${fmtPct(top.marketProbability)}, confidence ${top.confidence}).`,
      ];
      if (top.modelDisagreement === "HIGH") s.push("The component models disagree strongly on that one, so its uncertainty range is wide.");
      return { question, sentences: s, rows: hits.slice(0, 8) };
    }
    case "moved": {
      const moved = pre.filter((r) => Number.isFinite(r.movement)).sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement));
      if (!moved.length) return { question, sentences: ["No pre-match markets in your watchlist are open right now."], rows: [] };
      const top = moved[0];
      return {
        question,
        sentences: [
          `The largest move since opening is ${top.match}, ${top.market}: ${top.selection}, from ${fmtOdds(top.openingOdds)} to ${fmtOdds(top.currentOdds)} (${fmtSignedPct(top.movement)}), with ${top.booksMovedSinceOpen} of ${top.booksQuoting} bookmakers moving the same way.`,
          `${plural(moved.filter((r) => Math.abs(r.movement) >= 0.05).length, "selection")} in your watchlist ${moved.filter((r) => Math.abs(r.movement) >= 0.05).length === 1 ? "has" : "have"} moved 5% or more.`,
        ],
        rows: moved.slice(0, 8),
      };
    }
    case "live": {
      const live = rows.filter((r) => r.status === "live");
      const byEvent = [...new Map(live.map((r) => [r.eventId, r])).values()];
      if (!byEvent.length) return { question, sentences: ["Nothing in your watchlist is in play right now."], rows: [] };
      return { question, sentences: byEvent.map((r) => `${r.match} is ${r.score?.home}–${r.score?.away} after ${r.minute} minutes.`), rows: byEvent };
    }
    case "soon": {
      const soon = [...new Map(pre.filter((r) => r.kickoff - now <= 86_400_000).sort((a, b) => a.kickoff - b.kickoff).map((r) => [r.eventId, r])).values()];
      if (!soon.length) return { question, sentences: ["Nothing in your watchlist starts in the next 24 hours."], rows: [] };
      return { question, sentences: [`${plural(soon.length, "match", "matches")} in your watchlist ${soon.length === 1 ? "starts" : "start"} in the next 24 hours. The first is ${soon[0].match}.`], rows: soon.slice(0, 8) };
    }
    case "record": {
      const teams = new Set(items.filter((i) => i.kind === "team").map((i) => i.id));
      if (!teams.size) return { question, sentences: ["Add a team to your watchlist to see the model's recorded history on it."], rows: [] };
      const sentences: string[] = [];
      for (const id of teams) {
        const p = teamRecordOf(id, ctx);
        if (!p) continue;
        sentences.push(
          p.n === 0
            ? `${p.name}: no settled ledger predictions on their results yet.`
            : `${p.name}: ${plural(p.n, "settled prediction")} on their result since ${new Date(p.from!).toISOString().slice(0, 10)}. The model gave them ${fmtPct(p.meanPredicted)} on average and they won ${fmtPct(p.hitRate)}; average CLV ${fmtSignedPct(p.avgClv)}.${p.n < 30 ? " That sample is small." : ""}`,
        );
      }
      return { question, sentences, rows: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Team records (analyst and assistant)

export interface TeamRecord {
  id: string;
  name: string;
  leagueName: string;
  /** Settled ledger predictions on this team winning. */
  n: number;
  meanPredicted: number;
  hitRate: number;
  avgClv: number;
  brier: number;
  marketBrier: number;
  from: number | null;
  form: { eventId: string; kickoff: number; opponent: string; home: boolean; score: string; result: "W" | "D" | "L" }[];
}

export const teamRecord = (teamId: string, now: number) => teamRecordOf(teamId, demoPersonal(now));

export function teamRecordOf(teamId: string, ctx: PersonalCtx): TeamRecord | null {
  const team = ctx.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const rows = ctx.ledger.filter((r) => {
    if (r.marketType !== "1X2" && r.marketType !== "ML") return false;
    return (r.side === "home" && r.event.homeTeamId === teamId) || (r.side === "away" && r.event.awayTeamId === teamId);
  });
  const settled = rows.filter(isSettled);
  const s = segmentStats(settled);
  const finished = ctx.teamResults(teamId).filter((v) => v.score).slice(0, 6);
  return {
    id: teamId,
    name: team.name,
    leagueName: ctx.leagues.find((l) => l.id === team.leagueId)?.name ?? "",
    n: s.n,
    meanPredicted: s.meanPredicted,
    hitRate: s.hitRate,
    avgClv: s.avgClv,
    brier: s.brier,
    marketBrier: s.marketBrier,
    from: s.periodFrom,
    form: finished.map((v) => {
      const home = v.homeTeamId === teamId;
      const gf = home ? v.score!.home : v.score!.away;
      const ga = home ? v.score!.away : v.score!.home;
      return { eventId: v.id, kickoff: v.kickoff, opponent: home ? v.awayName : v.homeName, home, score: `${gf}–${ga}`, result: gf > ga ? "W" : gf < ga ? "L" : "D" };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tracked positions (My Bets)

export interface Position {
  selectionId: string;
  odds: number;
  at: number;
}

export const MAX_POSITIONS = 50;

export function encodePositions(ps: Position[]): string {
  return ps
    .slice(-MAX_POSITIONS)
    .map((p) => `${p.selectionId}|${p.odds.toFixed(2)}|${Math.round(p.at / 1000)}`)
    .join(",");
}

export function decodePositions(raw: string | undefined): Position[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.split("|"))
    .filter((p) => p.length === 3 && /^[a-z0-9_-]{1,80}$/i.test(p[0]))
    .map(([selectionId, odds, at]) => ({ selectionId, odds: Number(odds), at: Number(at) * 1000 }))
    .filter((p) => Number.isFinite(p.odds) && p.odds > 1 && Number.isFinite(p.at))
    .slice(-MAX_POSITIONS);
}

export interface PositionView extends Position {
  match: string;
  market: string;
  selection: string;
  kickoff: number;
  status: "open" | "closed" | "settled";
  /** Current consensus odds before kickoff, closing consensus after. */
  referenceOdds: number;
  /** Margin-free probability used for CLV: current before kickoff (provisional), closing after. */
  referenceFair: number;
  clv: number;
  provisional: boolean;
  result?: "won" | "lost" | "void";
  /** Simulated profit at a 1-unit stake. */
  profit?: number;
}

export const positionView = (p: Position, now: number) => positionViewOf(p, demoPersonal(now));

export function positionViewOf(p: Position, ctx: PersonalCtx): PositionView | null {
  const d = ctx.detail(p.selectionId);
  if (!d) return null;
  const closed = d.event.status !== "scheduled";
  const fair = d.siblings.find((s) => s.selectionId === p.selectionId)?.marketProbability ?? d.row.marketProbability;
  const result = d.event.status === "finished" ? ctx.selectionResult(p.selectionId) : undefined;
  return {
    ...p,
    match: d.row.match,
    market: d.row.market,
    selection: d.row.selection,
    kickoff: d.event.kickoff,
    status: result ? "settled" : closed ? "closed" : "open",
    referenceOdds: d.chart.at(-1)?.consensus ?? d.row.currentOdds,
    referenceFair: fair,
    clv: clv(p.odds, fair),
    provisional: !closed,
    result,
    profit: result === "won" ? p.odds - 1 : result === "lost" ? -1 : result === "void" ? 0 : undefined,
  };
}

export function positionSummary(views: PositionView[]) {
  const settled = views.filter((v) => v.profit !== undefined);
  const closedClv = views.filter((v) => !v.provisional).map((v) => v.clv);
  return {
    n: views.length,
    settled: settled.length,
    wins: settled.filter((v) => v.result === "won").length,
    profit: settled.reduce((a, v) => a + v.profit!, 0),
    avgClv: mean(closedClv),
    clvN: closedClv.length,
    positiveClvShare: closedClv.length ? closedClv.filter((c) => c > 0).length / closedClv.length : NaN,
  };
}
