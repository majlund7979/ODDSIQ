"use client";

// "I gang nu": the picks whose matches are being played, with the live score
// and how the bet stands. Refreshes every minute while the page is open.

import { useEffect, useState } from "react";
import type { LivePick, LiveTone } from "@/lib/live/scores";

const POLL_MS = 60_000;

// Green: won. Light green: positive. Yellow: neutral, e.g. 0-0. Orange: negative. Red: lost (Mads, 2026-10-05).
const TONE: Record<LiveTone, { icon: string; label: string; dot: string }> = {
  won: { icon: "✓", label: "Vundet", dot: "bg-good text-page" },
  winning: { icon: "↗", label: "Positiv", dot: "bg-good/30 text-good ring-1 ring-inset ring-good/50" },
  neutral: { icon: "–", label: "Neutral", dot: "bg-warning text-page" },
  behind: { icon: "↘", label: "Negativ", dot: "bg-serious text-page" },
  lost: { icon: "✗", label: "Tabt", dot: "bg-critical text-page" },
  unknown: { icon: "?", label: "Afgøres senere", dot: "bg-surface-3 text-ink-2" },
};

export function LiveNow({ type, initial, source }: { type: string; initial: LivePick[]; source: string }) {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/live?type=${encodeURIComponent(type)}`, { cache: "no-store" });
        if (res.ok && alive) setItems(((await res.json()) as { items: LivePick[] }).items);
      } catch {
        // Keep the last score on a network hiccup.
      }
    };
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [type]);
  if (!items.length) return null;
  return (
    <section className="rise overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2.5 text-md font-semibold">
          <span className="live-dot h-2 w-2 rounded-full bg-critical text-critical" aria-hidden />I gang nu
        </h2>
        <span className="text-xs text-muted">opdateres hvert minut · {source}</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((p) => {
          const s = TONE[p.tone ?? (p.state === "won" ? "winning" : p.state === "lost" ? "behind" : "unknown")];
          const [home, away] = p.match.split(" vs ");
          return (
            <li key={p.key} className="flex items-center gap-3 px-5 py-2.5">
              <span className="num w-12 shrink-0 text-xs text-muted">{p.clock}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {home} <span className="num font-semibold">{p.score ? `${p.score[0]}–${p.score[1]}` : "–"}</span> {away}
                </span>
                <span className="block truncate text-xs text-muted">
                  {p.outcome} · {p.league}
                </span>
              </span>
              {/* The icon alone; the legend below says what each colour means. */}
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.dot}`} role="img" aria-label={s.label} title={s.label}>
                {s.icon}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-2.5 text-xs text-ink-2">
        {(["won", "winning", "neutral", "behind", "lost"] as LiveTone[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${TONE[k].dot}`} aria-hidden />
            {TONE[k].label}
          </span>
        ))}
      </p>
    </section>
  );
}
