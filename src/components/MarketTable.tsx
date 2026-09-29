"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtCountdown, fmtOdds, fmtPct, fmtPp, fmtSignedPct } from "@/lib/format";

export interface TableRow {
  selectionId: string;
  sport: string;
  league: string;
  match: string;
  kickoff: number;
  status: "scheduled" | "live" | "finished";
  minute?: number;
  score?: { home: number; away: number };
  market: string;
  selection: string;
  bestOdds: number;
  bestBook: string;
  openingOdds: number;
  marketProbability: number;
  modelProbability: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  inPlayModel: boolean;
  edgePp: number | null;
  ev: number | null;
  movement: number;
  pressure: number;
  pressureLevel: string;
  confidence: number | null;
  dataQuality: number;
}

type SortKey = "edgePp" | "ev" | "movement" | "pressure" | "confidence" | "kickoff" | "bestOdds" | "marketProbability" | "modelProbability";

const columns: { key: SortKey | null; label: string; title?: string; align?: "right" }[] = [
  { key: null, label: "Sport / League" },
  { key: "kickoff", label: "Match" },
  { key: null, label: "Market" },
  { key: null, label: "Selection" },
  { key: "bestOdds", label: "Best", align: "right", title: "Best available decimal price across tracked bookmakers" },
  { key: null, label: "Open", align: "right", title: "Consensus (median) opening price" },
  { key: "marketProbability", label: "Mkt %", align: "right", title: "Margin-free consensus market probability" },
  { key: "modelProbability", label: "Model %", align: "right", title: "Latest ledgered ensemble probability (in-play model for live rows)" },
  { key: "edgePp", label: "Edge", align: "right", title: "Model minus market probability, percentage points" },
  { key: "ev", label: "EV", align: "right", title: "Model probability × best odds − 1" },
  { key: "movement", label: "Move", align: "right", title: "Consensus price change since opening" },
  { key: "pressure", label: "Press.", align: "right", title: "Estimated Market Pressure 0–100 (no volume data)" },
  { key: "confidence", label: "Conf.", align: "right", title: "Prediction confidence 0–100" },
];

function signedClass(x: number | null) {
  if (x == null || Math.abs(x) < 1e-9) return "text-ink-2";
  return x > 0 ? "text-good" : "text-critical";
}

