// One match in the tipping game: teams, kick-off and the 1, X and 2 buttons, with what the
// friends tipped once the match has started. Shown on the "Tip kampe" tab of Vennerligaen.

import { setTip } from "@/app/tips-actions";
import { TipButtons } from "@/components/TipButtons";
import { clock } from "@/lib/format";
import { SIDE_LABEL, SIDES, type Side, type TipMatch as Match } from "@/lib/tips";

/** How the friends split over 1, X and 2: one bar, revealed when the match starts so nobody copies. */
function Split({ counts, result }: { counts: Record<Side, number>; result: Side | null }) {
  const n = counts.home + counts.draw + counts.away;
  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {SIDES.map((s) =>
          counts[s] ? <span key={s} className={`h-full ${result === s ? "bg-good" : s === "draw" ? "bg-ink-2/50" : "bg-ink-2/80"} border-r-2 border-surface last:border-r-0`} style={{ width: `${(counts[s] / n) * 100}%` }} /> : null,
        )}
      </div>
      <p className="flex flex-wrap gap-x-3 text-xs text-ink-2">
        <span>Vennerne tippede</span>
        {SIDES.map((s) => (
          <span key={s} className={result === s ? "font-semibold text-good" : ""}>
            {SIDE_LABEL[s]}: {counts[s]}
          </span>
        ))}
      </p>
    </div>
  );
}

export function TipMatch({ m, now, pick, counts, canTip }: { m: Match; now: number; pick: Side | null; counts: Record<Side, number>; canTip: boolean }) {
  const locked = m.kickoff <= now;
  const n = counts.home + counts.draw + counts.away;
  const hit = m.result && pick ? m.result === pick : null;
  return (
    <li
      id={m.eventId}
      className={`relative overflow-hidden rounded-card border p-4 transition-colors sm:p-5 ${
        hit === true ? "border-good/40 bg-good/[0.04]" : locked ? "border-line bg-surface/60" : pick ? "border-accent/35 bg-surface" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      {pick && !locked && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <div className="text-md font-semibold leading-snug sm:text-lg">
            {m.home} <span className="font-normal text-muted">–</span> {m.away}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
            <span>{m.league}</span>
            <span>·</span>
            {m.score ? (
              <span className="num font-semibold text-ink">
                Slut {m.score[0]}–{m.score[1]}
              </span>
            ) : m.status === "live" ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-good">
                <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-good text-good" />I gang
              </span>
            ) : locked ? (
              <span>Startet {clock(m.kickoff)}</span>
            ) : (
              <span className="num font-semibold text-ink">kl. {clock(m.kickoff)}</span>
            )}
            {hit !== null && <span className={`font-semibold ${hit ? "text-good" : "text-critical"}`}>· {hit ? "Rigtigt tip" : "Forkert tip"}</span>}
          </div>
        </div>
        <div className="w-full sm:w-64">
          <TipButtons action={setTip} eventId={m.eventId} pick={pick} odds={m.odds} model={m.model} locked={locked || !canTip} started={locked} result={m.result} />
        </div>
      </div>
      {n > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          {locked ? (
            <Split counts={counts} result={m.result} />
          ) : (
            <p className="text-xs text-ink-2">
              {n} {n === 1 ? "ven har" : "venner har"} tippet. Du ser, hvad de tippede, når kampen starter.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
