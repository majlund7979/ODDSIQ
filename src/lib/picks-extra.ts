// More bet types for Dagens bedste bets, all from the same forecasts:
// double chance and draw no bet (from the combined 1X2 probabilities),
// correct score and first-half markets (from the model's expected goals),
// today's coupon, and how recorded picks are settled.

import type { MarketRow } from "@/lib/demo/store";
import { DEFAULT_HT_SHARE } from "@/lib/model/match-stats";
import { analysePick, COUNT_CATEGORIES, countPicks, dailyPicks, GOAL_CATEGORIES, marketPicks, PICK_WINDOW_MS, strengthOf, type Pick, type PickContext } from "@/lib/picks";

export interface ExtraPick {
  row: MarketRow;
  category: string;
  outcome: string;
  spec: string;
  probability: number;
  fairOdds: number;
  strength: Pick["strength"];
  /** Small table shown under "Se hele analysen". */
  table: { label: string; probability: number }[];
  note: string;
  /** The best bookmaker price for this outcome, when the feed has the market. */
  best?: { odds: number; book: string };
}

const pmf = (k: number, l: number) => {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
};

/** Every score up to 10-10 with its probability, likeliest first (independent Poisson goals). */
export function scoreGrid(lambda: number, mu: number): { home: number; away: number; probability: number }[] {
  const out = [];
  for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) out.push({ home: x, away: y, probability: pmf(x, lambda) * pmf(y, mu) });
  return out.sort((a, b) => b.probability - a.probability);
}

export function halfTime(lambda: number, mu: number, share: { home: number; away: number } = { home: DEFAULT_HT_SHARE, away: DEFAULT_HT_SHARE }) {
  const l = lambda * share.home;
  const m = mu * share.away;
  const grid = scoreGrid(l, m);
  const sum = (f: (g: (typeof grid)[number]) => boolean) => grid.filter(f).reduce((s, g) => s + g.probability, 0);
  return {
    expected: { home: l, away: m },
    over05: sum((g) => g.home + g.away > 0.5),
    over15: sum((g) => g.home + g.away > 1.5),
    home: sum((g) => g.home > g.away),
    draw: sum((g) => g.home === g.away),
    away: sum((g) => g.home < g.away),
  };
}

type Ctx = (eventId: string) => PickContext | null;

/** Football matches in the window, with their 1X2 rows and context. */
function matches(rows: MarketRow[], now: number, context: Ctx) {
  const byEvent = new Map<string, MarketRow[]>();
  for (const r of rows) {
    if (r.sportId !== "football" || r.status !== "scheduled" || r.kickoff <= now || r.kickoff > now + PICK_WINDOW_MS || r.marketType !== "1X2") continue;
    byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
  }
  return [...byEvent.values()].flatMap((rs) => {
    const home = rs.find((r) => r.side === "home");
    const draw = rs.find((r) => r.side === "draw");
    const away = rs.find((r) => r.side === "away");
    if (!home || !draw || !away) return [];
    return [{ home, draw, away, ctx: context(home.eventId) }];
  });
}

function finish(picks: ExtraPick[], count: number) {
  return picks.sort((a, b) => b.probability - a.probability || a.row.kickoff - b.row.kickoff).slice(0, count);
}

function make(row: MarketRow, category: string, outcome: string, spec: string, probability: number, table: ExtraPick["table"], note: string, best?: ExtraPick["best"]): ExtraPick {
  return { row, category, outcome, spec, probability, fairOdds: 1 / probability, strength: strengthOf(probability), table, note, ...(best ? { best } : {}) };
}

const teams = (r: MarketRow) => r.match.split(" vs ") as [string, string];

