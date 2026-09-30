// DEMO_MODE universe: a deterministic schedule of events with price paths,
// model predictions, match simulations and results.
//
// Events are generated per UTC day from a fixed genesis date, each seeded by
// its own id. Adding a new day never changes an earlier one, so the demo
// behaves like a live system: scheduled events go live, finish, settle and
// join the historical record as real time passes.

import type {
  ExplanationFactor,
  LiveEvent,
  Market,
  MarketType,
  ModelEstimate,
  Selection,
  SportEvent,
  SportId,
} from "@/lib/domain/types";
import { predictionConfidence, modelConsensus } from "@/lib/metrics/consensus";
import { BOOKMAKERS, leagueById, LEAGUES, teamById, teamsByLeague } from "./catalog";
import { expectedGoals, footballProbabilities } from "./football";
import { COMPONENT_MODELS, ensembleVersionId, releaseAt } from "./models";
import { hashString, logit, Rng, sigmoid, valueNoise } from "./rng";

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const DEMO_GENESIS = Date.parse("2026-01-05T00:00:00Z");
export const MARKET_OPEN_HOURS = 168;
const KNOTS_H = [168, 144, 120, 96, 72, 48, 36, 24, 18, 12, 9, 6, 4, 3, 2, 1.5, 1, 0.5, 0.25, 0];

export const DURATION_MIN: Record<SportId, number> = {
  football: 115,
  basketball: 150,
  tennis: 140,
  "american-football": 200,
  "ice-hockey": 160,
};

export interface NewsItem {
  at: number;
  kind: "injury" | "suspension" | "rotation" | "return" | "weather" | "lineup";
  text: string;
  /** Share of the opening-to-closing move that happened at this moment. */
  shift: number;
}

export interface SelectionSim {
  selection: Selection;
  truth: number;
  openLogit: number;
  closeLogit: number;
  bridge: number[];
  noiseSeed: number;
  bookNoise: number[];
}

export interface MarketSim {
  market: Market;
  selections: SelectionSim[];
}

export interface SelectionModel {
  selectionId: string;
  ensemble: ModelEstimate;
  components: ModelEstimate[];
  factors: ExplanationFactor[];
  confidence: number;
}

export interface PredictionDraft {
  id: string;
  createdAt: number;
  eventId: string;
  marketId: string;
  selectionId: string;
  modelVersionId: string;
  probability: number;
  ciLow: number;
  ciHigh: number;
  confidence: number;
  odds: number;
  bookmakerId: string;
}

export interface MinuteState {
  minute: number;
  score: { home: number; away: number };
  /** True in-play probabilities [home, draw, away]. */
  truth?: [number, number, number];
  model: [number, number, number];
  market: [number, number, number];
}

export interface MatchSim {
  minutes: MinuteState[];
  timeline: LiveEvent[];
  stoppage: number;
}

export interface EventSim {
  event: SportEvent;
  openAt: number;
  durationMin: number;
  markets: MarketSim[];
  bookLagMin: number[];
  bookQuotes: boolean[];
  news: NewsItem[];
  predictionAt: number;
  models: Map<string, SelectionModel>;
  predictions: PredictionDraft[];
  missing: { marketId: string; reason: string }[];
  match?: MatchSim;
  finalScore: { home: number; away: number };
  /** True if the event is a synthetic in-play showcase, not part of the ledgered schedule. */
  showcase: boolean;
}

// ---------------------------------------------------------------------------
// Price paths

function knotTimes(ev: { event: SportEvent }): number[] {
  return KNOTS_H.map((h) => ev.event.kickoff - h * HOUR);
}

function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
    }
  }
  return ys[ys.length - 1];
}

/** Share of the open→close move realised by time t (news arrives as steps). */
function moveFraction(ev: EventSim, t: number): number {
  const span = ev.event.kickoff - ev.openAt;
  const jumps = ev.news.reduce((s, n) => s + n.shift, 0);
  const linear = Math.min(1, Math.max(0, (t - ev.openAt) / span)) * (1 - jumps);
  return linear + ev.news.reduce((s, n) => (n.at <= t ? s + n.shift : s), 0);
}

