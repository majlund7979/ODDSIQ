"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ScannerRow } from "@/lib/demo/views";
import { fmtCountdown, fmtInt, fmtOdds, fmtPct, fmtPp, fmtSignedPct } from "@/lib/format";

type Characteristic = "edge" | "clv" | "consensus" | "movement" | "confidence" | "disagreement" | "quality";

const CHARACTERISTICS: { id: Characteristic; label: string; hint: string; score: (r: ScannerRow) => number }[] = [
  { id: "edge", label: "Largest model edge", hint: "Model minus market probability, largest positive first", score: (r) => r.edgePp },
  { id: "clv", label: "Largest positive CLV history", hint: "Historical average CLV of ledgered predictions in the same league and market", score: (r) => r.clvHistory ?? -Infinity },
  { id: "consensus", label: "Strongest model consensus", hint: "Smallest spread between the four component models", score: (r) => -r.modelStdevPp },
  { id: "movement", label: "Largest market movement", hint: "Largest consensus price change since opening, either direction", score: (r) => Math.abs(r.movement) },
  { id: "confidence", label: "Highest confidence", hint: "Prediction confidence 0–100", score: (r) => r.confidence },
  { id: "disagreement", label: "Largest disagreement", hint: "Largest model-market difference in either direction", score: (r) => Math.abs(r.edgePp) },
  { id: "quality", label: "Highest data quality", hint: "Data quality score 0–100", score: (r) => r.dataQuality },
];

interface Filters {
  sport: string;
  league: string;
  market: string;
  book: string;
  minEv: number | null;
  minEdge: number | null;
  minConfidence: number | null;
  minOdds: string;
  maxOdds: string;
  kickoffHours: number | null;
  movement: "any" | "shortening" | "drifting" | "SHARP" | "RLM";
  agreement: "any" | "LOW" | "MODERATE";
  clv: "any" | "positive" | "known";
}

const EMPTY: Filters = { sport: "all", league: "all", market: "all", book: "all", minEv: null, minEdge: null, minConfidence: null, minOdds: "", maxOdds: "", kickoffHours: null, movement: "any", agreement: "any", clv: "any" };
const EXAMPLE: Filters = { ...EMPTY, minEv: 0.05, minEdge: 3, minConfidence: 65, minOdds: "1.50", maxOdds: "4.00" };

const MIN_CLV_N = 200;

