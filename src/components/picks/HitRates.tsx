// "Træfprocent pr. bet-type": how often each bet type has gone in, so it is
// easy to see which bets work best, with the return when there are odds.

import Link from "next/link";
import { roiLabel, ROI_MIN, type ResultsSummary } from "@/lib/picks-extra";
import type { Learning } from "@/lib/picks-learning";

export function HitRates({ learning, labels, current, period, source, version, returns }: { learning: Learning; labels: { id: string; label: string }[]; current: string; period: string; source: string; version: string; returns?: Map<string, ResultsSummary> }) {
  const rows = labels.flatMap((c) => {
    const l = learning.get(c.id);
    return l && l.hitRate.n > 0 ? [{ ...c, rate: l.hitRate.value, n: l.hitRate.n, ret: returns?.get(c.id) }] : [];
  });
  if (!rows.length) return null;
  rows.sort((a, b) => b.rate - a.rate || b.n - a.n);
  return (
    <section className="overflow-hidden rounded-[20px] border border-line bg-surface px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Træfprocent og afkast pr. bet-type</h2>
        <span className="text-xs text-muted">
          Historisk · {period} · {source} · {version}
        </span>
      </div>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] after:w-4 after:shrink-0 after:content-[''] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none] sm:after:hidden">
        {rows.map((r) => (
          <li key={r.id} className="shrink-0">
            <Link
              href={`/picks/resultater?type=${r.id}`}
              title={`${r.n} afgjorte bets${r.ret?.withOdds ? `, afkast ${roiLabel(r.ret)} på ${r.ret.withOdds} bets med odds` : ""}`}
              className={`num inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-sm ${r.id === current ? "border-accent/60 bg-lime-soft" : "border-line hover:border-line-strong"}`}
            >
              <span className="font-sans text-ink-2">{r.label}</span>
              <span className="font-semibold">{Math.round(r.rate * 100)} %</span>
              <span className="text-[11px] text-muted">({r.n})</span>
              {r.ret?.withOdds ? (
                <span className={`text-[11px] ${r.ret.withOdds < ROI_MIN ? "text-muted" : r.ret.roi >= 0 ? "text-good" : "text-serious"}`}>
                  {r.ret.withOdds < ROI_MIN ? "afkast: for få" : roiLabel(r.ret)}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
