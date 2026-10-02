// "Dagens bedste bets": the simple daily list. Every outcome in a match that
// kicks off in the next 24 hours (the window the model forecasts) gets one
// combined probability from four sources:
//   1. the results model (Dixon-Coles + Elo),
//   2. team news: players out or doubtful, checked against confirmed lineups,
//   3. recent xG form,
//   4. the bookmakers' margin-free price, which carries everything the market
//      has read (news, rumours, late team information).
// Each match keeps its most likely outcome; matches are ranked by it.
// Steps 2 and 3 move the model's expected goals and re-price the outcome with
// a Poisson goals model; their size is a heuristic, not a fitted parameter.

import type { MarketRow } from "@/lib/demo/store";
import { teamKey } from "@/lib/model/teams";
import type { TeamNews } from "@/lib/stats/news";

export const PICK_WINDOW_MS = 24 * 3_600_000;
export const PICK_COUNTS = [5, 10] as const;

/** Share of the final probability taken from the bookmakers' price. */
export const MARKET_WEIGHT = 0.5;
/** Share of expected goals taken from recent xG form, when both teams have it. */
export const XG_FORM_WEIGHT = 0.25;
export const XG_FORM_MIN_MATCHES = 3;
/** Per missing player: the team's own expected goals fall, the opponent's rise. */
export const ABSENCE_ATTACK = 0.03;
export const ABSENCE_DEFENCE = 0.02;
export const MAX_ABSENCES = 6;

export interface PickContext {
  expectedGoals: { home: number; away: number };
  news: TeamNews | null;
}

export interface PickFactor {
  label: string;
  /** Change in percentage points this source made, or null for a level. */
  pp: number | null;
  detail: string;
}

export interface Pick {
  row: MarketRow;
  /** Plain-language outcome, e.g. "Arsenal vinder" or "Over 2,5 mål". */
  outcome: string;
  /** Combined probability from all sources. */
  probability: number;
  /** Odds at which the combined probability breaks even. */
  fairOdds: number;
  /** True when the best price pays more than the fair odds. */
  value: boolean;
  lineupsConfirmed: boolean;
  factors: PickFactor[];
}

export function outcomeLabel(r: MarketRow): string {
  if (r.marketType === "OU25") return r.side === "over" ? "Over 2,5 mål" : "Under 2,5 mål";
  if (r.marketType === "BTTS") return r.side === "yes" ? "Begge hold scorer" : "Ikke begge hold scorer";
  if (r.side === "draw") return "Uafgjort";
  return `${r.selection} vinder`;
}

const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));
const pct = (p: number) => `${Math.round(p * 100)} %`;