/** Double chance per match (1X, X2 or 12), from the combined 1X2 probabilities; draw no bet shown alongside. */
export function doubleChancePicks(rows: MarketRow[], now: number, count: number, context: Ctx): ExtraPick[] {
  const out: ExtraPick[] = [];
  for (const m of matches(rows, now, context)) {
    const p = [m.home, m.draw, m.away].map((r) => analysePick(r, m.ctx)?.probability ?? null);
    if (p.some((x) => x === null)) continue;
    const total = p[0]! + p[1]! + p[2]!;
    const [h, d, a] = p.map((x) => x! / total);
    const [home, away] = teams(m.home);
    const options = [
      { outcome: `${home} eller uafgjort`, spec: "DC:1X", probability: h + d },
      { outcome: `${away} eller uafgjort`, spec: "DC:X2", probability: d + a },
      { outcome: `${home} eller ${away} (ikke uafgjort)`, spec: "DC:12", probability: h + a },
    ];
    const best = options.sort((x, y) => y.probability - x.probability)[0];
    const dcRow = rows.find((r) => r.eventId === m.home.eventId && r.marketType === "DC" && r.side === best.spec.slice(3).toLowerCase() && r.bestOdds > 1);
    const dnbSide = h >= a ? { team: home, p: h } : { team: away, p: a };
    out.push(
      make(
        m.home,
        "dobbelt",
        best.outcome,
        best.spec,
        best.probability,
        [
          { label: `${home} vinder`, probability: h },
          { label: "Uafgjort", probability: d },
          { label: `${away} vinder`, probability: a },
          { label: `${dnbSide.team}, uafgjort = penge tilbage`, probability: dnbSide.p / (1 - d) },
        ],
        `Dobbeltchance vinder på to af de tre udfald. "Uafgjort = penge tilbage" på ${dnbSide.team}: du vinder i ${Math.round(dnbSide.p * 100)} % af kampene, får pengene tilbage i ${Math.round(d * 100)} % og taber i resten.`,
        dcRow ? { odds: dcRow.bestOdds, book: dcRow.bestBook } : undefined,
      ),
    );
  }
  return finish(out, count);
}

/** The likeliest exact score per match. */
export function correctScorePicks(rows: MarketRow[], now: number, count: number, context: Ctx): ExtraPick[] {
  const out: ExtraPick[] = [];
  for (const m of matches(rows, now, context)) {
    const xg = m.ctx?.expectedGoals;
    if (!xg) continue;
    const top = scoreGrid(xg.home, xg.away).slice(0, 3);
    const [home, away] = teams(m.home);
    out.push(
      make(
        m.home,
        "resultat",
        `${home} ${top[0].home}-${top[0].away} ${away}`,
        `CS:${top[0].home}-${top[0].away}`,
        top[0].probability,
        top.map((s) => ({ label: `${s.home}-${s.away}`, probability: s.probability })),
        `Ud fra forventede mål ${xg.home.toFixed(1).replace(".", ",")} mod ${xg.away.toFixed(1).replace(".", ",")}. Et præcist resultat rammer sjældent, men betaler højt.`,
      ),
    );
  }
  return finish(out, count);
}

/** First-half goals per match: over 0,5 goals before the break, with the half-time result alongside. */
export function halfTimePicks(rows: MarketRow[], now: number, count: number, context: Ctx): ExtraPick[] {
  const out: ExtraPick[] = [];
  for (const m of matches(rows, now, context)) {
    const xg = m.ctx?.expectedGoals;
    if (!xg) continue;
    const ht = halfTime(xg.home, xg.away, m.ctx?.htShare ?? undefined);
    const [home, away] = teams(m.home);
    const over = ht.over05 >= 0.5;
    out.push(
      make(
        m.home,
        "halvleg",
        over ? "Mål i 1. halvleg (over 0,5)" : "Ingen mål i 1. halvleg",
        over ? "HT:over:0.5" : "HT:under:0.5",
        over ? ht.over05 : 1 - ht.over05,
        [
          { label: "Over 0,5 mål i 1. halvleg", probability: ht.over05 },
          { label: "Over 1,5 mål i 1. halvleg", probability: ht.over15 },
          { label: `${home} fører ved pausen`, probability: ht.home },
          { label: "Uafgjort ved pausen", probability: ht.draw },
          { label: `${away} fører ved pausen`, probability: ht.away },
        ],
        `Forventede mål før pausen: ${ht.expected.home.toFixed(1).replace(".", ",")} mod ${ht.expected.away.toFixed(1).replace(".", ",")}${m.ctx?.htShare?.n ? `, ud fra hvor stor en del af målene der falder før pausen i ligaen (${m.ctx.htShare.n} kampe)` : ""}.`,
      ),
    );
  }
  return finish(out, count);
}

export interface Coupon {
  picks: Pick[];
  probability: number;
  odds: number;
  /** "odds": likeliest combination reaching COUPON_MIN_ODDS. "value": value bets first, then the likeliest (Mads, 2026-10-03). */
  kind: "odds" | "value";
  /** Legs whose best odds pay more than our fair odds. */
  valueLegs: number;
  /** What 1 kr staked returns on average: chance × combined odds. */
  expectedReturn: number;
}

export const COUPON_MIN_ODDS = 2;

/** A pick is a value bet when the model (not only the market) rates it and the best price beats the fair odds. */
export const isValue = (p: Pick) => !p.marketOnly && p.row.bestOdds * p.probability > 1;

