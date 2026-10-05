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
import type { CountForecast, CountForecasts, CountStat } from "@/lib/model/match-stats";
import type { HistMatch } from "@/lib/model/openfootball";
import { teamKey } from "@/lib/model/teams";
import { AF_PREDICTION_MODEL, AF_PREDICTION_WEIGHT, flooredPercent, type AfPrediction } from "@/lib/stats/af-predictions";
import { CLUBELO_MODEL, CLUBELO_WEIGHT, clubEloProbs, type ClubEloPair } from "@/lib/stats/clubelo";
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
  /** From the results model; absent for a league without results history. */
  expectedGoals?: { home: number; away: number };
  news: TeamNews | null;
  /** The results data behind the model, when the teams are matched to it. */
  teams?: { home: string; away: string; homeElo: number; awayElo: number; history: HistMatch[] };
  /** Corners, cards and fouls forecasts. */
  counts?: CountForecasts;
  /** Share of each side's goals scored before half-time in this league. */
  htShare?: { home: number; away: number; n: number } | null;
  /** Both clubs' ClubElo ratings, comparable across leagues. */
  clubElo?: ClubEloPair | null;
  /** API-Football's own percentages and team comparison for the match. */
  afPrediction?: AfPrediction | null;
}

export interface FormGame {
  result: "V" | "U" | "T";
  score: string;
  opponent: string;
  home: boolean;
}

/** Background facts shown with a pick; they do not move its probability. */
export interface PickInsights {
  expectedGoals: { home: number; away: number } | null;
  elo: { home: number; away: number } | null;
  /** ClubElo ratings across leagues; on a market-only 1X2 pick they also move the probability (see the factors). */
  clubElo: ClubEloPair | null;
  /** API-Football's percentages and comparison; on a market-only 1X2 pick they move the probability before ClubElo does. */
  afPrediction: AfPrediction | null;
  form: { home: FormGame[]; away: FormGame[] } | null;
  h2h: { home: number; draw: number; away: number; games: { date: number; score: string }[] } | null;
  /** Change in the best odds since the market opened; negative means the price shortened. */
  movement: number;
  lineupsConfirmed: boolean;
}

export const FORM_GAMES = 5;
export const H2H_GAMES = 6;

/** A team's last results, newest first, from its own point of view. */
export function recentForm(team: string, history: HistMatch[], n = FORM_GAMES): FormGame[] {
  const out: FormGame[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < n; i--) {
    const m = history[i];
    const home = m.home === team;
    if (!home && m.away !== team) continue;
    const gf = home ? m.hg : m.ag;
    const ga = home ? m.ag : m.hg;
    out.push({ result: gf > ga ? "V" : gf === ga ? "U" : "T", score: `${gf}-${ga}`, opponent: home ? m.away : m.home, home });
  }
  return out;
}

/** Recent meetings, counted from the point of view of today's home team. */
export function headToHead(home: string, away: string, history: HistMatch[], n = H2H_GAMES): PickInsights["h2h"] {
  const games = history.filter((m) => (m.home === home && m.away === away) || (m.home === away && m.away === home)).slice(-n).reverse();
  if (!games.length) return null;
  const forHome = (m: HistMatch) => (m.home === home ? m.hg - m.ag : m.ag - m.hg);
  return {
    home: games.filter((m) => forHome(m) > 0).length,
    draw: games.filter((m) => forHome(m) === 0).length,
    away: games.filter((m) => forHome(m) < 0).length,
    games: games.map((m) => ({ date: m.date, score: m.home === home ? `${m.hg}-${m.ag}` : `${m.ag}-${m.hg}` })),
  };
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
  insights: PickInsights;
  /** Plain-language strength of the pick, from its probability. */
  strength: "Meget stærk" | "Stærk" | "God" | "Middel";
  /** True when the league has no results history, so the pick rests on the bookmakers' prices alone. */
  marketOnly: boolean;
  /** Over 1,5 mål, over 2,5 mål and begge hold scorer for the same match, side by side. */
  goals?: GoalAlt[];
  /** On a "begge hold scorer" pick: another bet in the match at about the same odds that pays more on average. */
  instead?: GoalAlt;
  /** In how many of their last BTTS_FORM_GAMES matches each team scored, from the results data; null without it. */
  scoring?: BothScore | null;
}

/** Begge hold scorer is only suggested when both teams scored in every one of this many recent matches. */
export const BTTS_FORM_GAMES = 5;