/** Margin-free market probabilities of every selection at time t (pre-match). */
export function fairProbabilities(ev: EventSim, m: MarketSim, t: number): number[] {
  const tt = Math.min(Math.max(t, ev.openAt), ev.event.kickoff);
  const frac = moveFraction(ev, tt);
  const knots = knotTimes(ev);
  const raw = m.selections.map((s) =>
    sigmoid(
      s.openLogit +
        (s.closeLogit - s.openLogit) * frac +
        interp(knots, s.bridge, tt) +
        0.012 * valueNoise(s.noiseSeed, tt / (20 * MIN)),
    ),
  );
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / total);
}

/** A bookmaker's decimal price at time t, or NaN when it does not quote the event. */
export function bookPrice(ev: EventSim, m: MarketSim, selIndex: number, bookIndex: number, t: number): number {
  if (!ev.bookQuotes[bookIndex] || t < ev.openAt) return NaN;
  const lagged = t - ev.bookLagMin[bookIndex] * MIN;
  const p = fairProbabilities(ev, m, Math.max(lagged, ev.openAt))[selIndex];
  const book = BOOKMAKERS[bookIndex];
  const odds = 1 / (p * (1 + book.margin) * (1 + m.selections[selIndex].bookNoise[bookIndex]));
  return Math.max(1.01, Math.round(odds * 100) / 100);
}

export function bestPrice(ev: EventSim, m: MarketSim, selIndex: number, t: number): { odds: number; bookmakerId: string } {
  let best = { odds: NaN, bookmakerId: "" };
  BOOKMAKERS.forEach((b, i) => {
    const o = bookPrice(ev, m, selIndex, i, t);
    if (!Number.isNaN(o) && !(o <= best.odds)) best = { odds: o, bookmakerId: b.id };
  });
  return best;
}

