// "Træfprocent pr. bet-type": how often each bet type has gone in, so it is
// easy to see which bets work best.

import Link from "next/link";
import type { Learning } from "@/lib/picks-learning";

export function HitRates({ learning, labels, current, days, source }: { learning: Learning; labels: { id: string; label: string }[]; current: string; days: number; source: string }) {
  const rows = labels.flatMap((c) => {
    const l = learning.get(c.id);
    return l && l.hitRate.n > 0 ? [{ ...c, rate: l.hitRate.value, n: l.hitRate.n }] : [];
  });
  if (!rows.length) return null;
  rows.sort((a, b) => b.rate - a.rate || b.n - a.n);
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Træfprocent pr. bet-type</span>
        <span className="text-xs text-muted">
          Historisk, sidste {days} dage · {source}
        </span>
      </div>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {rows.map((r) => (
          <li key={r.id} className="shrink-0">
            <Link
              href={`/picks/resultater?type=${r.id}`}
              title={`${r.n} afgjorte bets`}
              className={`num inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-sm ${r.id === current ? "border-accent/60 bg-accent/10" : "border-line hover:border-line-strong"}`}
            >
              <span className="font-sans text-ink-2">{r.label}</span>
              <span className="font-semibold">{Math.round(r.rate * 100)} %</span>
              <span className="text-[11px] text-muted">({r.n})</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