function pmf(k: number, l: number) {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

/** Probability of a selection when the teams score Poisson(λ) and Poisson(μ) goals. */
export function goalsProbability(marketType: string, side: string, lambda: number, mu: number): number | null {
  if (marketType !== "1X2" && marketType !== "OU25" && marketType !== "BTTS") return null;
  let p = 0;
  for (let x = 0; x <= 10; x++)
    for (let y = 0; y <= 10; y++) {
      const hit =
        marketType === "1X2" ? (side === "home" ? x > y : side === "away" ? x < y : x === y)
        : marketType === "OU25" ? (side === "over") === x + y > 2.5
        : (side === "yes") === (x > 0 && y > 0);
      if (hit) p += pmf(x, lambda) * pmf(y, mu);
    }
  return p;
}

/** Missing players per side; a player listed out but named in a confirmed starting XI does not count. */
export function absences(news: TeamNews | null) {
  const out = { home: { weight: 0, team: "", players: [] as string[] }, away: { weight: 0, team: "", players: [] as string[] } };
  if (!news) return out;
  const starting = new Set(news.lineups.flatMap((l) => l.startXI.map((p) => `${l.side}|${teamKey(p.name)}`)));
  for (const i of news.injuries) {
    if (starting.has(`${i.side}|${teamKey(i.player)}`)) continue;
    out[i.side].weight += i.status === "out" ? 1 : 0.5;
    out[i.side].players.push(i.player);
    out[i.side].team = i.team;
  }
  return out;
}

const signedPp = (pp: number) => `${pp >= 0 ? "+" : "−"}${Math.abs(pp).toFixed(1).replace(".", ",")} pp`;

export function analysePick(row: MarketRow, ctx: PickContext | null): Omit<Pick, "fairOdds" | "value" | "outcome"> | null {
  const model = row.modelProbability;
  if (model == null) return null;
  const factors: PickFactor[] = [{ label: "Resultatmodel", pp: null, detail: `${pct(model)} ud fra kampresultater og Elo` }];
  let p = model;
  let lineupsConfirmed = false;

  if (ctx) {
    const base = ctx.expectedGoals;
    const news = ctx.news;
    lineupsConfirmed = !!news && news.lineups.length === 2;
    let lambda = base.home;
    let mu = base.away;
    const ref = goalsProbability(row.marketType, row.side, lambda, mu);

    if (ref !== null && news) {
      const f = news.form;
      if (f.home && f.away && f.home.n >= XG_FORM_MIN_MATCHES && f.away.n >= XG_FORM_MIN_MATCHES) {
        const lx = (f.home.xgFor + f.away.xgAgainst) / 2;
        const mx = (f.away.xgFor + f.home.xgAgainst) / 2;
        const l2 = (1 - XG_FORM_WEIGHT) * lambda + XG_FORM_WEIGHT * lx;
        const m2 = (1 - XG_FORM_WEIGHT) * mu + XG_FORM_WEIGHT * mx;
        const d = goalsProbability(row.marketType, row.side, l2, m2)! - goalsProbability(row.marketType, row.side, lambda, mu)!;
        lambda = l2;
        mu = m2;
        p += d;
        factors.push({ label: "xG-form", pp: d * 100, detail: `seneste ${Math.min(f.home.n, f.away.n)} kampe: ${f.home.xgFor.toFixed(1)} mod ${f.away.xgFor.toFixed(1)} xG` });
      }

      const abs = absences(news);
      const h = Math.min(abs.home.weight, MAX_ABSENCES);
      const a = Math.min(abs.away.weight, MAX_ABSENCES);
      if (h + a > 0) {
        const l2 = lambda * (1 - ABSENCE_ATTACK * h) * (1 + ABSENCE_DEFENCE * a);
        const m2 = mu * (1 - ABSENCE_ATTACK * a) * (1 + ABSENCE_DEFENCE * h);
        const d = goalsProbability(row.marketType, row.side, l2, m2)! - goalsProbability(row.marketType, row.side, lambda, mu)!;
        p += d;
        const who = [abs.home, abs.away]
          .filter((x) => x.players.length)
          .map((x) => `${x.team} mangler ${x.players.length} (${x.players.slice(0, 3).join(", ")}${x.players.length > 3 ? " m.fl." : ""})`)
          .join("; ");
        factors.push({ label: "Skader og karantæner", pp: d * 100, detail: who });
      } else if (news.injuriesAt) {
        factors.push({ label: "Skader og karantæner", pp: 0, detail: "ingen vigtige afbud meldt" });
      }
      if (lineupsConfirmed) factors.push({ label: "Startopstilling", pp: null, detail: "bekræftet" });
    }
  }

  p = clamp(p);
  const market = row.marketProbability;
  const final = clamp((1 - MARKET_WEIGHT) * p + MARKET_WEIGHT * market);
  factors.push({ label: "Bookmakerne", pp: (final - p) * 100, detail: `${pct(market)}, inkl. nyheder og rygter markedet har læst` });
  return { row, probability: final, lineupsConfirmed, factors };
}

export function dailyPicks(rows: MarketRow[], now: number, count: number, context: (eventId: string) => PickContext | null = () => null): Pick[] {
  const best = new Map<string, NonNullable<ReturnType<typeof analysePick>>>();
  for (const r of rows) {
    if (r.status !== "scheduled" || r.kickoff <= now || r.kickoff > now + PICK_WINDOW_MS) continue;
    const a = analysePick(r, context(r.eventId));
    if (!a) continue;
    const cur = best.get(r.eventId);
    if (!cur || a.probability > cur.probability) best.set(r.eventId, a);
  }
  return [...best.values()]
    .sort((a, b) => b.probability - a.probability || a.row.kickoff - b.row.kickoff)
    .slice(0, count)
    .map((a) => ({ ...a, outcome: outcomeLabel(a.row), fairOdds: 1 / a.probability, value: a.row.bestOdds * a.probability > 1 }));
}

export { signedPp };