export function consensusPrice(ev: EventSim, m: MarketSim, selIndex: number, t: number): number {
  const prices = BOOKMAKERS.map((_, i) => bookPrice(ev, m, selIndex, i, t))
    .filter((o) => !Number.isNaN(o))
    .sort((a, b) => a - b);
  if (prices.length === 0) return NaN;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : Math.round(((prices[mid - 1] + prices[mid]) / 2) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Event construction

interface EventSpec {
  id: string;
  sportId: SportId;
  leagueId: string;
  kickoff: number;
  homeTeamId: string;
  awayTeamId: string;
  showcase?: boolean;
}

const ROLES_FOOTBALL = ["first-choice striker", "starting goalkeeper", "captain", "first-choice centre-back", "creative midfielder"];
const ROLES: Record<SportId, string[]> = {
  football: ROLES_FOOTBALL,
  basketball: ["leading scorer", "starting point guard", "starting centre", "sixth man", "key rotation player"],
  "american-football": ["starting quarterback", "lead running back", "top wide receiver", "starting left tackle", "defensive captain"],
  "ice-hockey": ["starting goaltender", "top-line forward", "leading scorer", "top-pair defenceman", "captain"],
  tennis: ["", "", "", "", ""],
};

function marketDefs(sportId: SportId, home: string, away: string): { type: MarketType; name: string; selections: { key: string; name: string }[] }[] {
  if (sportId === "football") {
    return [
      { type: "1X2", name: "Match Winner", selections: [{ key: "home", name: home }, { key: "draw", name: "Draw" }, { key: "away", name: away }] },
      { type: "OU25", name: "Total Goals 2.5", selections: [{ key: "over", name: "Over 2.5" }, { key: "under", name: "Under 2.5" }] },
      { type: "BTTS", name: "Both Teams to Score", selections: [{ key: "yes", name: "BTTS Yes" }, { key: "no", name: "BTTS No" }] },
    ];
  }
  return [{ type: "ML", name: sportId === "tennis" ? "Match Winner" : "Moneyline", selections: [{ key: "home", name: home }, { key: "away", name: away }] }];
}

const ML_PARAMS: Record<Exclude<SportId, "football">, { k: number; home: number }> = {
  basketball: { k: 2.5, home: 0.3 },
  "ice-hockey": { k: 1.5, home: 0.12 },
  "american-football": { k: 2.2, home: 0.2 },
  tennis: { k: 3.0, home: 0 },
};

const FACTOR_LABELS: Record<string, string[]> = {
  "1X2": ["Home xG advantage", "Away defensive trend", "Recent shot quality", "Home/away split", "Squad availability"],
  OU25: ["Combined xG (last 6)", "Home attacking form", "Away defensive form", "Game-state tendency", "Weather conditions"],
  BTTS: ["Away scoring rate", "Home clean-sheet rate", "Shot quality conceded", "Game-state tendency", "Squad availability"],
  ML: ["Net rating (last 10)", "Home/away split", "Rest-day difference", "Head-to-head style", "Availability"],
};

function factorValue(label: string, rng: Rng): string {
  if (label.includes("xG")) return `${rng.range(0.9, 2.3).toFixed(2)} xG/match`;
  if (label.includes("shot quality") || label.includes("Shot quality")) return `${rng.range(0.08, 0.16).toFixed(2)} xG/shot`;
  if (label.includes("split")) return `${rng.range(-25, 30).toFixed(0)}% pts/match at home`;
  if (label.includes("vailability")) return `${rng.range(78, 99).toFixed(0)}% of minutes available`;
  if (label.includes("rate")) return `${rng.range(20, 70).toFixed(0)}% of last 10`;
  if (label.includes("Net rating")) return `${rng.range(-6, 9).toFixed(1)} pts/100`;
  if (label.includes("Rest")) return `${rng.int(-2, 2)} days`;
  if (label.includes("Weather")) return rng.pick(["Dry, 14°C", "Rain forecast", "Wind 25 km/h"]);
  return `${rng.range(-1.5, 1.5).toFixed(2)} σ`;
}

function explanationFactors(type: MarketType, diffPp: number, rng: Rng): ExplanationFactor[] {
  const labels = FACTOR_LABELS[type];
  const weights = labels.map(() => rng.range(0.2, 1)).sort((a, b) => b - a);
  // One factor may pull the other way.
  const opposite = rng.chance(0.5) ? labels.length - 1 : -1;
  const signed = weights.map((w, i) => (i === opposite ? -0.4 * w : w));
  const total = signed.reduce((s, w) => s + w, 0);
  return labels.map((label, i) => ({
    label,
    value: factorValue(label, rng),
    contributionPp: Math.round(((diffPp * signed[i]) / total) * 10) / 10,
  }));
}

function simulateFootballMatch(ev: EventSim, lambda: { home: number; away: number }, modelBias: [number, number, number], rng: Rng): MatchSim {
  const stoppage = rng.int(2, 6);
  const total = 90 + stoppage;
  const score = { home: 0, away: 0 };
  const reds = { home: 0, away: 0 };
  const minutes: MinuteState[] = [];
  const timeline: LiveEvent[] = [];
  const homeName = teamById.get(ev.event.homeTeamId)!.name;
  const awayName = teamById.get(ev.event.awayTeamId)!.name;
  const subs = { home: 0, away: 0 };

  const probsAt = (minute: number): [number, number, number] => {
    const remaining = Math.max(0, 90 - minute) / 90;
    const f = footballProbabilities(
      lambda.home * remaining * Math.pow(0.7, reds.home) / Math.pow(0.85, reds.away),
      lambda.away * remaining * Math.pow(0.7, reds.away) / Math.pow(0.85, reds.home),
      score,
    );
    return [f.home, f.draw, f.away];
  };
  const skew = (p: [number, number, number], bias: number[], sd: number): [number, number, number] => {
    const raw = p.map((x, i) => sigmoid(logit(Math.min(0.999, Math.max(0.001, x))) + bias[i] + rng.normal(0, sd)));
    const s = raw.reduce((a, b) => a + b, 0);
    return raw.map((x) => x / s) as [number, number, number];
  };

  let prevModel = probsAt(0);
  for (let minute = 0; minute <= total; minute++) {
    const events: LiveEvent[] = [];
    if (minute > 0) {
      for (const side of ["home", "away"] as const) {
        const lam = (side === "home" ? lambda.home : lambda.away) * Math.pow(0.7, reds[side]);
        const name = side === "home" ? homeName : awayName;
        // Spread the expected goals over the full playing time so results follow the true probabilities.
        if (rng.chance(lam / total)) {
          score[side]++;
          events.push({ eventId: ev.event.id, minute, kind: "goal", team: side, description: `Goal, ${name}` });
        } else if (rng.chance(2.6 / 90)) {
          events.push({ eventId: ev.event.id, minute, kind: "shot", team: side, description: `Big chance, ${name}` });
        }
        if (rng.chance(1.9 / 90)) events.push({ eventId: ev.event.id, minute, kind: "yellow", team: side, description: `Yellow card, ${name}` });
        if (rng.chance(0.05 / 90)) {
          reds[side]++;
          events.push({ eventId: ev.event.id, minute, kind: "red", team: side, description: `Red card, ${name}` });
        }
        if (rng.chance(5 / 90)) events.push({ eventId: ev.event.id, minute, kind: "corner", team: side, description: `Corner, ${name}` });
        if (minute >= 55 && subs[side] < 5 && rng.chance(0.08)) {
          subs[side]++;
          events.push({ eventId: ev.event.id, minute, kind: "substitution", team: side, description: `Substitution, ${name}` });
        }
      }
    }
    const truth = probsAt(minute);
    const decay = Math.max(0, 1 - minute / 100);
    const model = skew(truth, modelBias.map((b) => b * decay), 0.02);
    const market = skew(truth, [0, 0, 0], 0.035);
    for (const e of events) {
      if (e.kind === "goal" || e.kind === "red") {
        e.modelBefore = prevModel[0];
        e.modelAfter = model[0];
      }
      timeline.push(e);
    }
    minutes.push({ minute, score: { ...score }, truth, model, market });
    prevModel = model;
  }
  return { minutes, timeline, stoppage };
}

export function buildEvent(spec: EventSpec): EventSim {
  const rng = new Rng(`event:${spec.id}`);
  const home = teamById.get(spec.homeTeamId)!;
  const away = teamById.get(spec.awayTeamId)!;
  const openAt = spec.kickoff - MARKET_OPEN_HOURS * HOUR;
  const defs = marketDefs(spec.sportId, home.name, away.name);

  // "True" probabilities: the generator knows them, the market and model do not.
  let truths: number[][];
  let lambda = { home: 0, away: 0 };
  if (spec.sportId === "football") {
    lambda = expectedGoals(home.attack + rng.normal(0, 0.08), home.defence, away.attack + rng.normal(0, 0.08), away.defence);
    const f = footballProbabilities(lambda.home, lambda.away);
    truths = [[f.home, f.draw, f.away], [f.over25, 1 - f.over25], [f.btts, 1 - f.btts]];
  } else {
    const p = ML_PARAMS[spec.sportId];
    const diff = (home.attack + home.defence - away.attack - away.defence) / 2;
    const pHome = sigmoid(p.k * diff + p.home + rng.normal(0, 0.15));
    truths = [[pHome, 1 - pHome]];
  }

  const bigNews = rng.chance(0.12);
  const markets: MarketSim[] = defs.map((d, mi) => {
    const market: Market = { id: `${spec.id}-${d.type.toLowerCase()}`, eventId: spec.id, type: d.type, name: d.name, suspended: false };
    return {
      market,
      selections: d.selections.map((s, si) => {
        const truth = truths[mi][si];
        const w: number[] = [0];
        for (let k = 1; k < KNOTS_H.length; k++) w.push(w[k - 1] + rng.normal(0, 0.008 * Math.sqrt(KNOTS_H[k - 1] - KNOTS_H[k])));
        const wT = w[w.length - 1];
        const bridge = w.map((x, k) => x - ((MARKET_OPEN_HOURS - KNOTS_H[k]) / MARKET_OPEN_HOURS) * wT);
        return {
          selection: { id: `${market.id}-${s.key}`, marketId: market.id, eventId: spec.id, name: s.name },
          truth,
          openLogit: logit(truth) + rng.normal(0, bigNews ? 0.32 : 0.16),
          closeLogit: logit(truth) + rng.normal(0, 0.03),
          bridge,
          noiseSeed: hashString(`${market.id}-${s.key}`),
          bookNoise: BOOKMAKERS.map(() => rng.normal(0, 0.01)),
        };
      }),
    };
  });

  const bookLagMin = BOOKMAKERS.map(() => Math.pow(rng.next(), 2) * 30);
  const bookQuotes = BOOKMAKERS.map(() => rng.chance(spec.sportId === "tennis" ? 0.8 : 0.93));
  if (!bookQuotes.some(Boolean)) bookQuotes[0] = true;

  // News: steps in the price path, worded to match the direction of the move.
  const lead = markets[0].selections;
  const homeRises = sigmoid(lead[0].closeLogit) > sigmoid(lead[0].openLogit);
  const news: NewsItem[] = [];
  const count = rng.weighted([{ item: 0, weight: 0.35 }, { item: 1, weight: 0.45 }, { item: 2, weight: 0.2 }]);
  const roles = ROLES[spec.sportId];
  for (let i = 0; i < count; i++) {
    const at = Math.round(rng.range(openAt + 6 * HOUR, spec.kickoff - 1.5 * HOUR) / MIN) * MIN;
    const good = rng.chance(0.3);
    // Good news for the side the market moves towards, bad news for the other.
    const team = good === homeRises ? home.name : away.name;
    const role = rng.pick(roles);
    const kind = good ? "return" : rng.pick(["injury", "suspension", "rotation"] as const);
    const text =
      spec.sportId === "tennis"
        ? kind === "return" ? `${team} reports no issues after practice`
          : kind === "injury" ? `${team} receiving treatment for a minor injury`
          : kind === "suspension" ? `${team} arrives late after a long previous match`
          : `${team} reported to be managing workload`
      : kind === "return" ? `${team} ${role} returns to full training`
      : kind === "injury" ? `${team} ${role} ruled out with injury`
      : kind === "suspension" ? `${team} ${role} confirmed suspended`
      : `${team} expected to rotate ahead of a midweek fixture`;
    news.push({ at, kind, text, shift: rng.range(0.15, 0.32) });
  }
  if (spec.sportId === "football") {
    news.push({ at: spec.kickoff - 60 * MIN, kind: "lineup", text: "Starting lineups confirmed", shift: rng.range(0.04, 0.1) });
  }
  news.sort((a, b) => a.at - b.at);

  const ev: EventSim = {
    event: {
      id: spec.id,
      sportId: spec.sportId,
      leagueId: spec.leagueId,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoff: spec.kickoff,
      status: "scheduled",
      lineupConfirmedAt: spec.sportId === "football" ? spec.kickoff - 60 * MIN : undefined,
    },
    openAt,
    durationMin: DURATION_MIN[spec.sportId],
    markets,
    bookLagMin,
    bookQuotes,
    news,
    predictionAt: Math.round((openAt + rng.range(1, 6) * HOUR) / 1000) * 1000,
    models: new Map(),
    predictions: [],
    missing: [],
    finalScore: { home: 0, away: 0 },
    showcase: spec.showcase ?? false,
  };

  // Model estimates, fixed at prediction time.
  const release = releaseAt(ev.predictionAt);
  const versionId = ensembleVersionId(spec.sportId, release.version);
  const dq = rng.range(84, 99);
  for (const m of markets) {
    const shared = m.selections.map((s) => {
      let bias = rng.normal(0, release.noise * 0.85);
      // Deliberate weakness for the Model Lab to find: football draws are
      // overestimated. v1.4's recalibration shrinks the error but does not remove it.
      if (spec.sportId === "football" && m.market.type === "1X2" && s.selection.id.endsWith("-draw")) bias += release.version === "1.4" ? 0.2 : 0.4;
      return bias;
    });
    const components = COMPONENT_MODELS.map((c) => {
      const raw = m.selections.map((s, i) => sigmoid(logit(s.truth) + shared[i] + rng.normal(0, 0.07)));
      const total = raw.reduce((a, b) => a + b, 0);
      return { c, probs: raw.map((p) => p / total) };
    });
    const fair = fairProbabilities(ev, m, ev.predictionAt);
    m.selections.forEach((s, i) => {
      const comps = components.map(({ probs }) => probs[i]);
      const ens = components.reduce((sum, { c, probs }) => sum + c.weight * probs[i], 0);
      const cons = modelConsensus(comps);
      const se = Math.sqrt(0.022 ** 2 + (cons.stdevPp / 100) ** 2);
      const ciLow = Math.max(0.005, ens - 1.64 * se);
      const ciHigh = Math.min(0.995, ens + 1.64 * se);
      const confidence = predictionConfidence({ ciLow, ciHigh, modelStdevPp: cons.stdevPp, dataQuality: dq });
      const mk = (id: string, p: number, lo: number, hi: number): ModelEstimate => ({
        selectionId: s.selection.id,
        modelVersionId: id,
        probability: p,
        ciLow: lo,
        ciHigh: hi,
        computedAt: ev.predictionAt,
      });
      ev.models.set(s.selection.id, {
        selectionId: s.selection.id,
        ensemble: mk(versionId, ens, ciLow, ciHigh),
        components: components.map(({ c, probs }) => mk(c.versionId, probs[i], Math.max(0.005, probs[i] - 0.05), Math.min(0.995, probs[i] + 0.05))),
        factors: explanationFactors(m.market.type, (ens - fair[i]) * 100, rng),
        confidence,
      });
    });

    if (!ev.showcase && rng.chance(0.004)) {
      ev.missing.push({ marketId: m.market.id, reason: "Odds feed outage during the scheduled model run" });
      continue;
    }
    if (ev.showcase) continue;
    m.selections.forEach((s, i) => {
      const est = ev.models.get(s.selection.id)!;
      const best = bestPrice(ev, m, i, ev.predictionAt);
      ev.predictions.push({
        id: `pr-${s.selection.id}`,
        createdAt: ev.predictionAt,
        eventId: spec.id,
        marketId: m.market.id,
        selectionId: s.selection.id,
        modelVersionId: versionId,
        probability: est.ensemble.probability,
        ciLow: est.ensemble.ciLow,
        ciHigh: est.ensemble.ciHigh,
        confidence: est.confidence,
        odds: best.odds,
        bookmakerId: best.bookmakerId,
      });
    });
  }

  // Result.
  if (spec.sportId === "football") {
    const ensembleBias = markets[0].selections.map((s) => {
      const est = ev.models.get(s.selection.id)!;
      return logit(est.ensemble.probability) - logit(s.truth);
    }) as [number, number, number];
    ev.match = simulateFootballMatch(ev, lambda, ensembleBias, rng);
    ev.finalScore = ev.match.minutes[ev.match.minutes.length - 1].score;
  } else {
    const homeWins = rng.chance(truths[0][0]);
    const [lo, hi] =
      spec.sportId === "basketball" ? [98, 128]
      : spec.sportId === "american-football" ? [10, 34]
      : spec.sportId === "ice-hockey" ? [1, 5]
      : [0, 1];
    const winner = spec.sportId === "tennis" ? 2 : rng.int(lo + 1, hi);
    const loser = spec.sportId === "tennis" ? rng.int(0, 1) : Math.max(0, winner - (spec.sportId === "ice-hockey" ? rng.int(1, 2) : rng.int(1, 14)));
    ev.finalScore = homeWins ? { home: winner, away: loser } : { home: loser, away: winner };
  }
  settleSelections(ev);
  return ev;
}

function settleSelections(ev: EventSim) {
  const { home, away } = ev.finalScore;
  for (const m of ev.markets) {
    for (const s of m.selections) {
      const key = s.selection.id.slice(m.market.id.length + 1);
      const won =
        key === "home" ? home > away
        : key === "away" ? away > home
        : key === "draw" ? home === away
        : key === "over" ? home + away > 2.5
        : key === "under" ? home + away < 2.5
        : key === "yes" ? home > 0 && away > 0
        : key === "no" ? !(home > 0 && away > 0)
        : false;
      s.selection.result = won ? "won" : "lost";
    }
  }
}

// ---------------------------------------------------------------------------
// Schedule

const FOOTBALL_LEAGUE_WEIGHTS = [
  { item: "epl", weight: 3 },
  { item: "laliga", weight: 2 },
  { item: "bundesliga", weight: 2 },
  { item: "seriea", weight: 2 },
  { item: "ligue1", weight: 1.5 },
  { item: "eredivisie", weight: 1 },
  { item: "superliga", weight: 1 },
  { item: "championship", weight: 1.5 },
];

const SLOTS_H: Record<SportId, number[]> = {
  football: [11.5, 13, 14, 16.5, 17, 18.75, 19, 20],
  basketball: [23.5, 24.5, 25, 26.5],
  tennis: [10, 12, 14.5, 17, 19],
  "american-football": [17, 20.25, 24.33],
  "ice-hockey": [23, 24, 25.5],
};

export function eventsForDay(dayStart: number): EventSim[] {
  const rng = new Rng(`day:${dayStart}`);
  const dow = new Date(dayStart).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const plan: { sportId: SportId; leagueId: string }[] = [];
  const footballCount = weekend ? rng.int(8, 11) : rng.int(3, 5);
  for (let i = 0; i < footballCount; i++) plan.push({ sportId: "football", leagueId: rng.weighted(FOOTBALL_LEAGUE_WEIGHTS) });
  for (let i = rng.int(1, 3); i > 0; i--) plan.push({ sportId: "basketball", leagueId: "nba" });
  for (let i = rng.int(0, 2); i > 0; i--) plan.push({ sportId: "ice-hockey", leagueId: "nhl" });
  for (let i = rng.int(1, 2); i > 0; i--) plan.push({ sportId: "tennis", leagueId: "atp" });
  const nflGames = dow === 0 ? rng.int(3, 4) : dow === 1 || dow === 4 ? 1 : 0;
  for (let i = 0; i < nflGames; i++) plan.push({ sportId: "american-football", leagueId: "nfl" });

  const used = new Set<string>();
  const day = new Date(dayStart).toISOString().slice(0, 10).replace(/-/g, "");
  return plan.map((p, i) => {
    const teams = teamsByLeague.get(p.leagueId)!.filter((t) => !used.has(t.id));
    const [home, away] = rng.pair(teams.length >= 2 ? teams : teamsByLeague.get(p.leagueId)!);
    used.add(home.id);
    used.add(away.id);
    const kickoff = dayStart + rng.pick(SLOTS_H[p.sportId]) * HOUR;
    return buildEvent({ id: `ev-${day}-${String(i + 1).padStart(2, "0")}`, sportId: p.sportId, leagueId: p.leagueId, kickoff, homeTeamId: home.id, awayTeamId: away.id });
  });
}

/**
 * In-play showcase: one football match kicks off every 40 minutes around the
 * clock, so the Live Markets view always has matches in progress. These are
 * not part of the ledgered schedule; in-play estimates are never ledgered.
 */
export function showcaseLiveEvents(now: number): EventSim[] {
  const bucket = 40 * MIN;
  const out: EventSim[] = [];
  const footballLeagues = LEAGUES.filter((l) => l.sportId === "football");
  for (let k = Math.floor(now / bucket) - 3; k <= Math.floor(now / bucket); k++) {
    const rng = new Rng(`showcase:${k}`);
    const league = rng.pick(footballLeagues);
    const [home, away] = rng.pair(teamsByLeague.get(league.id)!);
    const kickoff = k * bucket + rng.int(0, 5) * MIN;
    if (kickoff > now) continue;
    out.push(buildEvent({ id: `live-${k}`, sportId: "football", leagueId: league.id, kickoff, homeTeamId: home.id, awayTeamId: away.id, showcase: true }));
  }
  return out;
}

export function leagueName(id: string): string {
  return leagueById.get(id)?.name ?? id;
}
