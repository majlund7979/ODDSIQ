import Link from "next/link";
import { requireFriend } from "@/lib/auth/friends";
import { roiLabel, ROI_MIN, summarise, type RecordedPick } from "@/lib/picks-extra";
import { brier, calibration, CALIBRATION_MIN, CALIBRATION_VERSION } from "@/lib/picks-calibration";
import { terminal } from "@/lib/terminal";
import { CLV_VERSION } from "@/lib/real/clv";
import { CATEGORY_LABEL } from "@/lib/pick-categories";
import { LEARN_DAYS, LEARN_MIN, LEARNING_VERSION, learn, type CategoryLearning } from "@/lib/picks-learning";

export const metadata = { title: "Resultater · Oddsanalyse" };

const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)} %` : "—");
const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(1).replace(".", ",")} %`;
const kr = (units: number) => `${units >= 0 ? "+" : "−"}${Math.round(Math.abs(units) * 100)} kr`;

function dayLabel(day: string) {
  const d = new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function Mark({ r }: { r: RecordedPick["result"] }) {
  if (r === "won") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-good/20 text-sm font-bold text-good">✓</span>;
  if (r === "lost") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-critical/20 text-sm font-bold text-critical">✗</span>;
  return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs text-muted">…</span>;
}

function adjustment(l: CategoryLearning | undefined): string {
  if (!l) return "—";
  if (!l.learning) return `lærer (${l.hitRate.n}/${LEARN_MIN})`;
  return `${l.adjustmentPp >= 0 ? "+" : "−"}${Math.abs(l.adjustmentPp).toFixed(1).replace(".", ",")} point`;
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireFriend("/picks/resultater");
  const t = await terminal();
  const q = await searchParams;
  const all = await t.recordedPicks();
  const type = q.type && CATEGORY_LABEL[q.type] ? q.type : "bedste";
  const picks = all.filter((p) => p.category === type);
  const total = summarise(picks);
  const byCat = Object.keys(CATEGORY_LABEL).map((c) => ({ id: c, s: summarise(all.filter((p) => p.category === c)) }));
  const days = [...new Set(picks.map((p) => p.day))];
  const history = await t.recordedPicks(LEARN_DAYS);
  const learning = learn(history, t.dataLabel);
  const cal = calibration(history);
  const score = brier(history);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-2">
        <Link href="/picks" className="text-sm text-muted hover:text-ink">
          ← Dagens bedste bets
        </Link>
        <h1 className="display text-[40px] text-accent sm:text-5xl">Resultater</h1>
        <p className="max-w-2xl text-[15px] text-ink-2">Sådan gik de bets, siden viste de sidste 7 dage. Hvert bet tælles første gang, det blev vist.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {[
          { v: total.settled ? `${total.won} af ${total.settled}` : "—", l: "gik hjem" },
          { v: total.settled ? pct(total.won / total.settled) : "—", l: "ramte" },
          { v: pct(total.expectedRate), l: "vi regnede med" },
          { v: total.withOdds ? kr(total.profit) : "—", l: "ved 100 kr pr. bet", tone: total.withOdds ? (total.profit >= 0 ? "text-good" : "text-serious") : "" },
          {
            v: total.withOdds ? roiLabel(total).replace(" (for få bets)", "") : "—",
            l: total.withOdds && total.withOdds < ROI_MIN ? `afkast, for få bets (${total.withOdds})` : `afkast (${total.withOdds} bets med odds)`,
            tone: !total.withOdds || total.withOdds < ROI_MIN ? "text-muted" : total.roi >= 0 ? "text-good" : "text-serious",
          },
        ].map((x) => (
          <div key={x.l} className="rounded-[20px] border border-line bg-surface px-4 py-3">
            <div className={`num text-xl font-semibold ${x.tone ?? ""}`}>{x.v}</div>
            <div className="text-xs text-muted">{x.l}</div>
          </div>
        ))}
      </div>

      <section className="rounded-[20px] border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Slog vi lukkeoddsen? <span className="font-normal text-muted">{CATEGORY_LABEL[type]}</span></h2>
          <span className={`num text-xl font-semibold ${total.withClose ? (total.clv >= 0 ? "text-good" : "text-serious") : "text-muted"}`}>{total.withClose ? signedPct(total.clv) : "—"}</span>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {total.withClose
            ? `${total.beatClose} af ${total.withClose} bets havde bedre odds, da vi viste dem, end markedet gav lige før kampstart.`
            : "Ingen bets med lukkeodds endnu. Tallet kommer, når kampe med bookmakerodds er spillet."}
        </p>
        <p className="mt-2 text-xs text-muted">
          CLV (closing line value) sammenligner oddsen, vi viste, med bookmakernes sidste odds før kampstart uden deres margin. Over 0 betyder, at vi fik en bedre pris end
          markedet endte på. Det er det bedste tegn på, om bets er gode på lang sigt, også når de taber. Historisk, {total.withClose} bets, sidste 7 dage, kilde {t.dataLabel},{" "}
          {CLV_VERSION}.
        </p>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        <div className="border-b border-line px-5 py-3 text-sm font-semibold">Alle bet-typer</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-2 font-normal">Type</th>
              <th className="px-3 py-2 text-right font-normal">Gik hjem</th>
              <th className="px-3 py-2 text-right font-normal">Ramte</th>
              <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Forventet</th>
              <th className="px-3 py-2 text-right font-normal">100 kr pr. bet</th>
              <th className="px-3 py-2 text-right font-normal" title="Gevinst i procent af det, der er satset">Afkast</th>
              <th className="hidden px-3 py-2 text-right font-normal sm:table-cell" title="Gennemsnitlig CLV mod lukkeoddsen">CLV</th>
              <th className="px-5 py-2 text-right font-normal" title="Hvor meget modellen har justeret procenterne ud fra resultaterne">Justering</th>
            </tr>
          </thead>
          <tbody className="num">
            {byCat.map(({ id, s }) => (
              <tr key={id} className={`border-t border-line ${id === type ? "bg-surface-2" : ""}`}>
                <td className="px-5 py-2 font-sans">
                  <Link href={`/picks/resultater?type=${id}`} scroll={false} className="hover:text-accent">
                    {CATEGORY_LABEL[id]}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{s.settled ? `${s.won}/${s.settled}` : "—"}</td>
                <td className="px-3 py-2 text-right">{s.settled ? pct(s.won / s.settled) : "—"}</td>
                <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">{pct(s.expectedRate)}</td>
                <td className={`px-3 py-2 text-right ${s.withOdds ? (s.profit >= 0 ? "text-good" : "text-serious") : "text-muted"}`}>{s.withOdds ? kr(s.profit) : "ingen odds"}</td>
                <td className={`px-3 py-2 text-right ${!s.withOdds || s.withOdds < ROI_MIN ? "text-muted" : s.roi >= 0 ? "text-good" : "text-serious"}`}>
                  {!s.withOdds ? "—" : s.withOdds < ROI_MIN ? "for få" : roiLabel(s)}
                </td>
                <td className={`hidden px-3 py-2 text-right sm:table-cell ${s.withClose ? (s.clv >= 0 ? "text-good" : "text-serious") : "text-muted"}`}>{s.withClose ? signedPct(s.clv) : "—"}</td>
                <td className="px-5 py-2 text-right text-ink-2">{adjustment(learning.get(id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Justering: modellen sammenligner, hvor ofte hver bet-type har ramt, med hvad den regnede med, og retter procenterne lidt til. Den lærer først, når en type
          har {LEARN_MIN} afgjorte bets, og jo flere bets, jo mere stoler den på dem. Bygger på de sidste {LEARN_DAYS} dage (historisk, {t.dataLabel}, {LEARNING_VERSION}).
        </p>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">Holder procenterne?</h2>
          <p className="mt-1 text-xs text-ink-2">Går vores 70 %-bets hjem 70 % af gangene? Alle bet-typer, sidste {LEARN_DAYS} dage.</p>
        </div>
        {cal.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen afgjorte bets endnu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 py-2 font-normal">Vi sagde</th>
                <th className="px-3 py-2 text-right font-normal">Bets</th>
                <th className="px-3 py-2 text-right font-normal">Snit</th>
                <th className="px-3 py-2 text-right font-normal">Gik hjem</th>
                <th className="px-5 py-2 text-right font-normal" title="1 / bedste odds, et skøn der stadig rummer lidt bookmakeravance">Bookmakerne</th>
              </tr>
            </thead>
            <tbody className="num">
              {cal.map((r) => {
                const gap = r.hitRate - r.stated;
                const few = r.n < CALIBRATION_MIN;
                return (
                  <tr key={r.from} className="border-t border-line">
                    <td className="px-5 py-2 font-sans">
                      {Math.round(r.from * 100)}–{Math.round(r.to * 100)} %
                    </td>
                    <td className="px-3 py-2 text-right text-ink-2">{r.n}</td>
                    <td className="px-3 py-2 text-right">{pct(r.stated)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${few ? "text-muted" : Math.abs(gap) <= 0.05 ? "text-good" : "text-serious"}`}>
                      {pct(r.hitRate)}
                      {few && <span className="block text-[10px] font-normal">for få bets</span>}
                    </td>
                    <td className="px-5 py-2 text-right text-ink-2">{r.withOdds ? pct(r.market) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Grønt: højst 5 point fra det, vi sagde. Bookmakerne er 1 / bedste odds, et skøn med lidt avance i. Grupper under {CALIBRATION_MIN} bets er for små til at sige noget sikkert.
          {score
            ? ` Samlet præcision (Brier, lavere er bedre) på ${score.n} bets med odds: os ${score.ours.toFixed(3).replace(".", ",")}, bookmakerne ${score.market.toFixed(3).replace(".", ",")}.`
            : ""}{" "}
          Historisk, kilde {t.dataLabel}, {CALIBRATION_VERSION}.
        </p>
      </section>

      <h2 className="text-lg font-semibold">{CATEGORY_LABEL[type]}, dag for dag</h2>
      {days.length === 0 ? (
        <div className="rounded-[20px] border border-line bg-surface px-6 py-10 text-center text-sm text-ink-2">
          Ingen afgjorte bets endnu. Resultaterne kommer, når de første kampe er spillet.
        </div>
      ) : (
        days.map((day) => {
          const list = picks.filter((p) => p.day === day);
          const s = summarise(list);
          return (
            <section key={day} className="overflow-hidden rounded-[20px] border border-line bg-surface">
              <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
                <span className="font-semibold">{dayLabel(day)}</span>
                <span className="text-sm text-ink-2">{s.settled ? `${s.won} af ${s.settled} gik hjem` : "afventer"}</span>
              </div>
              <ul className="divide-y divide-line">
                {list.map((p) => (
                  <li key={`${p.match}|${p.outcome}`} className="flex items-center gap-3 px-5 py-2.5">
                    <Mark r={p.result} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.outcome}</span>
                      <span className="block truncate text-xs text-muted">
                        {p.match.replace(" vs ", " – ")} · {p.league}
                      </span>
                    </span>
                    <span className="num shrink-0 text-right text-sm">
                      {Math.round(p.probability * 100)}%{p.odds ? <span className="block text-xs text-muted">odds {p.odds.toFixed(2).replace(".", ",")}</span> : null}
                      {p.close ? (
                        <span className={`block text-xs ${p.close.clv >= 0 ? "text-good" : "text-serious"}`}>
                          {p.close.odds ? `luk ${p.close.odds.toFixed(2).replace(".", ",")} · ` : ""}CLV {signedPct(p.close.clv)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      <p className="text-xs text-muted">
        Kilde: {t.dataLabel}. Hjørnespark, kort, frispark og 1. halvleg afgøres, når kampstatistikken er hentet, typisk et par dage efter kampen. Gevinst regnes kun for
        bets med en bookmakerodds.
      </p>
    </div>
  );
}
