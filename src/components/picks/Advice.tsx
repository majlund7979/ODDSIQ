// Risk badge, odds-movement arrow and the advice row under each pick.

import { oddsMove, riskOf, stakeAdvice, type RiskLevel } from "@/lib/picks-advice";
import type { MarketRow } from "@/lib/demo/store";
import { buttonClass } from "@/components/ui";
import { AddLeg } from "./AddLeg";
import type { Leg } from "./coupon-store";
import { SaveBet } from "./SaveBet";
import { StakeHint } from "./StakeHint";

// Neutral on purpose: green and red mean won and lost on this site, so the risk level is told by the number of dots.
const RISK_DOTS: Record<RiskLevel, number> = { green: 1, yellow: 2, red: 3 };

export function RiskBadge({ p, className = "" }: { p: number; className?: string }) {
  const r = riskOf(p);
  const dots = RISK_DOTS[r.level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold leading-4 text-ink-2 ${className}`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((k) => (
          <span key={k} className={`h-1.5 w-1.5 rounded-full ${k <= dots ? "bg-ink-2" : "bg-surface-3"}`} />
        ))}
      </span>
      {r.label}
    </span>
  );
}

/** A small arrow when the odds have moved since the market opened. */
export function OddsMoveTag({ row }: { row: MarketRow }) {
  const m = oddsMove(row.movement, row.openingOdds, row.currentOdds);
  if (!m) return null;
  return (
    <span
      title={`${m.fact} ${m.maybe}`}
      className={`num inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold leading-4 ${m.direction === "down" ? "border-accent/40 text-accent" : "border-line-strong text-ink-2"}`}
    >
      {m.direction === "down" ? "↓" : "↑"} odds {Math.round(m.size * 100)}&nbsp;%
    </span>
  );
}

export interface SaveTarget {
  category: string;
  back: string;
  saved: boolean;
  /** False when nobody is signed in; the button then links to the login page. */
  signedIn: boolean;
  accounts: boolean;
}

/** Stake suggestion, "+ Kupon" and the "Gem bet" button. */
export function AdviceRow({
  p,
  odds,
  eventId,
  save,
  leg,
  showNote = true,
}: {
  p: number;
  odds: number | null;
  eventId: string;
  save: SaveTarget | null;
  leg?: Omit<Leg, "probability" | "odds" | "eventId">;
  showNote?: boolean;
}) {
  const s = stakeAdvice(p, odds);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line px-5 py-3">
      <StakeHint share={s.share} note={showNote ? s.note : null} reason={s.reason} />
      {leg && (
        <span className="ml-auto">
          <AddLeg leg={{ ...leg, eventId, probability: p, odds, category: save?.category }} />
        </span>
      )}
      {save?.accounts &&
        (save.signedIn ? (
          <SaveBet eventId={eventId} category={save.category} odds={odds} share={s.share} back={save.back} saved={save.saved} />
        ) : (
          <a href={`/login?next=${encodeURIComponent(save.back)}`} className={buttonClass("ghost", "sm")}>
            Log ind for at gemme
          </a>
        ))}
    </div>
  );
}