function coupon(picks: Pick[], kind: Coupon["kind"]): Coupon {
  const sorted = [...picks].sort((a, b) => b.probability - a.probability);
  const odds = sorted.reduce((o, x) => o * x.row.bestOdds, 1);
  const probability = sorted.reduce((q, x) => q * x.probability, 1);
  return { picks: sorted, probability, odds, kind, valueLegs: sorted.filter(isValue).length, expectedReturn: probability * odds };
}

/**
 * The 2-bet coupon: the combination of picks (one per match) with the highest
 * chance that both go home while the combined odds are at least `minOdds`.
 * Assumes the matches are independent; left out when no pair reaches the odds.
 */
export function oddsCoupon(pool: Pick[], n = 2, minOdds = COUPON_MIN_ODDS): Coupon | null {
  const cands = pool.filter((p) => p.row.bestOdds > 1).slice(0, 15);
  let best: Pick[] | null = null;
  let bestP = -1;
  const walk = (start: number, chosen: Pick[]) => {
    if (chosen.length === n) {
      const odds = chosen.reduce((o, x) => o * x.row.bestOdds, 1);
      const probability = chosen.reduce((q, x) => q * x.probability, 1);
      if (odds >= minOdds && probability > bestP) {
        best = [...chosen];
        bestP = probability;
      }
      return;
    }
    for (let i = start; i < cands.length; i++) {
      if (chosen.some((c) => c.row.eventId === cands[i].row.eventId)) continue;
      walk(i + 1, [...chosen, cands[i]]);
    }
  };
  walk(0, []);
  return best ? coupon(best, "odds") : null;
}

/**
 * The 3-bet coupon, with no odds minimum: the likeliest value bets (best odds
 * above our fair odds), one per match, topped up with the likeliest other
 * picks when fewer than three are value bets.
 */
export function valueCoupon(pool: Pick[], n = 3): Coupon | null {
  const byChance = pool.filter((p) => p.row.bestOdds > 1).sort((a, b) => b.probability - a.probability);
  const chosen: Pick[] = [];
  for (const p of [...byChance.filter(isValue), ...byChance.filter((x) => !isValue(x))]) {
    if (chosen.length === n) break;
    if (!chosen.some((c) => c.row.eventId === p.row.eventId)) chosen.push(p);
  }
  return chosen.length === n ? coupon(chosen, "value") : null;
}

/**
 * Today's coupons: 2 bets with combined odds of at least 2.0, and 3 bets by value and chance.
 * The 3-bet coupon only uses matches the 2-bet coupon leaves out, so the two never share a bet.
 */
export function coupons(pool: Pick[]): Coupon[] {
  const two = oddsCoupon(pool);
  const used = new Set(two?.picks.map((p) => p.row.eventId));
  const three = valueCoupon(pool.filter((p) => !used.has(p.row.eventId)));
  return [two, three].filter((c): c is Coupon => c !== null);
}

// ---------------------------------------------------------------------------
// Settlement of recorded picks

export interface MatchOutcome {
  goals: [number, number] | null;
  ht: [number, number] | null;
  corners: [number, number] | null;
  cards: [number, number] | null;
  fouls: [number, number] | null;
}

/** "won", "lost", or null while the needed data is missing. */
export function settle(spec: string, o: MatchOutcome): "won" | "lost" | null {
  const [kind, a, b] = spec.split(":");
  const res = (x: boolean) => (x ? "won" : "lost");
  const g = o.goals;
  if (kind === "1X2") return g ? res(a === "home" ? g[0] > g[1] : a === "away" ? g[0] < g[1] : g[0] === g[1]) : null;
  if (kind === "OU") return g ? res(a === "over" ? g[0] + g[1] > Number(b) : g[0] + g[1] < Number(b)) : null;
  if (kind === "BTTS") return g ? res((g[0] > 0 && g[1] > 0) === (a === "yes")) : null;
  if (kind === "DC") return g ? res(a === "1X" ? g[0] >= g[1] : a === "X2" ? g[0] <= g[1] : g[0] !== g[1]) : null;
  if (kind === "CS") {
    const [h, w] = a.split("-").map(Number);
    return g ? res(g[0] === h && g[1] === w) : null;
  }
  if (kind === "HT") return o.ht ? res(a === "over" ? o.ht[0] + o.ht[1] > Number(b) : o.ht[0] + o.ht[1] < Number(b)) : null;
  if (kind === "COUNT") {
    const v = o[a as "corners" | "cards" | "fouls"];
    const [side, line] = b.split("@");
    return v ? res(side === "over" ? v[0] + v[1] > Number(line) : v[0] + v[1] < Number(line)) : null;
  }
  return null;
}