export function ValueScanner({ rows, now, books }: { rows: ScannerRow[]; now: number; books: { id: string; name: string }[] }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [by, setBy] = useState<Characteristic>("edge");
  const [limit, setLimit] = useState(50);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((prev) => ({ ...prev, [k]: v, ...(k === "sport" ? { league: "all" } : {}) }));
    setLimit(50);
  };

  const sports = useMemo(() => [...new Map(rows.map((r) => [r.sportId, r.sport])).entries()], [rows]);
  const leagues = useMemo(() => [...new Map(rows.filter((r) => f.sport === "all" || r.sportId === f.sport).map((r) => [r.leagueId, r.league])).entries()], [rows, f.sport]);
  const markets = useMemo(() => [...new Set(rows.map((r) => r.market))].sort(), [rows]);

  const result = useMemo(() => {
    const lo = parseFloat(f.minOdds);
    const hi = parseFloat(f.maxOdds);
    const c = CHARACTERISTICS.find((x) => x.id === by)!;
    return rows
      .filter(
        (r) =>
          (f.sport === "all" || r.sportId === f.sport) &&
          (f.league === "all" || r.leagueId === f.league) &&
          (f.market === "all" || r.market === f.market) &&
          (f.book === "all" || r.bestBookId === f.book) &&
          (f.minEv === null || r.ev >= f.minEv) &&
          (f.minEdge === null || r.edgePp >= f.minEdge) &&
          (f.minConfidence === null || r.confidence >= f.minConfidence) &&
          (Number.isNaN(lo) || r.bestOdds >= lo) &&
          (Number.isNaN(hi) || r.bestOdds <= hi) &&
          (f.kickoffHours === null || r.kickoff - now <= f.kickoffHours * 3_600_000) &&
          (f.movement === "any" ||
            (f.movement === "shortening" && r.movement <= -0.03) ||
            (f.movement === "drifting" && r.movement >= 0.03) ||
            ((f.movement === "SHARP" || f.movement === "RLM") && r.signals.includes(f.movement))) &&
          (f.agreement === "any" || r.modelDisagreement === "LOW" || (f.agreement === "MODERATE" && r.modelDisagreement === "MODERATE")) &&
          (f.clv === "any" || (r.clvHistory !== null && r.clvHistoryN >= MIN_CLV_N && (f.clv === "known" || r.clvHistory > 0))),
      )
      .sort((a, b) => c.score(b) - c.score(a));
  }, [rows, f, by, now]);

  const sel = "rounded border border-line bg-surface-2 px-2 py-1 text-xs text-ink-2 outline-none focus:border-accent";
  const num = (v: string) => (v === "" ? null : Number(v));
  const label = "flex flex-col gap-1 text-[10.5px] uppercase tracking-wider text-muted";
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-surface">
        <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4 xl:grid-cols-7">
          <label className={label}>
            Sport
            <select className={sel} value={f.sport} onChange={(e) => set("sport", e.target.value)}>
              <option value="all">All</option>
              {sports.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            League
            <select className={sel} value={f.league} onChange={(e) => set("league", e.target.value)}>
              <option value="all">All</option>
              {leagues.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Market
            <select className={sel} value={f.market} onChange={(e) => set("market", e.target.value)}>
              <option value="all">All</option>
              {markets.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Min EV
            <select className={sel} value={f.minEv ?? ""} onChange={(e) => set("minEv", num(e.target.value))}>
              <option value="">Any</option>
              {[0, 0.02, 0.03, 0.05, 0.08, 0.1].map((v) => (
                <option key={v} value={v}>
                  {fmtPct(v, 0)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Min edge
            <select className={sel} value={f.minEdge ?? ""} onChange={(e) => set("minEdge", num(e.target.value))}>
              <option value="">Any</option>
              {[0, 1, 2, 3, 5].map((v) => (
                <option key={v} value={v}>
                  +{v} pp
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Min confidence
            <select className={sel} value={f.minConfidence ?? ""} onChange={(e) => set("minConfidence", num(e.target.value))}>
              <option value="">Any</option>
              {[50, 60, 65, 70, 75, 80].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Odds range
            <span className="flex items-center gap-1">
              <input className={`${sel} w-full`} inputMode="decimal" placeholder="min" value={f.minOdds} onChange={(e) => set("minOdds", e.target.value)} aria-label="Minimum odds" />
              <span className="text-muted">–</span>
              <input className={`${sel} w-full`} inputMode="decimal" placeholder="max" value={f.maxOdds} onChange={(e) => set("maxOdds", e.target.value)} aria-label="Maximum odds" />
            </span>
          </label>
          <label className={label}>
            Kickoff
            <select className={sel} value={f.kickoffHours ?? ""} onChange={(e) => set("kickoffHours", num(e.target.value))}>
              <option value="">Any time</option>
              <option value={6}>Next 6 hours</option>
              <option value={24}>Next 24 hours</option>
              <option value={72}>Next 3 days</option>
            </select>
          </label>
          <label className={label}>
            Bookmaker (best price)
            <select className={sel} value={f.book} onChange={(e) => set("book", e.target.value)}>
              <option value="all">All</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Market movement
            <select className={sel} value={f.movement} onChange={(e) => set("movement", e.target.value as Filters["movement"])}>
              <option value="any">Any</option>
              <option value="shortening">Shortening ≥ 3%</option>
              <option value="drifting">Drifting ≥ 3%</option>
              <option value="SHARP">Sharp movement</option>
              <option value="RLM">Reverse line movement</option>
            </select>
          </label>
          <label className={label}>
            Model agreement
            <select className={sel} value={f.agreement} onChange={(e) => set("agreement", e.target.value as Filters["agreement"])}>
              <option value="any">Any</option>
              <option value="LOW">Low disagreement only</option>
              <option value="MODERATE">Low or moderate</option>
            </select>
          </label>
          <label className={label}>
            CLV history
            <select className={sel} value={f.clv} onChange={(e) => set("clv", e.target.value as Filters["clv"])}>
              <option value="any">Any</option>
              <option value="known">n ≥ {MIN_CLV_N} in segment</option>
              <option value="positive">Positive, n ≥ {MIN_CLV_N}</option>
            </select>
          </label>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-4 xl:col-span-2">
            <button type="button" className="rounded border border-line px-2 py-1 text-xs text-ink-2 hover:border-line-strong hover:text-ink" onClick={() => setF(EXAMPLE)}>
              Example: EV 5%, edge 3 pp, conf. 65, odds 1.50–4.00
            </button>
            {active && (
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setF(EMPTY)}>
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <nav aria-label="Rank by characteristic" className="flex flex-wrap gap-1">
            {CHARACTERISTICS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.hint}
                aria-pressed={by === c.id}
                onClick={() => setBy(c.id)}
                className={`rounded px-2 py-1 text-xs ${by === c.id ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
              >
                {c.label}
              </button>
            ))}
          </nav>
          <span className="text-sm">
            <span className="num text-ink">{fmtInt(result.length)}</span> <span className="text-muted">of {fmtInt(rows.length)} markets</span>
          </span>
        </div>
      </section>

      <section className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[1150px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 text-left font-medium">Match</th>
              <th className="px-2.5 py-2 text-left font-medium">Selection</th>
              <th className="px-2.5 py-2 text-right font-medium">Best</th>
              <th className="px-2.5 py-2 text-right font-medium">Mkt %</th>
              <th className="px-2.5 py-2 text-right font-medium">Model % (range)</th>
              <th className="px-2.5 py-2 text-right font-medium">Edge</th>
              <th className="px-2.5 py-2 text-right font-medium">EV</th>
              <th className="px-2.5 py-2 text-right font-medium">Conf.</th>
              <th className="px-2.5 py-2 text-right font-medium">Move</th>
              <th className="px-2.5 py-2 text-right font-medium" title="Spread of the four component models">Model spread</th>
              <th className="px-2.5 py-2 text-right font-medium">DQ</th>
              <th className="px-4 py-2 text-right font-medium" title="Historical average CLV in the same league and market">Segment CLV</th>
            </tr>
          </thead>
          <tbody>
            {result.slice(0, limit).map((r) => (
              <tr key={r.selectionId} className="border-b border-line/60 hover:bg-surface-2 [&>td]:whitespace-nowrap">
                <td className="max-w-[260px] px-4 py-2 whitespace-normal!">
                  <Link href={`/markets/${r.selectionId}`} className="hover:text-accent">
                    {r.match}
                  </Link>
                  <div className="text-[11px] text-muted">
                    {r.league} · <span suppressHydrationWarning>{fmtCountdown(r.kickoff - now)}</span>
                  </div>
                </td>
                <td className="px-2.5 py-2">
                  {r.selection} <span className="text-muted">· {r.market}</span>
                  {r.signals.map((s) => (
                    <span key={s} className="ml-1.5 rounded border border-warning/50 px-1 text-[9.5px] font-semibold text-warning" title={s === "SHARP" ? "Sharp movement" : "Reverse line movement"}>
                      {s === "SHARP" ? "⚡ SHARP" : "⇄ RLM"}
                    </span>
                  ))}
                </td>
                <td className="num px-2.5 py-2 text-right" title={r.bestBook}>
                  {fmtOdds(r.bestOdds)}
                  <div className="text-[10.5px] text-muted">{r.bestBook}</div>
                </td>
                <td className="num px-2.5 py-2 text-right">{fmtPct(r.marketProbability)}</td>
                <td className="num px-2.5 py-2 text-right">
                  {fmtPct(r.modelProbability)}
                  <div className="text-[10.5px] text-muted">
                    {fmtPct(r.ciLow, 0)}–{fmtPct(r.ciHigh, 0)}
                  </div>
                </td>
                <td className={`num px-2.5 py-2 text-right ${r.edgePp > 0 ? "text-good" : r.edgePp < 0 ? "text-critical" : ""}`}>{fmtPp(r.edgePp)}</td>
                <td className={`num px-2.5 py-2 text-right ${r.ev > 0 ? "text-good" : r.ev < 0 ? "text-critical" : ""}`}>{fmtSignedPct(r.ev)}</td>
                <td className="num px-2.5 py-2 text-right text-ink-2">{r.confidence}</td>
                <td className="num px-2.5 py-2 text-right text-ink-2">{fmtSignedPct(r.movement)}</td>
                <td className="num px-2.5 py-2 text-right text-ink-2">
                  {r.modelStdevPp.toFixed(1)} pp
                  <div className="text-[10.5px] text-muted">{r.modelDisagreement}</div>
                </td>
                <td className="num px-2.5 py-2 text-right text-ink-2">{r.dataQuality}</td>
                <td className="num px-4 py-2 text-right">
                  {r.clvHistory === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <>
                      <span className={r.clvHistoryN < MIN_CLV_N ? "text-muted" : r.clvHistory > 0 ? "text-good" : "text-critical"}>{fmtSignedPct(r.clvHistory)}</span>
                      <div className="text-[10.5px] text-muted">n {fmtInt(r.clvHistoryN)}</div>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {result.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-muted">
                  No markets match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {result.length > limit && (
          <div className="border-t border-line px-4 py-2 text-center">
            <button type="button" onClick={() => setLimit((l) => l + 50)} className="text-xs text-accent hover:underline">
              Show more ({fmtInt(result.length - limit)} remaining)
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
