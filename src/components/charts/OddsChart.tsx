"use client";

import {
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

export interface OddsPoint {
  at: number;
  consensus: number;
  best: number;
}

export interface ChartMarker {
  at: number;
  label: string;
}

const RANGES = [
  { key: "1H", hours: 1 },
  { key: "6H", hours: 6 },
  { key: "12H", hours: 12 },
  { key: "24H", hours: 24 },
  { key: "7D", hours: 168 },
] as const;

const COLORS = {
  consensus: "#3987e5", // series slot 1
  best: "#199e70", // series slot 3
  opening: "#898781",
  grid: "#2c2c2a",
  text: "#898781",
  marker: "#fab219",
};

const toTs = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

export function OddsChart({ points, markers, openingOdds }: { points: OddsPoint[]; markers: ChartMarker[]; openingOdds: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("24H");
  const [hover, setHover] = useState<{ at: number; consensus?: number; best?: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: COLORS.text, fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderColor: "#383835" },
      timeScale: { borderColor: "#383835", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: "en-GB", priceFormatter: (p: number) => p.toFixed(2) },
    });
    const consensus = chart.addSeries(LineSeries, { color: COLORS.consensus, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "" });
    const best = chart.addSeries(LineSeries, { color: COLORS.best, lineWidth: 2, lineStyle: LineStyle.Solid, priceLineVisible: false, lastValueVisible: true });
    consensus.setData(points.map((p) => ({ time: toTs(p.at), value: p.consensus })));
    best.setData(points.map((p) => ({ time: toTs(p.at), value: p.best })));
    consensus.createPriceLine({ price: openingOdds, color: COLORS.opening, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Open" });
    const times = new Set(points.map((p) => toTs(p.at)));
    const snapped = markers
      .map((m) => {
        // Snap to the nearest charted point so the marker renders.
        let nearest = points[0];
        for (const p of points) if (Math.abs(p.at - m.at) < Math.abs(nearest.at - m.at)) nearest = p;
        return { ...m, time: toTs(nearest.at) };
      })
      .filter((m) => times.has(m.time));
    createSeriesMarkers(
      consensus,
      snapped.map((m) => ({ time: m.time, position: "aboveBar" as const, shape: "circle" as const, color: COLORS.marker, size: 1, text: m.label })),
    );
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) return setHover(null);
      const c = param.seriesData.get(consensus) as { value?: number } | undefined;
      const b = param.seriesData.get(best) as { value?: number } | undefined;
      setHover({ at: (param.time as number) * 1000, consensus: c?.value, best: b?.value });
    });
    chartRef.current = chart;
    seriesRef.current = consensus;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points, markers, openingOdds]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || points.length === 0) return;
    const end = points[points.length - 1].at;
    const hours = RANGES.find((r) => r.key === range)!.hours;
    chart.timeScale().setVisibleRange({ from: toTs(Math.max(points[0].at, end - hours * 3_600_000)), to: toTs(end) });
  }, [range, points]);

  const last = points[points.length - 1];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <div className="flex items-center gap-4 text-[11px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: COLORS.consensus }} /> Consensus
            <span className="num text-ink">{(hover?.consensus ?? last?.consensus)?.toFixed(2)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: COLORS.best }} /> Best price
            <span className="num text-ink">{(hover?.best ?? last?.best)?.toFixed(2)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS.marker }} /> News
          </span>
          {hover && <span className="num text-muted">{new Date(hover.at).toISOString().slice(5, 16).replace("T", " ")} UTC</span>}
        </div>
        <div role="group" aria-label="Chart range" className="flex overflow-hidden rounded border border-line">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`num px-2.5 py-1 text-[11px] ${range === r.key ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className="h-72 w-full" />
    </div>
  );
}