export interface BothScore {
  home: number;
  away: number;
  /** Matches looked at per team (the smaller of the two when one has fewer). */
  n: number;
  /** Both teams scored in all of their last BTTS_FORM_GAMES matches. */
  every: boolean;
}

/** How often each team scored in its last matches, from the results history behind the model. */
export function bothScore(ctx: PickContext | null): BothScore | null {
  const t = ctx?.teams;
  if (!t) return null;
  const h = recentForm(t.home, t.history, BTTS_FORM_GAMES);
  const a = recentForm(t.away, t.history, BTTS_FORM_GAMES);
  const scored = (g: FormGame[]) => g.filter((x) => Number(x.score.split("-")[0]) > 0).length;
  const home = scored(h);
  const away = scored(a);
  return { home, away, n: Math.min(h.length, a.length), every: h.length >= BTTS_FORM_GAMES && a.length >= BTTS_FORM_GAMES && home === h.length && away === a.length };
}

/** One bet in a match, for comparing it with the others. */
export interface GoalAlt {
  outcome: string;
  probability: number;
  odds: number;
  /** What 1 kr returns on average at the best odds: chance × odds (estimated). */
  ret: number;
}

export function strengthOf(p: number): Pick["strength"] {
  return p >= 0.75 ? "Meget stærk" : p >= 0.65 ? "Stærk" : p >= 0.55 ? "God" : "Middel";
}

