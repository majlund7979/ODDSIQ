// Risk badge, odds-movement arrow and the advice row under each pick.

import { oddsMove, riskOf, stakeAdvice, type RiskLevel } from "@/lib/picks-advice";
import type { MarketRow } from "@/lib/demo/store";
import { SaveBet } from "./SaveBet";
import { StakeHint } from "./StakeHint";

const RISK_TONE: Record<RiskLevel, { pill: string; dot: string }> = {
  green: { pill: "border-good/40 bg-good/10 text-good", dot: "bg-good" },
  yellow: { pill: "border-warning/40 bg-warning/10 text-warning", dot: "bg-warning" },
  red: { pill: "border-critical/40 bg-critical/10 text-critical", dot: "bg-critical" },
};

export function RiskBadge({ p, className = "" }: { p: number; className?: string }) {
  const r = riskOf(p);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_TONE[r.level].pill} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${RISK_TONE[r.level].dot}`} aria-hidden />
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
      className={`num inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.direction === "down" ? "border-accent/40 text-accent" : "border-line-strong text-ink-2"}`}
    >
      {m.direction === "down" ? "↓" : "↑"} odds {Math.round(m.size * 100)} %
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

/** Stake suggestion and the "Gem bet" button. */
export function AdviceRow({ p, odds, eventId, save }: { p: number; odds: number | null; eventId: string; save: SaveTarget | null }) {
  const s = stakeAdvice(p, odds);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-5 py-2.5">
      <StakeHint share={s.share} note={s.note} reason={s.reason} />
      {save?.accounts &&
        (save.signedIn ? (
          <SaveBet eventId={eventId} category={save.category} odds={odds} share={s.share} back={save.back} saved={save.saved} />
        ) : (
          <a href={`/login?next=${encodeURIComponent(save.back)}`} className="rounded-md border border-line-strong px-3 py-1 text-sm text-ink-2 hover:text-ink">
            Log ind for at gemme
          </a>
        ))}
    </div>
  );
}
