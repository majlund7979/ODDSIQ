import Link from "next/link";
import { requireFriend } from "@/lib/auth/friends";
import { byDay, resultsContext, roiLabel, ROI_MIN, summarise, type RecordedPick } from "@/lib/picks-extra";
import { brier, calibration, CALIBRATION_MIN, CALIBRATION_VERSION } from "@/lib/picks-calibration";
import { terminal } from "@/lib/terminal";
import { HitBars, ProfitBars, Tile } from "@/components/picks/charts";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { capitalize, krFromUnits, pctOrDash, pctTight, signedPct } from "@/lib/format";
import { CLV_VERSION } from "@/lib/real/clv";
import { CATEGORY_LABEL } from "@/lib/pick-categories";
import { lookup, one, type SearchParams } from "@/lib/url";
import { adjustmentLabel, LEARN_DAYS, LEARN_MIN, LEARNING_VERSION, learn, recordVersion, type CategoryLearning } from "@/lib/picks-learning";

export const metadata = { title: "Resultater · Oddsanalyse" };

function dayLabel(day: string) {
  return capitalize(new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));
}

function Mark({ r }: { r: RecordedPick["result"] }) {
  if (r === "won") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-good/15 text-sm font-bold text-good">✓</span>;
  if (r === "lost") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-critical/15 text-sm font-bold text-critical">✗</span>;
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
  // The week with closing lines for the board, 90 days without them for the learning and calibration.
  const [all, history] = await Promise.all([t.recordedPicks(), t.recordedPicks(LEARN_DAYS, { close: false })]);
  const raw = one(q.type);
  const type = raw && lookup(CATEGORY_LABEL, raw) ? raw : "bedste";
  const picks = all.filter((p) => p.category === type);
  const total = summarise(picks);
  const byCat = Object.keys(CATEGORY_LABEL).map((c) => ({ id: c, s: summarise(all.filter((p) => p.category === c)) }));
  const days = [...new Set(picks.map((p) => p.day))];
  const chartDays = byDay(picks);
  const context = resultsContext(picks, t.dataLabel, recordVersion(type));
  const learning = learn(history, t.dataLabel);
  const cal = calibration(history);
  const score = brier(history);

  const pickKr = (p: RecordedPick) => (p.result && p.odds ? krFromUnits(p.result === "won" ? p.odds - 1 : -1) : null);

  return (
    <div className="space-y-10 lg:space-y-12">
      <PageHeader
        back={{ href: "/picks", label: "Dagens bedste bets" }}
        title="Vores resultater"
        intro="Sådan gik vores forudsigelser de sidste 7 dage. Hvert bet tælles første gang, det blev vist, også dem der tabte."
      />

      <section aria-label={`${CATEGORY_LABEL[type]}, samlet`} className="rise space-y-3 [--i:1]">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Tile bare label="Gik hjem" className="bg-surface">
            <div className="figure text-[44px]">{total.settled ? pctTight(total.won / total.settled) : "—"}</div>
            <div className="mt-2 text-sm text-ink-2">{total.settled ? `${total.won} af ${total.settled} · forventet ${pctOrDash(total.expectedRate)}` : "Ingen afgjorte endnu"}</div>
          </Tile>
          <Tile bare label="Gevinst, 100 kr pr. bet" className="bg-surface">
            <div className={`figure text-[44px] ${total.withOdds && total.withOdds >= ROI_MIN ? (total.profit >= 0 ? "text-good" : "text-serious") : total.withOdds ? "text-ink" : "text-muted"}`}>
              {total.withOdds ? krFromUnits(total.profit) : "—"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              {total.withOdds ? (
                total.withOdds < ROI_MIN ? (
                  <>
                    {total.withOdds} bets med odds <Badge tone="warning">Lille datagrundlag</Badge>
                  </>
                ) : (
                  `Afkast ${roiLabel(total)} på ${total.withOdds} bets`
                )
              ) : (
                "Ingen bets med odds"
              )}
            </div>
          </Tile>
          <Tile bare label="Ramte pr. dag" className="bg-surface">
            {chartDays.length ? <HitBars days={chartDays} /> : <div className="text-sm text-ink-2">Ingen afgjorte bets endnu.</div>}
          </Tile>
          <Tile bare label="Gevinst pr. dag" className="bg-surface">
            {chartDays.length ? <ProfitBars days={chartDays} /> : <div className="text-sm text-ink-2">Ingen afgjorte bets endnu.</div>}
          </Tile>
        </div>
        <p className="text-xs leading-relaxed text-ink-2/80">
          {CATEGORY_LABEL[type]} · {context}. Søjlerne er andelen, der gik hjem pr. dag (den gule streg er det, vi regnede med), og gevinsten pr. dag.
          {type === "bedste" && " Bedste bets tæller kun bets efter den nuværende regel (Pinnacles pris mod bet365 og bwin); bets efter de tidligere regler er ikke med. CLV måles mod bookmakernes median-lukkepris, ikke Pinnacles."}
        </p>
      </section>

      <section aria-labelledby="typer" className="space-y-3">
        <h2 id="typer" className="eyebrow">
          Vælg bet-type
        </h2>
        <nav aria-label="Bet-type" className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scroll-fade-x [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 sm:[mask-image:none] lg:grid-cols-6">
          {byCat.map(({ id, s }, k) => {
            const rate = s.settled ? s.won / s.settled : NaN;
            const on = id === type;
            return (
              <Link
                key={id}
                href={`/picks/resultater?type=${id}`}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`w-40 shrink-0 snap-start rounded-card border px-4 py-3.5 transition-colors sm:w-auto ${k === 0 && byCat.length % 6 === 5 ? "lg:col-span-2" : ""} ${on ? "border-accent/60 bg-accent-soft" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"}`}
              >
                <div className={`truncate text-sm font-semibold ${on ? "text-accent" : "text-ink"}`}>{CATEGORY_LABEL[id]}</div>
                <div className="figure mt-2 text-3xl">{s.settled ? pctTight(rate) : "—"}</div>
                <div className="relative mt-3 h-1 rounded-full bg-surface-3">
                  {s.settled > 0 && <div className="grow-x absolute inset-y-0 left-0 rounded-full bg-ink/85" style={{ width: `${Math.round(rate * 100)}%` }} />}
                  {Number.isFinite(s.expectedRate) && <div className="absolute -top-1 h-3 w-0.5 rounded bg-accent" style={{ left: `${Math.round(s.expectedRate * 100)}%` }} title="Forventet" />}
                </div>
                <div className="num mt-2.5 flex justify-between gap-2 text-xs">
                  <span className="text-ink-2">{s.settled ? `${s.won}/${s.settled}` : "ingen"}</span>
                  <span className={s.withOdds ? (s.withOdds < ROI_MIN ? "text-ink-2" : s.profit >= 0 ? "text-good" : "text-serious") : "text-ink-2"}>{s.withOdds ? krFromUnits(s.profit) : "ingen odds"}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        <p className="text-xs leading-relaxed text-ink-2/80">
          Bjælken er andelen, der gik hjem. Den gule streg er det, vi regnede med. Gevinst ved 100 kr pr. bet, kun bets med odds. Historisk, sidste 7 dage, {t.dataLabel}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="display text-[34px] sm:text-[40px]">{CATEGORY_LABEL[type]}, dag for dag</h2>
        {days.length === 0 ? (
          <EmptyState title="Ingen afgjorte bets endnu" text="Resultaterne kommer, når de første kampe er spillet." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {days.map((day) => {
              const list = picks.filter((p) => p.day === day);
              const s = summarise(list);
              return (
                <section key={day} className="overflow-hidden rounded-card border border-line bg-surface">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                    <h3 className="font-semibold">{dayLabel(day)}</h3>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-ink-2">{s.settled ? `${s.won} af ${s.settled}` : "afventer"}</span>
                      {s.withOdds > 0 && <span className={`num rounded-full px-2 py-0.5 text-xs font-semibold ${s.profit >= 0 ? "bg-good/15 text-good" : "bg-critical/15 text-critical"}`}>{krFromUnits(s.profit)}</span>}
                    </span>
                  </div>
                  <ul className="divide-y divide-line">
                    {list.map((p) => {
                      const money = pickKr(p);
                      return (
                        <li key={`${p.match}|${p.outcome}`} className="flex items-center gap-3 px-5 py-3">
                          <Mark r={p.result} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.outcome}</span>
                            <span className="block truncate text-xs text-ink-2">
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

      <details className="group rounded-card border border-line bg-surface">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-4 transition-colors hover:bg-surface-2">
          <span>
            <span className="block font-semibold">Flere tal</span>
            <span className="block text-xs text-ink-2">Lukkeodds (CLV), hvordan modellen lærer, og om procenterne holder</span>
          </span>
          <svg viewBox="0 0 16 16" className="h-5 w-5 shrink-0 text-ink-2 transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 6l4 4 4-4" />
          </svg>
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

          <section>
            <h3 className="mb-2 text-sm font-semibold">Pr. bet-type</h3>
            <div className="scroll-fade-x overflow-x-auto">
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
                      <td className="whitespace-nowrap px-3 py-2 text-right text-ink-2">{pctOrDash(s.expectedRate)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right ${!s.withOdds || s.withOdds < ROI_MIN ? "text-muted" : s.roi >= 0 ? "text-good" : "text-serious"}`}>
                        {!s.withOdds ? "—" : s.withOdds < ROI_MIN ? "for få" : roiLabel(s)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right ${s.withClose ? (s.clv >= 0 ? "text-good" : "text-serious") : "text-muted"}`}>{s.withClose ? signedPct(s.clv) : "—"}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right text-ink-2">{adjustment(learning.get(id))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Justering: modellen sammenligner, hvor ofte hver bet-type har ramt, med hvad den regnede med, og retter procenterne lidt til. Den lærer først, når en type
              har {LEARN_MIN} afgjorte bets, og jo flere bets, jo mere stoler den på dem. Bygger på de sidste {LEARN_DAYS} dage (historisk, {t.dataLabel}, {LEARNING_VERSION}).
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Holder procenterne?</h3>
            <p className="mt-1 text-xs text-ink-2">Går vores 70 %-bets hjem 70 % af gangene? Alle bet-typer, sidste {LEARN_DAYS} dage.</p>
            {cal.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-2">Ingen afgjorte bets endnu.</p>
            ) : (
              <div className="scroll-fade-x mt-2 overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-2 pr-3 font-normal">Vi sagde</th>
                      <th className="px-3 py-2 text-right font-normal">Bets</th>
                      <th className="px-3 py-2 text-right font-normal">Snit</th>
                      <th className="px-3 py-2 text-right font-normal">Gik hjem</th>
                      <th className="py-2 pl-3 text-right font-normal" title="1 / bedste odds, et skøn der stadig rummer lidt bookmakeravance">Bookmakerne</th>
                    </tr>
                  </thead>
                  <tbody className="num whitespace-nowrap">
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
                            {few && <span className="block text-xs font-normal">for få bets</span>}
                          </td>
                          <td className="py-2 pl-3 text-right text-ink-2">{r.withOdds ? pctOrDash(r.market) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

      <p className="text-xs leading-relaxed text-ink-2/80">
        Kilde: {t.dataLabel}. Hjørnespark, kort, frispark og 1. halvleg afgøres, når kampstatistikken er hentet, typisk et par dage efter kampen. Gevinst regnes kun for
        bets med en bookmakerodds.
      </p>
    </div>
  );
}