export function outcomeLabel(r: MarketRow): string {
  if (r.marketType === "OU15") return r.side === "over" ? "Over 1,5 mål" : "Under 1,5 mål";
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
  if (marketType !== "1X2" && marketType !== "OU15" && marketType !== "OU25" && marketType !== "BTTS") return null;
  let p = 0;
  for (let x = 0; x <= 10; x++)
    for (let y = 0; y <= 10; y++) {
      const hit =
        marketType === "1X2" ? (side === "home" ? x > y : side === "away" ? x < y : x === y)
        : marketType === "OU15" ? (side === "over") === x + y > 1.5
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

/** Both lineups are stored, from the match's team news or (without a model forecast) the event itself. */
function lineupsIn(row: MarketRow, ctx: PickContext | null): boolean {
  return (ctx?.news?.lineups.length ?? 0) >= 2 || row.dataQuality?.lineup === "Confirmed";
}

export function analysePick(row: MarketRow, ctx: PickContext | null): Omit<Pick, "fairOdds" | "value" | "outcome" | "strength"> | null {
  const model = row.modelProbability;
  if (model == null) {
    // No results history for this league (e.g. Superliga, Champions League): the margin-free market price is all there is.
    if (!(row.marketProbability > 0 && row.marketProbability < 1)) return null;
    const lineupsConfirmed = lineupsIn(row, ctx);
    const club = ctx?.clubElo ?? null;
    const af = ctx?.afPrediction ?? null;
    const insights: PickInsights = { expectedGoals: null, elo: null, clubElo: club, afPrediction: af, form: null, h2h: null, movement: row.movement, lineupsConfirmed };
    const market = row.marketProbability;
    if (af && row.marketType === "1X2") {
      // API-Football compares the teams on all their matches, across competitions: a minority share next to the market.
      const e = flooredPercent(af.percent)[row.side as "home" | "draw" | "away"];
      const p = clamp((1 - AF_PREDICTION_WEIGHT) * market + AF_PREDICTION_WEIGHT * e);
      const factors: PickFactor[] = [
        { label: "Bookmakerne", pp: null, detail: `${pct(market)} uden bookmakernes avance. Vi har ingen kampresultater for ligaen endnu.` },
        { label: "Holdstyrke (API-Football)", pp: (p - market) * 100, detail: `API-Football giver ${pct(e)} ud fra holdenes form, angreb, forsvar og indbyrdes opgør (skøn, ${AF_PREDICTION_MODEL}); vægtet ${Math.round(AF_PREDICTION_WEIGHT * 100)} %` },
      ];
      return { row, probability: p, lineupsConfirmed, factors, insights, marketOnly: true };
    }
    if (club && row.marketType === "1X2") {
      // Cross-league strength is the one model input we have here; it gets a minority share next to the market.
      const e = clubEloProbs(club.home.elo, club.away.elo)[row.side as "home" | "draw" | "away"];
      const p = clamp((1 - CLUBELO_WEIGHT) * market + CLUBELO_WEIGHT * e);
      const factors: PickFactor[] = [
        { label: "Bookmakerne", pp: null, detail: `${pct(market)} uden bookmakernes avance. Vi har ingen kampresultater for ligaen endnu.` },
        { label: "Holdstyrke (ClubElo)", pp: (p - market) * 100, detail: `${club.home.club} ${Math.round(club.home.elo)} mod ${club.away.club} ${Math.round(club.away.elo)} giver ${pct(e)} (skøn, ${CLUBELO_MODEL}); vægtet ${Math.round(CLUBELO_WEIGHT * 100)} %` },
      ];
      return { row, probability: p, lineupsConfirmed, factors, insights, marketOnly: true };
    }
    const factors: PickFactor[] = [{ label: "Bookmakerne", pp: null, detail: `${pct(market)} uden bookmakernes avance. Vi har ingen kampresultater for ligaen endnu, så procenten er kun markedets.` }];
    return { row, probability: market, lineupsConfirmed, factors, insights, marketOnly: true };
  }
  const factors: PickFactor[] = [{ label: "Resultatmodel", pp: null, detail: `${pct(model)} ud fra kampresultater og Elo` }];
  let p = model;
  const lineupsConfirmed = lineupsIn(row, ctx);

  if (ctx?.expectedGoals) {
    const base = ctx.expectedGoals;
    const news = ctx.news;
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
  const t = ctx?.teams;
  const insights: PickInsights = {
    expectedGoals: ctx?.expectedGoals ?? null,
    elo: t ? { home: Math.round(t.homeElo), away: Math.round(t.awayElo) } : null,
    clubElo: ctx?.clubElo ?? null,
    afPrediction: ctx?.afPrediction ?? null,
    form: t ? { home: recentForm(t.home, t.history), away: recentForm(t.away, t.history) } : null,
    h2h: t ? headToHead(t.home, t.away, t.history) : null,
    movement: row.movement,
    lineupsConfirmed,
  };
  return { row, probability: final, lineupsConfirmed, factors, insights, marketOnly: false };
}

/** Markets the daily list ranks. Double chance covers two outcomes, so it has its own tab rather than crowding out single outcomes. */
const PICK_MARKETS: ReadonlySet<string> = new Set(["1X2", "OU15", "OU25", "BTTS"]);
/**
 * Over/under 1,5 mål on the daily list only from these odds: over 1,5 is nearly always the likeliest outcome, at
 * around 1,20–1,30, and would otherwise fill the list. Its own tab shows every match.
 */
export const OU15_MIN_ODDS = 1.4;
/** Markets analysed for every match, to compare bets with each other. */
const COMPARE_MARKETS: ReadonlySet<string> = new Set(["1X2", "OU15", "OU25", "BTTS"]);
/** Odds count as "about the same" when the higher is at most this many times the lower. */
export const SIMILAR_ODDS = 1.25;

type Analysed = NonNullable<ReturnType<typeof analysePick>>;

const altOf = (a: Analysed): GoalAlt => ({ outcome: outcomeLabel(a.row), probability: a.probability, odds: a.row.bestOdds, ret: a.probability * a.row.bestOdds });
const isBttsYes = (a: Analysed) => a.row.marketType === "BTTS" && a.row.side === "yes";

/**
 * "Begge hold scorer" needs both teams to score, so a 3–0 loses it. When another bet in the match (a result, over 1,5
 * or over 2,5 mål) is priced about the same and pays more on average (chance × odds), that bet is the better buy.
 * Returns the best such bet, or null when begge hold scorer holds its own. Market-only leagues have no view of
 * our own to compare with, so they are left alone.
 */
export function bttsAlternative(list: Analysed[]): GoalAlt | null {
  const btts = list.find(isBttsYes);
  if (!btts || btts.marketOnly || !(btts.row.bestOdds > 1)) return null;
  const own = btts.probability * btts.row.bestOdds;
  let best: GoalAlt | null = null;
  for (const a of list) {
    if (a === btts || a.row.marketType === "BTTS" || !(a.row.bestOdds > 1)) continue;
    const ratio = Math.max(a.row.bestOdds, btts.row.bestOdds) / Math.min(a.row.bestOdds, btts.row.bestOdds);
    const alt = altOf(a);
    if (ratio <= SIMILAR_ODDS && alt.ret > own && (!best || alt.ret > best.ret)) best = alt;
  }
  return best;
}

/** Over 1,5 mål, over 2,5 mål and begge hold scorer for one match, when the feed prices them. */
function goalAlternatives(list: Analysed[]): GoalAlt[] {
  const want = [
    ["OU15", "over"],
    ["OU25", "over"],
    ["BTTS", "yes"],
  ];
  return want.flatMap(([m, s]) => list.filter((a) => a.row.marketType === m && a.row.side === s && a.row.bestOdds > 1).map(altOf));
}

export function dailyPicks(
  rows: MarketRow[],
  now: number,
  count: number,
  context: (eventId: string) => PickContext | null = () => null,
  markets: ReadonlySet<string> = PICK_MARKETS,
): Pick[] {
  const byEvent = new Map<string, Analysed[]>();
  for (const r of rows) {
    if (r.sportId !== "football" || r.status !== "scheduled" || r.kickoff <= now || r.kickoff > now + PICK_WINDOW_MS) continue;
    if (!markets.has(r.marketType) && !COMPARE_MARKETS.has(r.marketType)) continue;
    const a = analysePick(r, context(r.eventId));
    if (a) byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), a]);
  }
  // On the mixed list, begge hold scorer gives way to a bet at about the same odds that pays more; on its own tab it stays, with a hint.
  // Begge hold scorer also needs both teams to have scored in each of their last BTTS_FORM_GAMES matches.
  const mixed = markets.size > 1;
  const picks: Pick[] = [];
  for (const [eventId, list] of byEvent) {
    const scoring = bothScore(context(eventId));
    const instead = bttsAlternative(list);
    let best: Analysed | null = null;
    for (const a of list) {
      if (!markets.has(a.row.marketType) || (isBttsYes(a) && (!scoring?.every || (mixed && instead)))) continue;
      if (mixed && a.row.marketType === "OU15" && !(a.row.bestOdds >= OU15_MIN_ODDS)) continue;
      if (!best || a.probability > best.probability) best = a;
    }
    if (!best) continue;
    picks.push({
      ...best,
      outcome: outcomeLabel(best.row),
      fairOdds: 1 / best.probability,
      value: !best.marketOnly && best.row.bestOdds * best.probability > 1,
      strength: strengthOf(best.probability),
      goals: goalAlternatives(list),
      scoring,
      ...(isBttsYes(best) && instead ? { instead } : {}),
    });
  }
  return picks
    .sort((a, b) => Number(Boolean(a.instead)) - Number(Boolean(b.instead)) || b.probability - a.probability || a.row.kickoff - b.row.kickoff)
    .slice(0, count);
}

