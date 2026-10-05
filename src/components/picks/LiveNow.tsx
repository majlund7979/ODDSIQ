"use client";

// "I gang nu": the picks whose matches are being played, with the live score
// and how the bet stands. Refreshes every minute while the page is open.

import { useEffect, useState } from "react";
import type { LivePick, LiveTone } from "@/lib/live/scores";

const POLL_MS = 60_000;

// Red: lost. Green: home. Light green: on its way home. Yellow: level, e.g. 0-0. Orange: worse than level.
const TONE: Record<LiveTone, { icon: string; label: (finished: boolean) => string; dot: string; text: string }> = {
  won: { icon: "✓", label: (f) => (f ? "Gik hjem" : "Gået hjem"), dot: "bg-[#22c55e] text-[#052e16]", text: "text-[#4ade80]" },
  winning: { icon: "↗", label: () => "På vej hjem", dot: "bg-[#bbf7d0] text-[#14532d]", text: "text-[#bbf7d0]" },
  neutral: { icon: "–", label: () => "Neutral", dot: "bg-[#facc15] text-[#422006]", text: "text-[#fde047]" },
  behind: { icon: "↘", label: () => "Bagud", dot: "bg-[#fb923c] text-[#431407]", text: "text-[#fdba74]" },
  lost: { icon: "✗", label: (f) => (f ? "Tabt" : "Kan ikke gå hjem"), dot: "bg-[#ef4444] text-white", text: "text-[#f87171]" },
  unknown: { icon: "?", label: () => "Afgøres senere", dot: "bg-surface-3 text-ink-2", text: "text-ink-2" },
};

export function LiveNow({ type, initial }: { type: string; initial: LivePick[] }) {
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
    <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-critical" aria-hidden />I gang nu
        </span>
        <span className="text-xs text-muted">opdateres hvert minut · API-Football</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((p) => {
          const s = TONE[p.tone ?? (p.state === "won" ? "winning" : p.state === "lost" ? "behind" : "unknown")];
          const [home, away] = p.match.split(" vs ");
          return (
            <li key={p.key} className="flex items-center gap-3 px-5 py-2.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.dot}`} aria-hidden>
                {s.icon}
              </span>
              <span className="num w-12 shrink-0 text-xs text-muted">{p.clock}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {home} <span className="num font-semibold">{p.score ? `${p.score[0]}–${p.score[1]}` : "–"}</span> {away}
                </span>
                <span className="block truncate text-xs text-muted">
                  {p.outcome} · {p.league}
                </span>
              </span>
              <span className={`shrink-0 text-[11px] font-semibold ${s.text}`}>{s.label(p.finished)}</span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-2 text-[11px] text-muted">
        {(["won", "winning", "neutral", "behind", "lost"] as LiveTone[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${TONE[k].dot}`} aria-hidden />
            {k === "won" ? "Gået hjem" : k === "lost" ? "Tabt" : TONE[k].label(false)}
          </span>
        ))}
      </p>
    </section>
  );
}
