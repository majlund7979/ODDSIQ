import Link from "next/link";
import { requireFriend } from "@/lib/auth/friends";
import { byDay, resultsContext, roiLabel, ROI_MIN, summarise, type RecordedPick } from "@/lib/picks-extra";
import { brier, calibration, CALIBRATION_MIN, CALIBRATION_VERSION } from "@/lib/picks-calibration";
import { terminal } from "@/lib/terminal";
import { HitBars, ProfitBars, Tile } from "@/components/picks/charts";
import { capitalize, krFromUnits, pctOrDash, pctTight, signedPct } from "@/lib/format";
import { CLV_VERSION } from "@/lib/real/clv";
import { CATEGORY_LABEL } from "@/lib/pick-categories";
import { SHARP_VERSION } from "@/lib/sharp";
import { lookup, one, type SearchParams } from "@/lib/url";
import { adjustmentLabel, LEARN_DAYS, LEARN_MIN, LEARNING_VERSION, learn, type CategoryLearning } from "@/lib/picks-learning";

export const metadata = { title: "Resultater · Oddsanalyse" };

function dayLabel(day: string) {
  return capitalize(new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));
}

function Mark({ r }: { r: RecordedPick["result"] }) {
  if (r === "won") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-good/20 text-sm font-bold text-good">✓</span>;
  if (r === "lost") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-critical/20 text-sm font-bold text-critical">✗</span>;
  return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs text-muted">…</span>;
}

function adjustment(l: CategoryLearning | undefined): string {
  if (!l) return "—";
  if (!l.learning) return `lærer (${l.hitRate.n}/${LEARN_MIN})`;
  return `${adjustmentLabel(l.adjustmentPp)} point`;
}

