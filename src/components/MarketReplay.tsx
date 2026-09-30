"use client";

import { useEffect, useState } from "react";
import type { ReplayData } from "@/lib/demo/store";
import { fmtOdds, fmtPct, fmtShortDateTime, fmtSignedPct } from "@/lib/format";

const EVENT_MARK: Record<string, string> = { news: "✚", lineup: "▣", prediction: "◆", kickoff: "▸", goal: "⚽", red: "■", yellow: "▪", substitution: "⇄", var: "▣" };
const SPEEDS = [1, 4, 12];

export function MarketReplay({ data, live = false }: { data: ReplayData; live?: boolean }) {
  const label = live ? "live odds feed" : "DEMO DATA";
  const { view, frames, kickoffIndex } = data;
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i >= last) {
          setPlaying(false);
          return i;
        }
        return Math.min(last, i + speed);
      });
    }, 150);
    return () => clearInterval(id);
  }, [playing, speed, last]);

  const f = frames[idx];
  const openAt = frames[0].at;
  const ko = frames[kickoffIndex].at;
  const end = frames[last].at;
  const hasLive = last > kickoffIndex;

  // Chart geometry: pre-match on the left 60% (or all of it), in play on the right.
  const W = 900;
  const H = 220;
  const pad = { l: 44, r: 12, t: 20, b: 24 };
  const split = hasLive ? pad.l + (W - pad.l - pad.r) * 0.6 : W - pad.r;
  const x = (at: number) => (at <= ko ? pad.l + ((at - openAt) / (ko - openAt || 1)) * (split - pad.l) : split + ((at - ko) / (end - ko || 1)) * (W - pad.r - split));
  const all = frames.flatMap((fr) => [fr.market[sel], fr.model[sel] ?? NaN]).filter(Number.isFinite);
  const lo = Math.max(0, Math.min(...all) - 0.05);
  const hi = Math.min(1, Math.max(...all) + 0.05);
  const y = (p: number) => pad.t + (1 - (p - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const path = (get: (fr: (typeof frames)[number]) => number | null) => {
    let d = "";
    let pen = false;
    for (const fr of frames) {
      const v = get(fr);
      if (v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(fr.at).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const markers = data.events.filter((e) => e.kind !== "yellow" && e.kind !== "substitution");
  const seen = data.events.filter((e) => e.at <= f.at);
  const jump = (to: number) => {
    setPlaying(false);
    setIdx(to);
  };
  const predIdx = data.predictionAt === null ? -1 : frames.findIndex((fr) => fr.at >= data.predictionAt!);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Selection">
            {view.selections.map((s, i) => (
              <button key={s.id} role="tab" aria-selected={i === sel} onClick={() => setSel(i)} className={`rounded px-2 py-1 text-xs ${i === sel ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2"}`}>
                {view.marketName}: {s.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <button onClick={() => jump(0)} className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2">
              Opening
            </button>
            {predIdx >= 0 && (
              <button onClick={() => jump(predIdx)} className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2">
                Prediction
              </button>
            )}
            <button onClick={() => jump(kickoffIndex)} className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2">
              Kickoff
            </button>
            <button onClick={() => jump(last)} className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2">
              End
            </button>
          </div>
        </div>

        <div className="px-3 pt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Market and model probability from opening to full time">
            {[0, 0.25, 0.5, 0.75, 1].map((q) => {
              const p = lo + q * (hi - lo);
              return (
                <g key={q}>
                  <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} stroke="var(--grid)" />
                  <text x={pad.l - 6} y={y(p) + 3} textAnchor="end" fontSize={10} fill="var(--muted)" className="num">
                    {fmtPct(p, 0)}
                  </text>
                </g>
              );
            })}
            {hasLive && <rect x={split} y={pad.t} width={W - pad.r - split} height={H - pad.t - pad.b} fill="var(--grid)" opacity={0.35} />}
            <line x1={split} x2={split} y1={pad.t - 8} y2={H - pad.b} stroke="var(--muted)" />
            <text x={pad.l} y={H - 6} fontSize={10} fill="var(--muted)">
              Opening {fmtShortDateTime(openAt)}
            </text>
            <text x={split - 4} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">
              Kickoff
            </text>
            {hasLive && (
              <text x={W - pad.r} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">
                Full time
              </text>
            )}
            {markers.map((e, i) => (
              <g key={i}>
                <line x1={x(e.at)} x2={x(e.at)} y1={pad.t} y2={H - pad.b} stroke={e.kind === "red" ? "var(--critical)" : e.kind === "prediction" ? "var(--accent)" : "var(--warning)"} strokeDasharray="2 3" opacity={0.8} />
                <text x={x(e.at)} y={pad.t - 6} fontSize={9} textAnchor="middle" fill="var(--muted)">
                  {EVENT_MARK[e.kind] ?? "·"}
                </text>
                <title>{e.text}</title>
              </g>
            ))}
            <path d={path((fr) => fr.market[sel])} fill="none" stroke="var(--series-market)" strokeWidth={1.75} />
            <path d={path((fr) => fr.model[sel])} fill="none" stroke="var(--series-model)" strokeWidth={1.75} />
            <line x1={x(f.at)} x2={x(f.at)} y1={pad.t} y2={H - pad.b} stroke="var(--text)" strokeWidth={1.25} />
            <circle cx={x(f.at)} cy={y(f.market[sel])} r={3.5} fill="var(--series-market)" />
            {f.model[sel] != null && <circle cx={x(f.at)} cy={y(f.model[sel]!)} r={3.5} fill="var(--series-model)" />}
          </svg>
          <div className="flex flex-wrap justify-center gap-4 pb-1 text-[11px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-market" /> Market implied (margin-free)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-model" /> Model (ledgered pre-match, in-play estimate after kickoff)
            </span>
            <span className="text-muted">✚ news · ▣ lineup · ◆ prediction · ⚽ goal · ■ red card</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5">
          <button
            onClick={() => {
              if (idx >= last) setIdx(0);
              setPlaying((p) => !p);
            }}
            className="w-20 rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface-2"
          >
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <input type="range" min={0} max={last} value={idx} onChange={(e) => jump(Number(e.target.value))} aria-label="Replay position" className="min-w-40 flex-1 accent-[var(--accent)]" />
          <div className="flex gap-1 text-xs" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} aria-pressed={s === speed} className={`rounded px-1.5 py-0.5 ${s === speed ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2"}`}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-md border border-line bg-surface">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">At this point</h2>
            <span className="num text-xs text-ink-2">
              {fmtShortDateTime(f.at)} UTC · {f.phase === "live" ? `${f.minute}′ · ${f.score?.home}–${f.score?.away}` : "pre-match"}
            </span>
          </header>
          <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-2.5 py-2 pl-4 text-left font-medium">Selection</th>
                <th className="px-2.5 py-2 text-right font-medium">Odds</th>
                <th className="px-2.5 py-2 text-right font-medium">Market</th>
                <th className="px-2.5 py-2 pr-4 text-right font-medium">Model</th>
              </tr>
            </thead>
            <tbody>
              {view.selections.map((s, i) => (
                <tr key={s.id} className={`border-b border-line/60 ${i === sel ? "bg-surface-2" : ""}`}>
                  <td className="px-2.5 py-2 pl-4">{s.name}</td>
                  <td className="num px-2.5 py-2 text-right">{fmtOdds(f.odds[i])}</td>
                  <td className="num px-2.5 py-2 text-right">{fmtPct(f.market[i])}</td>
                  <td className="num px-2.5 py-2 pr-4 text-right">{f.model[i] == null ? <span className="text-muted">not yet recorded</span> : fmtPct(f.model[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-muted">{f.phase === "pre" ? "Consensus odds across tracked bookmakers." : live ? "In-play odds are the median bookmaker price at that feed run; the minute is estimated from the clock." : "In-play odds are the margin-free market with a 5% margin applied."} Historical · {label}.</p>
        </section>

        <section className="rounded-md border border-line bg-surface">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">What changed so far</h2>
            <span className="text-xs text-muted">
              {seen.length} of {data.events.length} events
            </span>
          </header>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {seen.length === 0 && <li className="px-4 py-3 text-sm text-muted">Market just opened. Nothing has happened yet.</li>}
            {[...seen].reverse().map((e, i) => (
              <li key={i} className="grid grid-cols-[120px_18px_1fr] gap-2 whitespace-nowrap px-4 py-1.5 text-[12.5px]">
                <span className="num text-muted">{fmtShortDateTime(e.at)}</span>
                <span className={e.kind === "red" ? "text-critical" : e.kind === "goal" ? "text-warning" : "text-muted"}>{EVENT_MARK[e.kind] ?? "·"}</span>
                <span className="whitespace-normal text-ink-2">{e.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-md border border-line bg-surface">
        <header className="border-b border-line px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Outcome</h2>
        </header>
        <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
              <th className="px-2.5 py-2 pl-4 text-left font-medium">Selection</th>
              <th className="px-2.5 py-2 text-right font-medium">Opening odds</th>
              <th className="px-2.5 py-2 text-right font-medium">Closing odds</th>
              <th className="px-2.5 py-2 text-right font-medium">Model at prediction</th>
              <th className="px-2.5 py-2 text-right font-medium">CLV</th>
              <th className="px-2.5 py-2 pr-4 text-right font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {view.selections.map((s, i) => (
              <tr key={s.id} className="border-b border-line/60">
                <td className="px-2.5 py-2 pl-4">{s.name}</td>
                <td className="num px-2.5 py-2 text-right">{fmtOdds(view.openingOdds[i])}</td>
                <td className="num px-2.5 py-2 text-right">{fmtOdds(view.closingOdds[i])}</td>
                <td className="num px-2.5 py-2 text-right">{fmtPct(view.preMatchModel[i])}</td>
                <td className={`num px-2.5 py-2 text-right ${data.clv[i] == null ? "text-muted" : data.clv[i]! >= 0 ? "text-good" : "text-serious"}`}>{fmtSignedPct(data.clv[i])}</td>
                <td className={`px-2.5 py-2 pr-4 text-right text-xs font-semibold uppercase ${view.results[i] === "won" ? "text-good" : "text-muted"}`}>{view.results[i] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-muted">
          Final score {view.event.homeName} {view.event.score?.home}–{view.event.score?.away} {view.event.awayName}. CLV compares the odds when the prediction was ledgered with the margin-free closing price.
          {view.modelVersion ? ` Model ${view.modelVersion}.` : " No prediction was ledgered for this market."}
          {live && " In play, the model line is the in-play goals model built from a fit on results before kickoff."} Historical · {label}.
        </p>
      </section>
    </div>
  );
}
