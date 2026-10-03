// Men's international results from martj42/international_results (CC0 1.0,
// public domain): every senior international since 1872, updated after each
// match window. Used to train the same Dixon-Coles + Elo model the leagues use,
// with all national teams treated as one "league" (code "intl").

import type { HistMatch } from "./openfootball";

export const INTL_CODE = "intl";
export const INTL_SOURCE = "martj42/international_results (CC0)";
const URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";

/** CSV columns: date,home_team,away_team,home_score,away_score,tournament,city,country,neutral. Rows before `since` are dropped. */
export function parseInternationalCsv(csv: string, since: number): HistMatch[] {
  const out: HistMatch[] = [];
  for (const line of csv.split("\n").slice(1)) {
    const f = line.trim().split(",");
    if (f.length < 9) continue;
    const date = Date.parse(`${f[0]}T12:00:00Z`);
    const hg = Number(f[3]);
    const ag = Number(f[4]);
    // Unplayed fixtures carry "NA" scores.
    if (!(date >= since) || !Number.isInteger(hg) || !Number.isInteger(ag) || f[3] === "" || f[4] === "") continue;
    out.push({ league: INTL_CODE, season: f[0].slice(0, 4), date, home: f[1], away: f[2], hg, ag });
  }
  return out;
}

export async function fetchInternational(since: number, fetchImpl: typeof fetch = fetch): Promise<HistMatch[]> {
  const res = await fetchImpl(URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`international_results returned ${res.status}`);
  return parseInternationalCsv(await res.text(), since);
}
