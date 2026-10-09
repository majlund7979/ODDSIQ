// A double chance, correct score or first-half bet: the outcome, its fair odds
// and the chance of each alternative in the market.

import type { ExtraPick } from "@/lib/picks-extra";
import { dec } from "@/lib/format";
import { AdviceRow, type SaveTarget } from "../Advice";
import { CardTop, Gauge, MatchTitle, MoreToggle, StatBox } from "../BetCard";
import { NewsBlock } from "../facts";

export function ExtraCard({ p, rank, now, save }: { p: ExtraPick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  return (
    <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <MatchTitle home={home} away={away} />
          <span className="inline-block rounded-lg bg-lime-soft px-3 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          {p.best && (
            <StatBox label="Bedste odds" value={dec(p.best.odds)} sub={p.best.book} truncate>
              {p.best.odds * p.probability > 1 && <div className="mt-1 rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-semibold text-good">Værdi</div>}
            </StatBox>
          )}
          <StatBox label="Fair odds" value={dec(p.fairOdds)} sub="spil over denne" />
        </div>
      </div>
      <AdviceRow p={p.probability} odds={p.best?.odds ?? null} eventId={p.row.eventId} save={save} leg={{ key: `${p.row.eventId}|${p.category}|${p.outcome}`, match: p.row.match, outcome: p.outcome, kickoff: p.row.kickoff }} />
      <details className="group">
        <MoreToggle />
        <div className="space-y-4 border-t border-line px-5 py-5">
          <ul className="space-y-2.5">
            {p.table.map((x) => (
              <li key={x.label} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{x.label}</span>
                  <span className="num">
                    {Math.round(x.probability * 100)}% <span className="text-xs text-muted">· fair odds {dec(1 / Math.max(x.probability, 0.01))}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded bg-surface-3">
                  <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.min(100, x.probability * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-2">{p.note}</p>
          <NewsBlock home={home} away={away} />
        </div>
      </details>
    </article>
  );
}
