// The weekly tipping game (/tips): friends tip 1, X or 2 on the week's matches,
// one point per correct tip. Weeks run Monday to Sunday in Danish time.
// Pure functions; reading and writing tips lives in src/lib/real/tips.ts.

export type Side = "home" | "draw" | "away";
export const SIDES: Side[] = ["home", "draw", "away"];
export const SIDE_LABEL: Record<Side, string> = { home: "1", draw: "X", away: "2" };
export const isSide = (v: unknown): v is Side => v === "home" || v === "draw" || v === "away";

const TZ = "Europe/Copenhagen";
const DAY = 86_400_000;

/** Minutes Copenhagen is ahead of UTC at this instant. */
function offsetAt(ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60_000) * 60_000) / 60_000;
}

/** Midnight in Copenhagen on this calendar date (month 1-12). */
function cphMidnight(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d);
  return guess - offsetAt(guess - 2 * 3_600_000) * 60_000;
}

export interface Week {
  /** ISO week, e.g. "2026-W40". */
  id: string;
  /** Week number, e.g. 40. */
  number: number;
  /** Monday 00:00 and next Monday 00:00 in Copenhagen, epoch ms. */
  start: number;
  end: number;
}

function isoWeekOfDate(y: number, m: number, d: number): { year: number; number: number } {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const year = date.getUTCFullYear();
  const number = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return { year, number };
}

/** The Monday-to-Sunday week (Copenhagen) holding this instant. */
export function weekOf(ms: number): Week {
  const [y, m, d] = new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  const monday = new Date(Date.UTC(y, m - 1, d - (dow - 1)));
  const next = new Date(monday.getTime() + 7 * DAY);
  const start = cphMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  const end = cphMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  const w = isoWeekOfDate(y, m, d);
  return { id: `${w.year}-W${String(w.number).padStart(2, "0")}`, number: w.number, start, end };
}

/** A week by its id, or null when the id is malformed. */
export function weekById(id: string): Week | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) return null;
  const year = Number(m[1]);
  const n = Number(m[2]);
  // Monday of ISO week 1 is the Monday on or before 4 January.
  const jan4 = Date.UTC(year, 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * DAY + (n - 1) * 7 * DAY;
  const w = weekOf(monday + 12 * 3_600_000);
  return w.id === id ? w : null;
}

export const previousWeek = (w: Week) => weekOf(w.start - 12 * 3_600_000);
export const nextWeek = (w: Week) => weekOf(w.end + 12 * 3_600_000);

/** The 1X2 market row fields the game needs (a subset of MarketRow). */
export interface TipRow {
  eventId: string;
  leagueId: string;
  marketType: string;
  side: string;
  match: string;
  league: string;
  kickoff: number;
  status: string;
  score?: { home: number; away: number };
  bestOdds: number;
  modelProbability: number | null;
}

export interface TipMatch {
  eventId: string;
  leagueId: string;
  kickoff: number;
  league: string;
  home: string;
  away: string;
  status: string;
  odds: Record<Side, number | null>;
  /** The model's probabilities, when it priced all three outcomes. */
  model: Record<Side, number> | null;
  /** The final result once the match is finished. */
  result: Side | null;
  score: [number, number] | null;
}

export const resultOf = (g: [number, number] | null | undefined): Side | null => (!g ? null : g[0] > g[1] ? "home" : g[0] < g[1] ? "away" : "draw");

/** The model's likeliest outcome. */
export function modelPick(model: Record<Side, number> | null): Side | null {
  if (!model) return null;
  return SIDES.reduce((best, s) => (model[s] > model[best] ? s : best), "home" as Side);
}

/** The week's football matches with a 1X2 market, by kickoff. */
export function weekMatches(rows: TipRow[], week: Pick<Week, "start" | "end">): TipMatch[] {
  const byEvent = new Map<string, TipMatch>();
  for (const r of rows) {
    if (r.marketType !== "1X2" || !isSide(r.side) || r.kickoff < week.start || r.kickoff >= week.end) continue;
    let m = byEvent.get(r.eventId);
    if (!m) {
      const [home, away] = r.match.split(" vs ");
      const score: [number, number] | null = r.status === "finished" && r.score ? [r.score.home, r.score.away] : null;
      m = { eventId: r.eventId, leagueId: r.leagueId, kickoff: r.kickoff, league: r.league, home, away: away ?? "", status: r.status, odds: { home: null, draw: null, away: null }, model: null, result: resultOf(score), score };
      byEvent.set(r.eventId, m);
    }
    m.odds[r.side] = r.bestOdds > 1 ? r.bestOdds : null;
    if (r.modelProbability !== null) m.model = { ...(m.model ?? { home: NaN, draw: NaN, away: NaN }), [r.side]: r.modelProbability };
  }
  return [...byEvent.values()]
    .map((m) => (m.model && SIDES.every((s) => Number.isFinite(m.model![s])) ? m : { ...m, model: null }))
    .sort((a, b) => a.kickoff - b.kickoff || a.home.localeCompare(b.home, "da"));
}

export interface Tip {
  userId: string;
  name: string;
  eventId: string;
  week: string;
  kickoff: number;
  home: string;
  away: string;
  pick: Side;
  /** Best odds for the tipped outcome when tipped. */
  odds: number | null;
  modelPick: Side | null;
  /** The match result; null until it is known. */
  result: Side | null;
}

export const MODEL_ID = "model";
export const MODEL_NAME = "Oddsanalyse-modellen";

/** The model as a player: its likeliest outcome on every match it priced. */
export function modelTips(matches: TipMatch[], week: string): Tip[] {
  return matches.flatMap((m) => {
    const pick = modelPick(m.model);
    return pick ? [{ userId: MODEL_ID, name: MODEL_NAME, eventId: m.eventId, week, kickoff: m.kickoff, home: m.home, away: m.away, pick, odds: m.odds[pick], modelPick: pick, result: m.result }] : [];
  });
}

