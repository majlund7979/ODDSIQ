// A player's "mindst 1 skud på mål": his rate per 90 minutes, whether he
// starts, and the fair odds to compare with.

import { POSITION_LABEL, TYPICAL_TEAM_GOALS, type ShotPick } from "@/lib/player-shots";
import { dec } from "@/lib/format";
import { AdviceRow } from "../Advice";
import { CardTop, Gauge } from "../BetCard";

export function ShotCard({ p, rank, now }: { p: ShotPick; rank: number; now: number }) {
  const start =
    p.start === "confirmed" ? (
      <span className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-semibold text-good">Starter, opstilling bekræftet</span>
    ) : p.start === "bench" ? (
      <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">På bænken</span>
    ) : (
      <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs text-ink-2">
        Startet {p.season.lineups} af {p.season.appearances} kampe
      </span>
    );
  return (
    <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.league} kickoff={p.kickoff} probability={p.probability} now={now} />
          <div>
            <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] sm:text-[22px]">{p.player}</h2>
            <div className="mt-1 text-sm text-ink-2">
              {p.team} mod {p.opponent}
              {p.position && <span className="text-muted"> · {POSITION_LABEL[p.position] ?? p.position}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-lime-soft px-3.5 py-1.5 text-[15px] font-semibold text-accent">Mindst 1 skud på mål</span>
            {start}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <div className="min-w-[96px] rounded-2xl bg-surface-2 px-3 py-2.5 text-center">
            <div className="text-[11px] font-medium text-muted">Fair odds</div>
            <div className="num text-2xl font-semibold">{dec(p.fairOdds)}</div>
            <div className="text-[11px] text-ink-2">tag kun højere</div>
          </div>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-2 border-t border-line px-5 py-3 text-sm text-ink-2 sm:grid-cols-3">
        <div>
          <span className="num font-semibold text-ink">{dec(p.per90)}</span> skud på mål pr. 90 min
        </div>
        <div>
          <span className="num font-semibold text-ink">{p.season.shotsOn}</span> på mål i {p.season.appearances} kampe ({p.season.minutes} min)
        </div>
        <div>
          Holdet ventes at score <span className="num font-semibold text-ink">{dec(p.matchFactor * TYPICAL_TEAM_GOALS, 1)}</span> mål
        </div>
      </div>
      <AdviceRow p={p.probability} odds={null} eventId={p.eventId} save={null} />
    </article>
  );
}
