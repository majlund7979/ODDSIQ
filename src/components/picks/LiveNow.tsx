"use client";

// "I gang nu": the picks whose matches are being played, with the live score
// and how the bet stands. Refreshes every minute while the page is open.

import { useEffect, useState } from "react";
import type { LivePick } from "@/lib/live/scores";

const POLL_MS = 60_000;

const STATE: Record<"won" | "lost" | "none", { text: (finished: boolean) => string; tone: string }> = {
  won: { text: (f) => (f ? "Gik hjem" : "På vej hjem"), tone: "border-good/40 bg-good/10 text-good" },
  lost: { text: (f) => (f ? "Tabt" : "Ikke lige nu"), tone: "border-critical/40 bg-critical/10 text-critical" },
  none: { text: () => "Afgøres senere", tone: "border-line-strong text-ink-2" },
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
          const s = STATE[p.state ?? "none"];
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
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.text(p.finished)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