export function MarketTable({ rows, now, initialQuery = "" }: { rows: TableRow[]; now: number; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [sport, setSport] = useState("all");
  const [market, setMarket] = useState("all");
  const [status, setStatus] = useState<"all" | "scheduled" | "live">("all");
  const [minEdge, setMinEdge] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "edgePp", dir: -1 });
  const [limit, setLimit] = useState(100);

  const sports = useMemo(() => [...new Set(rows.map((r) => r.sport))].sort(), [rows]);
  const markets = useMemo(() => [...new Set(rows.map((r) => r.market))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (sport === "all" || r.sport === sport) &&
        (market === "all" || r.market === market) &&
        (status === "all" || r.status === status) &&
        (minEdge === 0 || (r.edgePp ?? -Infinity) >= minEdge) &&
        (!needle || `${r.match} ${r.league} ${r.selection}`.toLowerCase().includes(needle)),
    );
    const val = (r: TableRow) => {
      const v = r[sort.key];
      // Missing values always sort last.
      return v == null ? Infinity * sort.dir : (v as number);
    };
    return out.sort((a, b) => (val(a) - val(b)) * sort.dir || 0);
  }, [rows, q, sport, market, status, minEdge, sort]);

  const select = "rounded border border-line bg-surface-2 px-2 py-1 text-xs text-ink-2 outline-none focus:border-accent";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team, league, selection" className={`${select} w-56`} aria-label="Search markets" />
        <select value={sport} onChange={(e) => setSport(e.target.value)} className={select} aria-label="Sport">
          <option value="all">All sports</option>
          {sports.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={market} onChange={(e) => setMarket(e.target.value)} className={select} aria-label="Market">
          <option value="all">All markets</option>
          {markets.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={select} aria-label="Status">
          <option value="all">Pre-match + live</option>
          <option value="scheduled">Pre-match</option>
          <option value="live">Live</option>
        </select>
        <select value={minEdge} onChange={(e) => setMinEdge(Number(e.target.value))} className={select} aria-label="Minimum edge">
          <option value={0}>Any edge</option>
          <option value={2}>Edge ≥ +2 pp</option>
          <option value={3}>Edge ≥ +3 pp</option>
          <option value={5}>Edge ≥ +5 pp</option>
        </select>
        <span className="ml-auto text-xs text-muted">
          <span className="num text-ink-2">{filtered.length}</span> markets
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
              {columns.map((c) => (
                <th key={c.label} title={c.title} className={`px-2.5 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.key ? (
                    <button
                      className={`uppercase tracking-wider hover:text-ink ${sort.key === c.key ? "text-ink" : ""}`}
                      onClick={() => setSort((s) => ({ key: c.key!, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : -1 }))}
                    >
                      {c.label}
                      {sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.selectionId} className="border-b border-line/60 hover:bg-surface-2 [&>td]:whitespace-nowrap">
                <td className="px-2.5 py-2 text-ink-2">
                  <div className="text-[11px] text-muted">{r.sport}</div>
                  <div>{r.league}</div>
                </td>
                <td className="max-w-[240px] px-2.5 py-2 whitespace-normal!">
                  <Link href={`/markets/${r.selectionId}`} className="hover:text-accent">
                    {r.match}
                  </Link>
                  <div className="text-[11px] text-muted">
                    {r.status === "live" ? (
                      <span className="text-critical">
                        ● LIVE {r.minute}′ <span className="num text-ink-2">{r.score?.home}–{r.score?.away}</span>
                      </span>
                    ) : (
                      <span suppressHydrationWarning>{fmtCountdown(r.kickoff - now)}</span>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-2 text-ink-2">{r.market}</td>
                <td className="px-2.5 py-2">{r.selection}</td>
                <td className="num px-2.5 py-2 text-right" title={r.bestBook}>
                  {fmtOdds(r.bestOdds)}
                </td>
                <td className="num px-2.5 py-2 text-right text-ink-2">{fmtOdds(r.openingOdds)}</td>
                <td className="num px-2.5 py-2 text-right">{fmtPct(r.marketProbability)}</td>
                <td className="num px-2.5 py-2 text-right">
                  {r.modelProbability == null ? (
                    <span className="text-muted" title="The model has not published a prediction for this market yet">pending</span>
                  ) : (
                    <span title={r.ciLow != null ? `Uncertainty range ${fmtPct(r.ciLow, 0)}–${fmtPct(r.ciHigh, 0)}` : undefined}>
                      {fmtPct(r.modelProbability)}
                      {r.inPlayModel && <span className="ml-1 text-[9px] text-muted">IP</span>}
                    </span>
                  )}
                </td>
                <td className={`num px-2.5 py-2 text-right ${signedClass(r.edgePp)}`}>{fmtPp(r.edgePp)}</td>
                <td className={`num px-2.5 py-2 text-right ${signedClass(r.ev)}`}>{fmtSignedPct(r.ev)}</td>
                <td className="num px-2.5 py-2 text-right text-ink-2">
                  {r.movement < 0 ? "▼" : r.movement > 0 ? "▲" : ""} {fmtSignedPct(r.movement)}
                </td>
                <td className="num px-2.5 py-2 text-right">
                  <span className={r.pressureLevel === "HIGH" ? "text-serious" : r.pressureLevel === "ELEVATED" ? "text-warning" : "text-ink-2"} title={`${r.pressureLevel} (estimated)`}>
                    {r.pressure}
                  </span>
                </td>
                <td className="num px-2.5 py-2 text-right text-ink-2">{r.confidence ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="border-t border-line px-4 py-2 text-center">
          <button onClick={() => setLimit((l) => l + 100)} className="text-xs text-accent hover:underline">
            Show more ({filtered.length - limit} remaining)
          </button>
        </div>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        ▲ price lengthening · ▼ price shortening. IP = in-play model estimate (not ledgered). Pressure is estimated from price behaviour; no betting-volume data is used.
      </p>
    </div>
  );
}