/** Markets the coupons draw from: who wins, over/under 1,5 and 2,5, begge hold scorer, and double chance (Mads, 2026-10-05). */
const COUPON_MARKETS: ReadonlySet<string> = new Set(["1X2", "OU15", "OU25", "BTTS"]);

const DC_SIDES = [
  { side: "1x", from: ["home", "draw"] },
  { side: "x2", from: ["draw", "away"] },
  { side: "12", from: ["home", "away"] },
] as const;

/**
 * Every bet the coupons may use, several per match: each outcome in COUPON_MARKETS plus double chance, whose
 * chance is the sum of our two 1X2 outcomes (normalised to 100 %). Begge hold scorer only with the
 * BTTS_FORM_GAMES rule, as on the list.
 */
export function couponCandidates(rows: MarketRow[], now: number, context: (eventId: string) => PickContext | null = () => null): Pick[] {
  const byEvent = new Map<string, MarketRow[]>();
  for (const r of rows) {
    if (r.sportId !== "football" || r.status !== "scheduled" || r.kickoff <= now || r.kickoff > now + PICK_WINDOW_MS) continue;
    if (!COUPON_MARKETS.has(r.marketType) && r.marketType !== "DC") continue;
    byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
  }
  const out: Pick[] = [];
  const asPick = (a: Analysed, outcome: string): Pick => ({
    ...a,
    outcome,
    fairOdds: 1 / a.probability,
    value: !a.marketOnly && a.row.bestOdds * a.probability > 1,
    strength: strengthOf(a.probability),
  });
  for (const [eventId, rs] of byEvent) {
    const ctx = context(eventId);
    const scoring = bothScore(ctx);
    const list = rs.filter((r) => COUPON_MARKETS.has(r.marketType)).flatMap((r) => analysePick(r, ctx) ?? []);
    for (const a of list) {
      if (!(a.row.bestOdds > 1) || (isBttsYes(a) && !scoring?.every)) continue;
      out.push({ ...asPick(a, outcomeLabel(a.row)), scoring });
    }
    const x = Object.fromEntries(list.filter((a) => a.row.marketType === "1X2").map((a) => [a.row.side, a]));
    if (!x.home || !x.draw || !x.away) continue;
    const total = x.home.probability + x.draw.probability + x.away.probability;
    const [home, away] = rs[0].match.split(" vs ");
    for (const dc of DC_SIDES) {
      const row = rs.find((r) => r.marketType === "DC" && r.side.toLowerCase() === dc.side && r.bestOdds > 1);
      if (!row) continue;
      const [a, b] = dc.from.map((k) => x[k]);
      const probability = clamp((a.probability + b.probability) / total);
      const outcome = dc.side === "1x" ? `${home} eller uafgjort` : dc.side === "x2" ? `${away} eller uafgjort` : `${home} eller ${away} (ikke uafgjort)`;
      const marketOnly = a.marketOnly || b.marketOnly;
      out.push(
        asPick(
          {
            row,
            probability,
            lineupsConfirmed: a.lineupsConfirmed,
            factors: [{ label: "Dobbeltchance", pp: null, detail: `${outcomeLabel(a.row)} ${pct(a.probability / total)} + ${outcomeLabel(b.row)} ${pct(b.probability / total)}` }],
            insights: a.insights,
            marketOnly,
          },
          outcome,
        ),
      );
    }
  }
  return out.sort((a, b) => b.probability - a.probability || a.row.kickoff - b.row.kickoff);
}

