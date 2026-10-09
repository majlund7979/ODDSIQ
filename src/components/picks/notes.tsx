// The notes under a list that say how far to trust it: what the learning has
// adjusted, and the price comparison's historical test.

import { LEARN_MIN, type CategoryLearning } from "@/lib/picks-learning";
import { SHARP_BACKTEST, SHARP_MIN_EV, SHARP_RECENT } from "@/lib/sharp";
import { dec, pct, shortDate, signedPct, TZ } from "@/lib/format";

export function LearningNote({ l }: { l: CategoryLearning }) {
  const n = l.hitRate.n;
  return (
    <div className="rounded-[20px] bg-surface-2 px-5 py-4 text-sm text-ink-2">
      <span className="font-semibold text-ink">Modellen lærer af sine resultater. </span>
      {l.learning ? (
        <>
          {n} afgjorte bets af denne type har ramt {pct(l.hitRate.value)} mod forventet {pct(l.expected)}, så procenterne er justeret{" "}
          <span className="num">
            {l.adjustmentPp >= 0 ? "+" : "−"}
            {Math.abs(l.adjustmentPp).toFixed(1).replace(".", ",")}
          </span>{" "}
          point.
        </>
      ) : (
        <>
          {n} af de {LEARN_MIN} afgjorte bets, der skal til, før denne type justeres. Indtil da vises modellens egne procenter.
        </>
      )}
      <span className="text-xs text-muted">
        {" "}
        Historisk, {l.hitRate.periodFrom ? shortDate(l.hitRate.periodFrom) : ""}
        {l.hitRate.periodTo ? `–${shortDate(l.hitRate.periodTo)}` : ""} · {l.hitRate.source} ·{" "}
        {l.hitRate.modelVersion}
      </span>
    </div>
  );
}

const month = (t: number | null) => (t === null ? "?" : new Date(t).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: TZ }));

/** The rule's historical test, with sample size, period, source and version, so the list is never read as a proven edge. */
export function SharpBacktestNote() {
  const b = SHARP_BACKTEST;
  const r = SHARP_RECENT;
  return (
    <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted">
      Historisk test ({b.source}, {b.n.toLocaleString("da-DK")} bets, {month(b.periodFrom)} til {month(b.periodTo)}, {b.modelVersion}): afkast {signedPct(b.value.roi)} (90 %-interval{" "}
      {signedPct(b.value.roiLow)} til {signedPct(b.value.roiHigh)}), {signedPct(b.value.clv)} mod Pinnacles lukkepris uden margin. Grænsen på {dec(SHARP_MIN_EV * 100, 0)} % blev valgt efter
      testen, så tallene er nok for pæne. Fra {month(r.periodFrom)} slog reglen ikke lukkeprisen ({signedPct(r.value.clv)}, {r.n} bets). Ingen dokumenteret fordel; vi følger resultaterne
      live, hvor lukkeprisen er bookmakernes median, ikke Pinnacles.
    </p>
  );
}