export default async function ResultsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireFriend("/picks/resultater");
  const t = await terminal();
  const q = await searchParams;
  const all = await t.recordedPicks();
  const raw = one(q.type);
  const type = raw && lookup(CATEGORY_LABEL, raw) ? raw : "bedste";
  const picks = all.filter((p) => p.category === type);
  const total = summarise(picks);
  const byCat = Object.keys(CATEGORY_LABEL).map((c) => ({ id: c, s: summarise(all.filter((p) => p.category === c)) }));
  const days = [...new Set(picks.map((p) => p.day))];
  const chartDays = byDay(picks);
  const context = resultsContext(picks, t.dataLabel, type === "bedste" ? SHARP_VERSION : LEARNING_VERSION);
  const history = await t.recordedPicks(LEARN_DAYS);
  const learning = learn(history, t.dataLabel);
  const cal = calibration(history);
  const score = brier(history);

  const pickKr = (p: RecordedPick) => (p.result && p.odds ? krFromUnits(p.result === "won" ? p.odds - 1 : -1) : null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-5 rounded-[28px] border border-line bg-gradient-to-br from-accent/15 to-surface px-4 py-5 sm:px-10 sm:py-8">
        <div className="space-y-2">
          <Link href="/picks" className="text-sm text-muted hover:text-ink">
            ← Dagens bedste bets
          </Link>
          <h1 className="display text-[40px] text-ink sm:text-5xl">Vores resultater</h1>
          <p className="max-w-2xl text-[15px] text-ink-2">
            Sådan gik vores forudsigelser de sidste 7 dage. Hvert bet tælles første gang, det blev vist, også dem der tabte.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Gik hjem">
            <div className="num text-3xl font-extrabold tracking-[-0.02em]">{total.settled ? pctTight(total.won / total.settled) : "—"}</div>
            <div className="mt-1 text-sm text-ink-2">{total.settled ? `${total.won} af ${total.settled} · forventet ${pctOrDash(total.expectedRate)}` : "Ingen afgjorte endnu"}</div>
          </Tile>
          <Tile label="Gevinst, 100 kr pr. bet">
            <div className={`num text-3xl font-extrabold tracking-[-0.02em] ${total.withOdds ? (total.profit >= 0 ? "text-good" : "text-serious") : "text-muted"}`}>
              {total.withOdds ? krFromUnits(total.profit) : "—"}
            </div>
            <div className="mt-1 text-sm text-ink-2">
              {total.withOdds ? (total.withOdds < ROI_MIN ? `${total.withOdds} bets med odds, for få til at sige noget sikkert` : `Afkast ${roiLabel(total)} på ${total.withOdds} bets`) : "Ingen bets med odds"}
            </div>
          </Tile>
          <Tile label="Ramte pr. dag">
            {chartDays.length ? <HitBars days={chartDays} /> : <div className="text-sm text-ink-2">Ingen afgjorte bets endnu.</div>}
          </Tile>
          <Tile label="Gevinst pr. dag">
            {chartDays.length ? <ProfitBars days={chartDays} /> : <div className="text-sm text-ink-2">Ingen afgjorte bets endnu.</div>}
          </Tile>
        </div>
        <p className="text-xs text-muted">
          {CATEGORY_LABEL[type]} · {context}. Søjlerne er andelen, der gik hjem pr. dag (stregen er det, vi regnede med), og gevinsten pr. dag.
          {type === "bedste" && " Bedste bets tæller kun bets efter den nuværende regel (Pinnacles pris mod bet365 og bwin); bets efter de tidligere regler er ikke med. CLV måles mod bookmakernes median-lukkepris, ikke Pinnacles."}
        </p>
      </header>

      <nav aria-label="Bet-type" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {byCat.map(({ id, s }) => (
          <Link
            key={id}
            href={`/picks/resultater?type=${id}`}
            scroll={false}
            aria-current={id === type ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${id === type ? "border-accent bg-accent/20 font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:text-ink"}`}
          >
            {CATEGORY_LABEL[id]}
            <span className="num ml-1.5 text-xs text-muted">{s.settled ? pctTight(s.won / s.settled) : "—"}</span>
          </Link>
        ))}
      </nav>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{CATEGORY_LABEL[type]}, dag for dag</h2>
        {days.length === 0 ? (
          <div className="rounded-[20px] border border-line bg-surface px-6 py-10 text-center text-sm text-ink-2">
            Ingen afgjorte bets endnu. Resultaterne kommer, når de første kampe er spillet.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {days.map((day) => {
              const list = picks.filter((p) => p.day === day);
              const s = summarise(list);
              return (
                <section key={day} className="overflow-hidden rounded-[20px] border border-line bg-surface">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <span className="font-semibold">{dayLabel(day)}</span>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-ink-2">{s.settled ? `${s.won} af ${s.settled}` : "afventer"}</span>
                      {s.withOdds > 0 && <span className={`num rounded-full px-2 py-0.5 text-xs font-semibold ${s.profit >= 0 ? "bg-good/15 text-good" : "bg-critical/15 text-serious"}`}>{krFromUnits(s.profit)}</span>}
                    </span>
                  </div>
                  <ul className="divide-y divide-line">
                    {list.map((p) => {
                      const money = pickKr(p);
                      return (
                        <li key={`${p.match}|${p.outcome}`} className="flex items-center gap-3 px-4 py-2.5">
                          <Mark r={p.result} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.outcome}</span>
                            <span className="block truncate text-xs text-muted">
                              {p.match.replace(" vs ", " – ")} · {p.league}
                            </span>
                          </span>
                          <span className="num shrink-0 text-right text-xs text-ink-2">
                            <span className="block">
                              {Math.round(p.probability * 100)} %{p.odds ? ` · ${p.odds.toFixed(2).replace(".", ",")}` : ""}
                            </span>
                            {money && <span className={`block font-semibold ${p.result === "won" ? "text-good" : "text-serious"}`}>{money}</span>}
                            {p.close && (
                              <span className={`block ${p.close.clv >= 0 ? "text-good" : "text-serious"}`} title={p.close.odds ? `Lukkeodds ${p.close.odds.toFixed(2).replace(".", ",")}` : undefined}>
                                CLV {signedPct(p.close.clv)}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Alle bet-typer</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {byCat.map(({ id, s }) => {
            const rate = s.settled ? s.won / s.settled : NaN;
            return (
              <Link
                key={id}
                href={`/picks/resultater?type=${id}`}
                scroll={false}
                className={`rounded-[18px] border px-4 py-3 transition-colors ${id === type ? "border-accent bg-surface-2" : "border-line bg-surface hover:border-ink-2"}`}
              >
                <div className="truncate text-sm font-medium">{CATEGORY_LABEL[id]}</div>
                <div className="num mt-1 text-2xl font-extrabold">{s.settled ? pctTight(rate) : "—"}</div>
                <div className="relative mt-2 h-1.5 rounded-full bg-surface-3">
                  {s.settled > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.round(rate * 100)}%` }} />}
                  {Number.isFinite(s.expectedRate) && <div className="absolute -top-1 h-3.5 w-0.5 bg-ink" style={{ left: `${Math.round(s.expectedRate * 100)}%` }} title="Forventet" />}
                </div>
                <div className="num mt-2 flex justify-between gap-2 text-xs">
                  <span className="text-muted">{s.settled ? `${s.won}/${s.settled}` : "ingen"}</span>
                  <span className={s.withOdds ? (s.profit >= 0 ? "text-good" : "text-serious") : "text-muted"}>{s.withOdds ? krFromUnits(s.profit) : "ingen odds"}</span>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-muted">Bjælken er andelen, der gik hjem. Den lodrette streg er det, vi regnede med. Gevinst ved 100 kr pr. bet, kun bets med odds. Historisk, sidste 7 dage, {t.dataLabel}.</p>
      </section>

      <details className="group rounded-[20px] border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-semibold">Flere tal</span>
            <span className="block text-xs text-ink-2">Lukkeodds (CLV), hvordan modellen lærer, og om procenterne holder</span>
          </span>
          <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="space-y-6 border-t border-line px-5 py-5">
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Slog vi lukkeoddsen? <span className="font-normal text-muted">{CATEGORY_LABEL[type]}</span></h3>
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

          <section className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold">Pr. bet-type</h3>
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-normal">Type</th>
                  <th className="px-3 py-2 text-right font-normal">Forventet</th>
                  <th className="px-3 py-2 text-right font-normal" title="Gevinst i procent af det, der er satset">Afkast</th>
                  <th className="px-3 py-2 text-right font-normal" title="Gennemsnitlig CLV mod lukkeoddsen">CLV</th>
                  <th className="py-2 pl-3 text-right font-normal" title="Hvor meget modellen har justeret procenterne ud fra resultaterne">Justering</th>
                </tr>
              </thead>
              <tbody className="num">
                {byCat.map(({ id, s }) => (
                  <tr key={id} className={`border-t border-line ${id === type ? "bg-surface-2" : ""}`}>
                    <td className="py-2 pr-3 font-sans">{CATEGORY_LABEL[id]}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{pctOrDash(s.expectedRate)}</td>
                    <td className={`px-3 py-2 text-right ${!s.withOdds || s.withOdds < ROI_MIN ? "text-muted" : s.roi >= 0 ? "text-good" : "text-serious"}`}>
                      {!s.withOdds ? "—" : s.withOdds < ROI_MIN ? "for få" : roiLabel(s)}
                    </td>
                    <td className={`px-3 py-2 text-right ${s.withClose ? (s.clv >= 0 ? "text-good" : "text-serious") : "text-muted"}`}>{s.withClose ? signedPct(s.clv) : "—"}</td>
                    <td className="py-2 pl-3 text-right text-ink-2">{adjustment(learning.get(id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Justering: modellen sammenligner, hvor ofte hver bet-type har ramt, med hvad den regnede med, og retter procenterne lidt til. Den lærer først, når en type
              har {LEARN_MIN} afgjorte bets, og jo flere bets, jo mere stoler den på dem. Bygger på de sidste {LEARN_DAYS} dage (historisk, {t.dataLabel}, {LEARNING_VERSION}).
            </p>
          </section>

          <section className="overflow-x-auto">
            <h3 className="text-sm font-semibold">Holder procenterne?</h3>
            <p className="mt-1 text-xs text-ink-2">Går vores 70 %-bets hjem 70 % af gangene? Alle bet-typer, sidste {LEARN_DAYS} dage.</p>
            {cal.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-2">Ingen afgjorte bets endnu.</p>
            ) : (
              <table className="mt-2 w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-normal">Vi sagde</th>
                    <th className="px-3 py-2 text-right font-normal">Bets</th>
                    <th className="px-3 py-2 text-right font-normal">Snit</th>
                    <th className="px-3 py-2 text-right font-normal">Gik hjem</th>
                    <th className="py-2 pl-3 text-right font-normal" title="1 / bedste odds, et skøn der stadig rummer lidt bookmakeravance">Bookmakerne</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {cal.map((r) => {
                    const gap = r.hitRate - r.stated;
                    const few = r.n < CALIBRATION_MIN;
                    return (
                      <tr key={r.from} className="border-t border-line">
                        <td className="py-2 pr-3 font-sans">
                          {Math.round(r.from * 100)}–{Math.round(r.to * 100)} %
                        </td>
                        <td className="px-3 py-2 text-right text-ink-2">{r.n}</td>
                        <td className="px-3 py-2 text-right">{pctOrDash(r.stated)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${few ? "text-muted" : Math.abs(gap) <= 0.05 ? "text-good" : "text-serious"}`}>
                          {pctOrDash(r.hitRate)}
                          {few && <span className="block text-[10px] font-normal">for få bets</span>}
                        </td>
                        <td className="py-2 pl-3 text-right text-ink-2">{r.withOdds ? pctOrDash(r.market) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-muted">
              Grønt: højst 5 point fra det, vi sagde. Bookmakerne er 1 / bedste odds, et skøn med lidt avance i. Grupper under {CALIBRATION_MIN} bets er for små til at sige noget sikkert.
              {score
                ? ` Samlet præcision (Brier, lavere er bedre) på ${score.n} bets med odds: os ${score.ours.toFixed(3).replace(".", ",")}, bookmakerne ${score.market.toFixed(3).replace(".", ",")}.`
                : ""}{" "}
              Historisk, kilde {t.dataLabel}, {CALIBRATION_VERSION}.
            </p>
          </section>
        </div>
      </details>

      <p className="text-xs text-muted">
        Kilde: {t.dataLabel}. Hjørnespark, kort, frispark og 1. halvleg afgøres, når kampstatistikken er hentet, typisk et par dage efter kampen. Gevinst regnes kun for
        bets med en bookmakerodds.
      </p>
    </div>
  );
}
