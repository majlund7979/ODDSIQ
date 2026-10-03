// The friends' league: each friend saves the bets they play, and the table
// ranks everyone by profit, then by hit rate. Pure functions; reading and
// writing the bets lives in src/lib/real/friend-bets.ts.

export interface FriendBet {
  id: string;
  userId: string;
  name: string;
  kickoff: number;
  league: string;
  match: string;
  category: string;
  outcome: string;
  /** The probability we showed when the bet was saved. */
  probability: number;
  /** The odds the friend got; null when they did not enter any. */
  odds: number | null;
  /** Stake in kroner. */
  stake: number;
  result: "won" | "lost" | null;
}

export interface LeagueRow {
  userId: string;
  name: string;
  bets: number;
  settled: number;
  won: number;
  /** Profit in kroner over settled bets with odds. */
  profit: number;
  /** Total staked on settled bets with odds. */
  staked: number;
  /** Profit as a share of the stake. */
  roi: number;
}

export const betProfit = (b: Pick<FriendBet, "result" | "odds" | "stake">) => (!b.result || !b.odds ? 0 : b.result === "won" ? b.stake * (b.odds - 1) : -b.stake);

export function leagueTable(bets: FriendBet[]): LeagueRow[] {
  const rows = new Map<string, LeagueRow>();
  for (const b of bets) {
    const r = rows.get(b.userId) ?? { userId: b.userId, name: b.name, bets: 0, settled: 0, won: 0, profit: 0, staked: 0, roi: NaN };
    r.bets++;
    if (b.result) {
      r.settled++;
      if (b.result === "won") r.won++;
      if (b.odds) {
        r.profit += betProfit(b);
        r.staked += b.stake;
      }
    }
    rows.set(b.userId, r);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, roi: r.staked ? r.profit / r.staked : NaN }))
    .sort((a, b) => b.profit - a.profit || hitRate(b) - hitRate(a) || b.settled - a.settled || a.name.localeCompare(b.name, "da"));
}

export const hitRate = (r: Pick<LeagueRow, "won" | "settled">) => (r.settled ? r.won / r.settled : -1);

/** Name shown in the league: the chosen name, else the part of the e-mail before the @. */
export function displayName(name: string | null | undefined, email: string): string {
  const n = name?.trim();
  return n ? n.slice(0, 30) : email.split("@")[0];
}

/** Parses a kroner or odds field typed with either a comma or a dot. */
export function parseNumber(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const MAX_STAKE = 100_000;
export const LEAGUE_PERIODS = [
  { id: "maaned", label: "Denne måned" },
  { id: "alt", label: "Hele tiden" },
] as const;

/** Start of the current month in Copenhagen time, as epoch ms. */
export function monthStart(now: number): number {
  const [y, m] = new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/Copenhagen" }).split("-").map(Number);
  // Midnight Copenhagen is 22:00 or 23:00 UTC the day before; a two-hour margin is fine for a monthly table.
  return Date.UTC(y, m - 1, 1) - 2 * 3_600_000;
}
