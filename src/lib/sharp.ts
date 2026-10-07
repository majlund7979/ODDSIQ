// "Dagens bedste bets" as a price comparison (Mads, 2026-10-07: "vores algoritme skal slå bookmakerne og forslå gode
// bets til hjemmesiden"). The backtest in trin 11 (/mnt/project-files/prediction-engine/trin-11-slaa-bookmakerne.md:
// 77,932 matches, six strategy families) found no rule that beats the bookmakers at bet365 or bwin, and our own model
// added nothing beyond Pinnacle's price. The closest rule is this one: Pinnacle's 1X2 price without its margin is the
// fair price, and a bet is shown where bet365 or bwin pays at least 1 % more. It is shown as an experiment.

import type { MarketRow } from "@/lib/demo/store";
import { metric, type Metric } from "@/lib/metrics/metric";

/** Bookmaker keys without the feed prefix, in order of preference. */
export interface SharpBooks {
  /** Books whose price without margin is the fair price. */
  reference: string[];
  /** Books a bet may be placed at. */
  price: string[];
}

/**
 * Pinnacle, else the Betfair exchange (The Odds API's "betfair_ex_eu"; API-Football's "betfair" is left out because it
 * may be the sportsbook). Bets only at bet365 and bwin, the two books in the backtest believed to hold Danish licences.
 */
export const LIVE_SHARP_BOOKS: SharpBooks = { reference: ["pinnacle", "betfair_ex_eu"], price: ["bet365", "bwin"] };

export const SHARP_VERSION = "pinnacle-pris-v1";
/** The bet's price must beat the fair price by this much (0.01 = 1 %). */
export const SHARP_MIN_EV = 0.01;
export const SHARP_MIN_ODDS = 1.25;
export const SHARP_MAX_ODDS = 5;
/** The fair price and the bet's price must be observed this close together, i.e. in the same data run. */
export const SHARP_MAX_GAP_MS = 10 * 60_000;
/**
 * Prices older than this are not used. The backtest assumed prices at most 15 minutes old, but the site fetches odds
 * every 5–6 hours, so this matches that cadence; the page and the mail show when the price was fetched and the lowest
 * odds still worth taking, so the reader checks the bookmaker's current price first.
 */
export const SHARP_MAX_AGE_MS = 6 * 3_600_000;
/** A reference with more margin than this is not a sharp price; an exchange's back prices carry almost none. */
const REFERENCE_MAX_MARGIN: Record<string, number> = { pinnacle: 0.15, betfair_ex_eu: 0.05 };
const DEFAULT_MAX_MARGIN = 0.15;
/** The Odds API lists the exchange as plain "Betfair", the same name as Betfair's sportsbook. */
const REFERENCE_NAMES: Record<string, string> = { betfair_ex_eu: "Betfair Exchange" };
/** A price this many times the bookmakers' median for the selection is taken as a data error. */
const OUTLIER = 1.5;
const SIDES = ["home", "draw", "away"] as const;

const ROI_DEFINITION = "Afkast pr. indsat krone med fast indsats, ét bet pr. kamp, i testsæsonerne 2019/20–2025/26";

/** The rule's backtest (trin 11): football-data.co.uk's Friday/Tuesday prices, test seasons 2019/20–2025/26. */
export const SHARP_BACKTEST: Metric<{ roi: number; roiLow: number; roiHigh: number; clv: number; clvLow: number; clvHigh: number }> = metric(
  { roi: 0.0221, roiLow: -0.0265, roiHigh: 0.0729, clv: 0.0107, clvLow: 0.0078, clvHigh: 0.0136 },
  {
    n: 2428,
    periodFrom: Date.UTC(2019, 6, 27),
    periodTo: Date.UTC(2026, 0, 13),
    modelVersion: SHARP_VERSION,
    source: "football-data.co.uk, 16 europæiske ligaer",
    definition: `${ROI_DEFINITION}; 90 %-interval; CLV mod Pinnacles lukkepris uden margin. Grænsen på 1 % blev valgt efter testen.`,
    basis: "historical",
  },
);

/** The same backtest from 15 January 2025, where the rule no longer beat the closing price. */
export const SHARP_RECENT: Metric<{ clv: number; clvLow: number; clvHigh: number }> = metric(
  { clv: -0.0069, clvLow: -0.017, clvHigh: 0.0026 },
  {
    n: 190,
    periodFrom: Date.UTC(2025, 0, 17),
    periodTo: Date.UTC(2026, 0, 13),
    modelVersion: SHARP_VERSION,
    source: "football-data.co.uk, 16 europæiske ligaer",
    definition: "CLV mod Pinnacles lukkepris uden margin; 90 %-interval",
    basis: "historical",
  },
);