export interface Standing {
  userId: string;
  name: string;
  tips: number;
  settled: number;
  correct: number;
  /** Sum of the odds of the correct tips: the tiebreak, so a bold correct tip counts for more. */
  bonus: number;
}

export function standings(tips: Tip[]): Standing[] {
  const rows = new Map<string, Standing>();
  for (const t of tips) {
    const r = rows.get(t.userId) ?? { userId: t.userId, name: t.name, tips: 0, settled: 0, correct: 0, bonus: 0 };
    r.tips++;
    if (t.result) {
      r.settled++;
      if (t.result === t.pick) {
        r.correct++;
        r.bonus += t.odds ?? 0;
      }
    }
    rows.set(t.userId, r);
  }
  return [...rows.values()].sort((a, b) => b.correct - a.correct || b.bonus - a.bonus || a.settled - b.settled || a.name.localeCompare(b.name, "da"));
}

export interface WeekWinner {
  week: string;
  /** Everyone sharing first place. */
  winners: Standing[];
}

/** The winner of each week with at least one settled tip, newest first. The model never wins. */
export function weekWinners(tips: Tip[]): WeekWinner[] {
  const byWeek = new Map<string, Tip[]>();
  for (const t of tips) if (t.userId !== MODEL_ID) byWeek.set(t.week, [...(byWeek.get(t.week) ?? []), t]);
  return [...byWeek.entries()]
    .map(([week, ts]) => {
      const table = standings(ts).filter((s) => s.settled > 0);
      const top = table[0];
      return { week, winners: top && top.correct > 0 ? table.filter((s) => s.correct === top.correct && Math.abs(s.bonus - top.bonus) < 1e-9) : [] };
    })
    .filter((w) => w.winners.length)
    .sort((a, b) => b.week.localeCompare(a.week));
}

export interface FunStat {
  id: string;
  title: string;
  name: string;
  detail: string;
}

const dec = (x: number) => x.toFixed(2).replace(".", ",");
const MIN_RATE_SAMPLE = 5;

/** Fun facts from settled tips (friends only). Each stat is left out until someone qualifies. */
export function funStats(tips: Tip[], winners: WeekWinner[] = []): FunStat[] {
  const settled = tips.filter((t) => t.result && t.userId !== MODEL_ID);
  const right = settled.filter((t) => t.result === t.pick);
  const out: FunStat[] = [];
  const top = <T>(xs: T[], score: (x: T) => number) => xs.reduce<T | null>((best, x) => (best === null || score(x) > score(best) ? x : best), null);
  const per = (f: (ts: Tip[]) => number) => {
    const by = new Map<string, Tip[]>();
    for (const t of settled) by.set(t.userId, [...(by.get(t.userId) ?? []), t]);
    return [...by.values()].map((ts) => ({ name: ts[0].name, ts, v: f(ts) }));
  };

  const bold = top(
    right.filter((t) => t.odds),
    (t) => t.odds!,
  );
  if (bold) out.push({ id: "modig", title: "Modigste tip", name: bold.name, detail: `${SIDE_LABEL[bold.pick]} til ${dec(bold.odds!)} i ${bold.home} – ${bold.away}` });

  const rate = top(
    per((ts) => ts.filter((t) => t.result === t.pick).length / ts.length).filter((p) => p.ts.length >= MIN_RATE_SAMPLE),
    (p) => p.v + p.ts.length * 1e-6,
  );
  if (rate) out.push({ id: "skarp", title: "Skarpeste øje", name: rate.name, detail: `${Math.round(rate.v * 100)} % rigtige af ${rate.ts.length} tips` });

  const streak = top(
    per((ts) => {
      let best = 0;
      let run = 0;
      for (const t of [...ts].sort((a, b) => a.kickoff - b.kickoff)) {
        run = t.result === t.pick ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    }).filter((p) => p.v >= 2),
    (p) => p.v,
  );
  if (streak) out.push({ id: "stime", title: "Længste stime", name: streak.name, detail: `${streak.v} rigtige i træk` });

  const draws = top(
    per((ts) => ts.filter((t) => t.pick === "draw" && t.result === "draw").length).filter((p) => p.v > 0),
    (p) => p.v,
  );
  if (draws) out.push({ id: "uafgjort", title: "Uafgjort-kongen", name: draws.name, detail: `${draws.v} rigtige X` });

  const beat = top(
    per((ts) => ts.filter((t) => t.result === t.pick && t.modelPick && t.modelPick !== t.pick).length).filter((p) => p.v > 0),
    (p) => p.v,
  );
  if (beat) out.push({ id: "model", title: "Slog modellen", name: beat.name, detail: `${beat.v} ${beat.v === 1 ? "gang" : "gange"} rigtigt, hvor modellen tog fejl` });

  const wins = new Map<string, { name: string; n: number }>();
  for (const w of winners) for (const s of w.winners) wins.set(s.userId, { name: s.name, n: (wins.get(s.userId)?.n ?? 0) + 1 });
  const champ = top([...wins.values()], (x) => x.n);
  if (champ) out.push({ id: "uger", title: "Flest ugesejre", name: champ.name, detail: `${champ.n} ${champ.n === 1 ? "uge" : "uger"}` });

  return out;
}

/** How many tipped each outcome on a match. */
export function tipCounts(tips: Tip[], eventId: string): Record<Side, number> {
  const c: Record<Side, number> = { home: 0, draw: 0, away: 0 };
  for (const t of tips) if (t.eventId === eventId && t.userId !== MODEL_ID) c[t.pick]++;
  return c;
}