/** The settle spec for a goal-market pick. */
export function goalSpec(r: MarketRow): string {
  if (r.marketType === "1X2") return `1X2:${r.side}`;
  if (r.marketType === "OU15") return `OU:${r.side}:1.5`;
  if (r.marketType === "OU25") return `OU:${r.side}:2.5`;
  if (r.marketType === "BTTS") return `BTTS:${r.side}`;
  return `${r.marketType}:${r.side}`;
}

export interface RecordedPick {
  day: string;
  kickoff: number;
  league: string;
  match: string;
  category: string;
  outcome: string;
  probability: number;
  odds: number | null;
  result: "won" | "lost" | null;
  /** The market's closing line for this bet; null when it closed without a stored market, absent in demo data. */
  close?: { odds: number | null; probability: number; books: number; clv: number } | null;
}

export interface ResultsSummary {
  settled: number;
  won: number;
  /** Profit in units for picks with odds, staking 1 each. */
  withOdds: number;
  profit: number;
  /** Average stated probability of the settled picks. */
  expectedRate: number;
  /** Profit per krone staked on the settled picks with odds; NaN without any. */
  roi: number;
  /** Bets with a closing line, and how many of them beat it. */
  withClose: number;
  beatClose: number;
  /** Average closing line value (shown odds × closing probability − 1). */
  clv: number;
}

/** Settled bets with odds needed before a return (ROI) is shown as more than a hint. */
export const ROI_MIN = 30;

/** "+4 %" or "−7 %", or "for få bets" below ROI_MIN. */
export function roiLabel(s: { roi: number; withOdds: number }): string {
  if (!s.withOdds) return "—";
  const v = `${s.roi >= 0 ? "+" : "−"}${Math.round(Math.abs(s.roi) * 100)} %`;
  return s.withOdds < ROI_MIN ? `${v} (for få bets)` : v;
}

export function summarise(picks: RecordedPick[]): ResultsSummary {
  const settled = picks.filter((p) => p.result);
  const odds = settled.filter((p) => p.odds);
  const closed = picks.filter((p) => p.close);
  const profit = odds.reduce((s, p) => s + (p.result === "won" ? p.odds! - 1 : -1), 0);
  return {
    settled: settled.length,
    won: settled.filter((p) => p.result === "won").length,
    withOdds: odds.length,
    profit,
    roi: odds.length ? profit / odds.length : NaN,
    expectedRate: settled.length ? settled.reduce((s, p) => s + p.probability, 0) / settled.length : NaN,
    withClose: closed.length,
    beatClose: closed.filter((p) => p.close!.clv > 0).length,
    clv: closed.length ? closed.reduce((s, p) => s + p.close!.clv, 0) / closed.length : NaN,
  };
}

// ---------------------------------------------------------------------------
// Every bet type at once, for recording

export interface PickDraft {
  row: MarketRow;
  category: string;
  outcome: string;
  spec: string;
  probability: number;
  odds: number | null;
}

export function allPickDrafts(rows: MarketRow[], now: number, count: number, context: Ctx): PickDraft[] {
  const goal = (category: string, picks: Pick[]) => picks.map((p) => ({ row: p.row, category, outcome: p.outcome, spec: goalSpec(p.row), probability: p.probability, odds: p.row.bestOdds }));
  const extra = (picks: ExtraPick[]) => picks.map((p) => ({ row: p.row, category: p.category, outcome: p.outcome, spec: p.spec, probability: p.probability, odds: p.best?.odds ?? null }));
  return [
    ...goal("bedste", dailyPicks(rows, now, count, context)),
    ...GOAL_CATEGORIES.flatMap((c) => goal(c.id, marketPicks(rows, now, count, c.market, context))),
    ...extra(doubleChancePicks(rows, now, count, context)),
    ...extra(correctScorePicks(rows, now, count, context)),
    ...extra(halfTimePicks(rows, now, count, context)),
    ...COUNT_CATEGORIES.flatMap((c) =>
      countPicks(rows, now, count, c.stat, context).map((p) => ({
        row: p.row,
        category: c.id,
        outcome: p.outcome,
        spec: `COUNT:${c.stat}:${p.forecast.suggestion.side}@${p.forecast.suggestion.line}`,
        probability: p.probability,
        odds: null,
      })),
    ),
  ];
}
