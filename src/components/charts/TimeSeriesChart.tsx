import { fmtMonth, fmtShortDateTime } from "@/lib/format";

export interface Series {
  label: string;
  color: string;
  points: { t: number; v: number }[];
  dashed?: boolean;
}

/**
 * Static SVG time series for weekly aggregates and equity curves. Values
 * missing (NaN) break the line instead of being drawn as zero.
 */
export function TimeSeriesChart({
  series,
  format,
  markers = [],
  zero = false,
  height = 200,
  width = 720,
  label,
}: {
  series: Series[];
  format: (v: number) => string;
  markers?: { at: number; label: string }[];
  zero?: boolean;
  height?: number;
  /** Viewbox width: use a smaller value in narrow panels so labels keep their size. */
  width?: number;
  label: string;
}) {
  const W = width;
  const H = height;
  const pad = { l: 56, r: 12, t: 12, b: 24 };
  const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.v));
  if (all.length === 0) return <p className="px-4 py-6 text-sm text-muted">No data in this period.</p>;
  const t0 = Math.min(...all.map((p) => p.t));
  const t1 = Math.max(...all.map((p) => p.t));
  let v0 = Math.min(...all.map((p) => p.v), zero ? 0 : Infinity);
  let v1 = Math.max(...all.map((p) => p.v), zero ? 0 : -Infinity);
  if (v0 === v1) {
    v0 -= 1;
    v1 += 1;
  }
  const span = v1 - v0;
  v0 -= span * 0.06;
  v1 += span * 0.06;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - v0) / (v1 - v0)) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => v0 + f * (v1 - v0));
  const months: number[] = [];
  for (let d = new Date(t0), i = 0; i < 40; i++) {
    const m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1);
    if (m > t1) break;
    if (m >= t0) months.push(m);
  }
  const step = Math.max(1, Math.ceil(months.length / (W < 600 ? 5 : 8)));

  const path = (pts: { t: number; v: number }[]) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (!Number.isFinite(p.v)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  return (
    <figure className="px-3 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={pad.l - 6} y={y(v) + 3} fontSize={10} textAnchor="end" fill="var(--muted)" className="num">
              {format(v)}
            </text>
          </g>
        ))}
        {months
          .filter((_, i) => i % step === 0)
          .map((m) => (
            <text key={m} x={x(m)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--muted)">
              {fmtMonth(m)}
            </text>
          ))}
        {zero && v0 < 0 && v1 > 0 && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1.5} />}
        {markers
          .filter((m) => m.at >= t0 && m.at <= t1)
          .map((m) => (
            <g key={m.at}>
              <line x1={x(m.at)} x2={x(m.at)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeDasharray="3 4" />
              <text x={x(m.at) + 4} y={pad.t + 10} fontSize={10} fill="var(--text-2)">
                {m.label}
              </text>
            </g>
          ))}
        {series.map((s) => (
          <path key={s.label} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={1.75} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round">
            <title>{s.label}</title>
          </path>
        ))}
        {series.length === 1 &&
          series[0].points.length <= 60 &&
          series[0].points
            .filter((p) => Number.isFinite(p.v))
            .map((p) => (
              <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={2.5} fill={series[0].color}>
                <title>{`${fmtShortDateTime(p.t)} · ${format(p.v)}`}</title>
              </circle>
            ))}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap justify-center gap-4 text-[11px] text-ink-2">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="w-4 border-t-2" style={{ borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }} /> {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
