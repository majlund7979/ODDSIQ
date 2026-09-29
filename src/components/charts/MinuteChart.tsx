import type { LiveEvent } from "@/lib/domain/types";

export interface MinuteSeries {
  label: string;
  color: string;
  points: { minute: number; v: number }[];
  dashed?: boolean;
}

/** In-play chart on a match-minute axis, with goals and red cards pinned as labelled markers. */
export function MinuteChart({
  series,
  events = [],
  format,
  domain,
  label,
  height = 190,
}: {
  series: MinuteSeries[];
  events?: LiveEvent[];
  format: (v: number) => string;
  domain?: [number, number];
  label: string;
  height?: number;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 12, t: 18, b: 22 };
  const all = series.flatMap((s) => s.points.map((p) => p.v)).filter(Number.isFinite);
  let [v0, v1] = domain ?? [Math.min(...all), Math.max(...all)];
  if (!domain) {
    const span = Math.max(v1 - v0, 1e-6);
    v0 -= span * 0.08;
    v1 += span * 0.08;
  }
  const maxMin = Math.max(95, ...series.flatMap((s) => s.points.map((p) => p.minute)));
  const x = (m: number) => pad.l + (m / maxMin) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - v0) / (v1 - v0 || 1)) * (H - pad.t - pad.b);
  const key = events.filter((e) => e.kind === "goal" || e.kind === "red");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = v0 + f * (v1 - v0);
          return (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
              <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--muted)" className="num">
                {format(v)}
              </text>
            </g>
          );
        })}
        {[0, 15, 30, 45, 60, 75, 90].map((m) => (
          <text key={m} x={x(m)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)" className="num">
            {m}′
          </text>
        ))}
        {key.map((e, i) => (
          <g key={i}>
            <line x1={x(e.minute)} x2={x(e.minute)} y1={pad.t} y2={H - pad.b} stroke={e.kind === "red" ? "var(--critical)" : "var(--warning)"} strokeDasharray="3 3" />
            <text x={x(e.minute)} y={pad.t - 5} textAnchor="middle" fontSize={9} fill={e.kind === "red" ? "var(--critical)" : "var(--warning)"}>
              {e.kind === "goal" ? `⚽ ${e.minute}′` : `■ ${e.minute}′`}
            </text>
            <title>{e.description}</title>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.label}
            d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.minute).toFixed(1)},${y(p.v).toFixed(1)}`).join("")}
            fill="none"
            stroke={s.color}
            strokeWidth={1.75}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-4 text-[11px] text-ink-2">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="w-4 border-t-2" style={{ borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }} /> {s.label}
          </span>
        ))}
        {key.length > 0 && <span className="text-muted">⚽ goal · ■ red card</span>}
      </figcaption>
    </figure>
  );
}