/** Probabilities without margin by the power method: p_i = (1/o_i)^k, with k chosen so that they add up to 1. */
export function powerDevig(odds: number[]): number[] {
  const inv = odds.map((o) => 1 / o);
  let lo = 0.5;
  let hi = 5;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    if (inv.reduce((s, x) => s + x ** k, 0) < 1) hi = k;
    else lo = k;
  }
  const k = (lo + hi) / 2;
  return inv.map((x) => x ** k);
}

/** "apf-bet365" → "bet365"; demo ids have no feed prefix. */
export const bookKey = (bookId: string) => bookId.replace(/^(toa|apf)-/, "");

interface Triple {
  bookId: string;
  book: string;
  odds: number[];
  at: number;
}

/** Each book quoting all three outcomes, with all three prices from one data run. */
function triples(rows: MarketRow[]): Triple[] {
  const byBook = new Map<string, { book: string; odds: number[]; at: number[] }>();
  rows.forEach((r, i) => {
    for (const q of r.quotes ?? []) {
      if (!byBook.has(q.bookId)) byBook.set(q.bookId, { book: q.book, odds: [NaN, NaN, NaN], at: [NaN, NaN, NaN] });
      const b = byBook.get(q.bookId)!;
      b.odds[i] = q.odds;
      b.at[i] = q.at;
    }
  });
  return [...byBook]
    .filter(([, b]) => b.odds.every((o) => o > 1) && Math.max(...b.at) - Math.min(...b.at) <= SHARP_MAX_GAP_MS)
    .map(([bookId, b]) => ({ bookId, book: b.book, odds: b.odds, at: Math.min(...b.at) }));
}

const overround = (odds: number[]) => odds.reduce((s, o) => s + 1 / o, 0);

export interface SharpBet {
  row: MarketRow;
  /** Probability from the reference price without its margin. */
  fair: number;
  price: number;
  book: string;
  bookId: string;
  /** fair × price − 1. */
  ev: number;
  /** The lowest odds at which the bet still clears SHARP_MIN_EV. */
  minOdds: number;
  /** The reference bookmaker's name, e.g. "Pinnacle" or "Betfair Exchange". */
  reference: string;
  /** When the bet's price was observed. */
  at: number;
}

/**
 * For each match with a 1X2 price from a reference book and from a price book in the same data run, at most
 * SHARP_MAX_AGE_MS old: the outcome where the price book pays most over the fair price, if that is at least SHARP_MIN_EV,
 * with odds from SHARP_MIN_ODDS to SHARP_MAX_ODDS. Ties go to the earlier price book, then home, draw, away. Pure;
 * sorted by EV, highest first.
 */
export function sharpBets(rows: MarketRow[], books: SharpBooks, now: number): SharpBet[] {
  const byEvent = new Map<string, MarketRow[]>();
  for (const r of rows) if (r.marketType === "1X2") byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
  const out: SharpBet[] = [];
  for (const list of byEvent.values()) {
    const sides = SIDES.map((s) => list.find((r) => r.side === s));
    if (sides.some((r) => !r)) continue;
    const rs = sides as MarketRow[];
    // A price far above the bookmakers' median is taken as a data error, in the reference as in the bet's price.
    const sane = (t: Triple) => t.odds.every((o, i) => o <= OUTLIER * rs[i].currentOdds);
    const all = triples(rs).filter((t) => now - t.at <= SHARP_MAX_AGE_MS && sane(t));
    const refs = all.filter((t) => {
      const key = bookKey(t.bookId);
      const o = overround(t.odds);
      return books.reference.includes(key) && o >= 1 && o <= 1 + (REFERENCE_MAX_MARGIN[key] ?? DEFAULT_MAX_MARGIN);
    });
    let best: SharpBet | null = null;
    for (const key of books.price) {
      for (const t of all.filter((x) => bookKey(x.bookId) === key && overround(x.odds) >= 1)) {
        const ref = books.reference
          .map((k) => refs.filter((r) => bookKey(r.bookId) === k && Math.abs(r.at - t.at) <= SHARP_MAX_GAP_MS).sort((a, b) => Math.abs(a.at - t.at) - Math.abs(b.at - t.at))[0])
          .find(Boolean);
        if (!ref) continue;
        const fair = powerDevig(ref.odds);
        for (let i = 0; i < rs.length; i++) {
          const price = t.odds[i];
          if (price < SHARP_MIN_ODDS || price > SHARP_MAX_ODDS) continue;
          const ev = fair[i] * price - 1;
          if (ev < SHARP_MIN_EV || (best && ev <= best.ev)) continue;
          const minOdds = Math.max(SHARP_MIN_ODDS, (1 + SHARP_MIN_EV) / fair[i]);
          best = { row: rs[i], fair: fair[i], price, book: t.book, bookId: t.bookId, ev, minOdds, reference: REFERENCE_NAMES[bookKey(ref.bookId)] ?? ref.book, at: t.at };
        }
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.ev - a.ev || a.row.kickoff - b.row.kickoff);
}