/** Football matches in the pick window that the model has analysed. */
export function analysedMatches(rows: MarketRow[], now: number) {
  const ev = rows.filter((r) => r.sportId === "football" && r.status === "scheduled" && r.kickoff > now && r.kickoff <= now + PICK_WINDOW_MS);
  return { matches: new Set(ev.map((r) => r.eventId)).size, leagues: new Set(ev.map((r) => r.league)).size };
}

export { signedPp };

// ---------------------------------------------------------------------------
// Bet types

export const GOAL_CATEGORIES = [
  { id: "vinder", label: "Hvem vinder", market: "1X2" },
  { id: "maal15", label: "Over/under 1,5 mål", market: "OU15" },
  { id: "maal", label: "Over/under 2,5 mål", market: "OU25" },
  { id: "btts", label: "Begge hold scorer", market: "BTTS" },
] as const;

export const COUNT_CATEGORIES: { id: string; label: string; stat: CountStat; unit: string }[] = [
  { id: "hjorne", label: "Hjørnespark", stat: "corners", unit: "hjørnespark" },
  { id: "kort", label: "Kort", stat: "cards", unit: "kort" },
  { id: "frispark", label: "Frispark", stat: "fouls", unit: "frispark" },
];

/** The best pick per match within one goal market. */
export function marketPicks(rows: MarketRow[], now: number, count: number, market: string, context: (eventId: string) => PickContext | null = () => null): Pick[] {
  return dailyPicks(rows, now, count, context, new Set([market]));
}

export interface CountPick {
  row: MarketRow;
  stat: CountStat;
  unit: string;
  outcome: string;
  probability: number;
  fairOdds: number;
  forecast: CountForecast;
  strength: Pick["strength"];
}

export const lineLabel = (line: number) => line.toFixed(1).replace(".", ",");

/** One suggestion per match for corners, cards or fouls. */
export function countPicks(rows: MarketRow[], now: number, count: number, stat: CountStat, context: (eventId: string) => PickContext | null): CountPick[] {
  const cat = COUNT_CATEGORIES.find((c) => c.stat === stat)!;
  const seen = new Map<string, CountPick>();
  for (const r of rows) {
    if (r.sportId !== "football" || r.status !== "scheduled" || r.kickoff <= now || r.kickoff > now + PICK_WINDOW_MS || seen.has(r.eventId)) continue;
    const f = context(r.eventId)?.counts?.[stat];
    if (!f) continue;
    const s = f.suggestion;
    seen.set(r.eventId, {
      row: r,
      stat,
      unit: cat.unit,
      outcome: `${s.side === "over" ? "Over" : "Under"} ${lineLabel(s.line)} ${cat.unit}`,
      probability: s.probability,
      fairOdds: 1 / s.probability,
      forecast: f,
      strength: strengthOf(s.probability),
    });
  }
  // Matches that differ most from a normal league match first: that is where the analysis says the most.
  return [...seen.values()].sort((a, b) => Math.abs(b.forecast.suggestion.vsLeague) - Math.abs(a.forecast.suggestion.vsLeague) || a.row.kickoff - b.row.kickoff).slice(0, count);
}
