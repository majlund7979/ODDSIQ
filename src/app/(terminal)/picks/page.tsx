import Link from "next/link";
import { Suspense } from "react";
import { TeamNews } from "@/components/News";
import {
  analysedMatches,
  COUNT_CATEGORIES,
  countPicks,
  dailyPicks,
  GOAL_CATEGORIES,
  lineLabel,
  marketPicks,
  PICK_COUNTS,
  signedPp,
  type CountPick,
  type FormGame,
  type Pick,
} from "@/lib/picks";
import { requireFriend } from "@/lib/auth/friends";
import { explainPick } from "@/lib/picks-explain";
import { applyLearning, applyLearningToPicks, LEARN_DAYS, LEARN_MIN, learn, type CategoryLearning } from "@/lib/picks-learning";
import { correctScorePicks, coupons, doubleChancePicks, halfTimePicks, summarise, type Coupon, type ExtraPick } from "@/lib/picks-extra";
import { terminal } from "@/lib/terminal";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { oddsMove } from "@/lib/picks-advice";
import { openBetKeys } from "@/lib/real/friend-bets";
import { AdviceRow, OddsMoveTag, RiskBadge, type SaveTarget } from "@/components/picks/Advice";
import { BankrollInput } from "@/components/picks/BankrollInput";
import { HitRates } from "@/components/picks/HitRates";

export const metadata = { title: "Dagens bedste bets · Oddsanalyse" };

const TZ = "Europe/Copenhagen";
const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: TZ });
const clock = (t: number) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const dec = (x: number, d = 2) => x.toFixed(d).replace(".", ",");

function kickoffLabel(t: number, now: number) {
  const day = dayKey(t) === dayKey(now) ? "I dag" : dayKey(t) === dayKey(now + 86_400_000) ? "I morgen" : new Date(t).toLocaleDateString("da-DK", { weekday: "long", timeZone: TZ });
  return `${day} kl. ${clock(t)}`;
}


function Gauge({ p }: { p: number }) {
  const pct = Math.round(p * 100);
  return (
    <div className="w-24 shrink-0 text-center">
      <div className="num text-3xl font-semibold leading-none text-ink">{pct}%</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className={`h-full rounded-full ${p >= 0.7 ? "bg-good" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-muted">chance</div>
    </div>
  );
}

/** League, kickoff and risk level above the team names on every card. */
function CardTop({ rank, league, kickoff, probability, now }: { rank: number; league: string; kickoff: number; probability: number; now: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink">{rank}</span>
      <span>{league}</span>
      <span aria-hidden>·</span>
      <span>{kickoffLabel(kickoff, now)}</span>
      <RiskBadge p={probability} className="ml-auto sm:ml-2" />
    </div>
  );
}

function NewsBlock({ home, away, now }: { home: string; away: string; now: number }) {
  return (
    <div className="space-y-2.5 border-t border-line pt-5 md:col-span-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Nyheder om holdene</div>
      <Suspense fallback={<p className="text-sm text-muted">Henter nyheder…</p>}>
        <TeamNews home={home} away={away} now={now} />
      </Suspense>
    </div>
  );
}

function MoreToggle() {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-center gap-2 border-t border-line px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
      <span className="group-open:hidden">Hvorfor? Se analysen</span>
      <span className="hidden group-open:inline">Skjul analysen</span>
      <span className="transition-transform group-open:rotate-180" aria-hidden>
        ▾
      </span>
    </summary>
  );
}

function FormRow({ team, games }: { team: string; games: FormGame[] }) {
  const tone = { V: "bg-good text-page", U: "bg-surface-3 text-ink-2", T: "bg-critical text-ink" };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-ink-2">{team}</span>
      <span className="flex shrink-0 gap-1">
        {games.length === 0 && <span className="text-muted">ingen data</span>}
        {[...games].reverse().map((g, i) => (
          <span key={i} title={`${g.home ? "Hjemme" : "Ude"} mod ${g.opponent}: ${g.score}`} className={`num flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${tone[g.result]}`}>
            {g.result}
          </span>
        ))}
      </span>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function LearningNote({ l }: { l: CategoryLearning }) {
  const n = l.hitRate.n;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
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
        Historisk, {l.hitRate.periodFrom ? new Date(l.hitRate.periodFrom).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ }) : ""}
        {l.hitRate.periodTo ? `–${new Date(l.hitRate.periodTo).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ })}` : ""} · {l.hitRate.source} ·{" "}
        {l.hitRate.modelVersion}
      </span>
    </div>
  );
}

function Analysis({ p, home, away, now }: { p: Pick; home: string; away: string; now: number }) {
  const move = oddsMove(p.insights.movement, p.row.openingOdds, p.row.currentOdds);
  const i = p.insights;
  const maxPp = Math.max(4, ...p.factors.map((f) => Math.abs(f.pp ?? 0)));
  return (
    <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Hvorfor dette bet</div>
        {explainPick(p).map((s, k) => (
          <p key={k} className="text-[15px] leading-relaxed text-ink-2">
            {s}
          </p>
        ))}
      </div>
      <div className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Sådan er procenten regnet ud</div>
        <ul className="space-y-3">
          {p.factors.map((f) => (
            <li key={f.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{f.label}</span>
                {f.pp !== null && <span className={`num text-xs ${Math.abs(f.pp) < 0.05 ? "text-muted" : f.pp > 0 ? "text-good" : "text-serious"}`}>{signedPp(f.pp)}</span>}
              </div>
              {f.pp !== null && (
                <div className="relative h-1.5 rounded bg-surface-3">
                  <span className="absolute top-0 left-1/2 h-1.5 w-px bg-line-strong" />
                  <span
                    className={`absolute top-0 h-1.5 rounded ${f.pp >= 0 ? "bg-good" : "bg-serious"}`}
                    style={f.pp >= 0 ? { left: "50%", width: `${(f.pp / maxPp) * 50}%` } : { right: "50%", width: `${(-f.pp / maxPp) * 50}%` }}
                  />
                </div>
              )}
              <div className="text-xs text-ink-2">{f.detail}</div>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-sm">
          <span className="font-semibold">Samlet chance</span>
          <span className="num font-semibold text-accent">{Math.round(p.probability * 100)}%</span>
        </div>
      </div>

      <div className="space-y-5">
        {i.expectedGoals && (
          <Fact label="Forventede mål">
            <div className="flex items-center gap-3">
              <span className="num text-lg font-semibold">{dec(i.expectedGoals.home, 1)}</span>
              <div className="flex h-2 flex-1 overflow-hidden rounded bg-surface-3">
                <span className="bg-accent" style={{ width: `${(i.expectedGoals.home / (i.expectedGoals.home + i.expectedGoals.away)) * 100}%` }} />
                <span className="flex-1 bg-model/70" />
              </div>
              <span className="num text-lg font-semibold">{dec(i.expectedGoals.away, 1)}</span>
            </div>
          </Fact>
        )}
        {i.elo && (
          <Fact label="Holdstyrke (Elo)">
            <span className="num">{i.elo.home}</span> mod <span className="num">{i.elo.away}</span>
            <span className="text-ink-2">
              {" · "}
              {Math.abs(i.elo.home - i.elo.away) < 25 ? "jævnbyrdige hold" : `${i.elo.home > i.elo.away ? home : away} er ${Math.abs(i.elo.home - i.elo.away)} point stærkere`}
            </span>
          </Fact>
        )}
        {i.form && (
          <Fact label="Form, seneste 5 kampe">
            <div className="space-y-1.5">
              <FormRow team={home} games={i.form.home} />
              <FormRow team={away} games={i.form.away} />
            </div>
          </Fact>
        )}
        {i.h2h && (
          <Fact label={`Indbyrdes, seneste ${i.h2h.games.length}`}>
            {home}: <span className="text-good">{i.h2h.home} sejre</span>, {i.h2h.draw} uafgjort, <span className="text-serious">{i.h2h.away} nederlag</span>
            <div className="num mt-1 text-xs text-muted">{i.h2h.games.map((g) => g.score).join(" · ")}</div>
          </Fact>
        )}
        <Fact label="Oddsen">
          {move ? (
            <>
              {move.fact}
              <div className="text-xs text-ink-2">{move.maybe}</div>
            </>
          ) : (
            "Stort set uændret siden markedet åbnede."
          )}
          <div className="text-xs text-muted">
            {p.row.booksQuoting} bookmakere · fair odds efter vores procent: {dec(p.fairOdds)}
          </div>
        </Fact>
        <Fact label="Startopstilling">{i.lineupsConfirmed ? "Bekræftet for begge hold." : "Ikke meldt endnu. Kommer typisk en time før kampstart."}</Fact>
      </div>
      <NewsBlock home={home} away={away} now={now} />
    </div>
  );
}

function PickCard({ p, rank, now, save }: { p: Pick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <h2 className="text-lg font-semibold leading-tight sm:text-xl">
            {home} <span className="text-muted">–</span> {away}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Vores bud</span>
            <span className="rounded-lg bg-accent/15 px-3 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
            {p.value && <span className="rounded-full border border-good/40 bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">Værdi</span>}
            <OddsMoveTag row={p.row} />
            {p.lineupsConfirmed && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2">Opstilling bekræftet</span>}
            {p.marketOnly && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2" title="Ingen kampresultater for ligaen endnu, så procenten er bookmakernes">Kun odds</span>}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <div className="min-w-[88px] rounded-lg border border-line bg-surface-2 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Bedste odds</div>
            <div className="num text-2xl font-semibold">{dec(p.row.bestOdds)}</div>
            <div className="truncate text-[11px] text-ink-2">{p.row.bestBook}</div>
          </div>
        </div>
      </div>
      <AdviceRow p={p.probability} odds={p.row.bestOdds} eventId={p.row.eventId} save={save} />
      <details className="group">
        <MoreToggle />
        <Analysis p={p} home={home} away={away} now={now} />
      </details>
    </article>
  );
}

function CountCard({ p, rank, now, save }: { p: CountPick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  const f = p.forecast;
  const leagueAvg = f.league.homeMean + f.league.awayMean;
  const vs = Math.round(f.suggestion.vsLeague * 100);
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <h2 className="text-lg font-semibold leading-tight sm:text-xl">
            {home} <span className="text-muted">–</span> {away}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-accent/15 px-3 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
            <span className="text-sm text-ink-2">
              Forventet <span className="num font-semibold text-ink">{dec(f.expected.total, 1)}</span> · {vs === 0 ? "som ligasnittet" : `${Math.abs(vs)} % ${vs > 0 ? "over" : "under"} ligasnittet`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <div className="min-w-[96px] rounded-lg border border-line bg-surface-2 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Linjen</div>
            <div className="num text-2xl font-semibold">{lineLabel(f.fairLine)}</div>
            <div className="text-[11px] text-ink-2">fair odds {dec(p.fairOdds)}</div>
          </div>
        </div>
      </div>
      <AdviceRow p={p.probability} odds={null} eventId={p.row.eventId} save={save} />
      <details className="group">
        <MoreToggle />
        <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-2">
          <div className="space-y-5">
            <Fact label={`Forventede ${p.unit}`}>
              <div className="flex items-center gap-3">
                <span className="num text-lg font-semibold">{dec(f.expected.home, 1)}</span>
                <div className="flex h-2 flex-1 overflow-hidden rounded bg-surface-3">
                  <span className="bg-accent" style={{ width: `${(f.expected.home / f.expected.total) * 100}%` }} />
                  <span className="flex-1 bg-model/70" />
                </div>
                <span className="num text-lg font-semibold">{dec(f.expected.away, 1)}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                I alt {dec(f.expected.total, 1)} · ligasnit {dec(leagueAvg, 1)} ({f.league.matches} kampe)
              </div>
            </Fact>
            <Fact label="Pr. kamp, seneste kampe">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-1 font-normal">Hold</th>
                    <th className="pb-1 text-right font-normal">For</th>
                    <th className="pb-1 text-right font-normal">Imod</th>
                    <th className="pb-1 text-right font-normal">Kampe</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {[
                    { team: home, r: f.rates.home },
                    { team: away, r: f.rates.away },
                  ].map(({ team, r }) => (
                    <tr key={team} className="border-t border-line">
                      <td className="py-1.5 font-sans text-ink-2">{team}</td>
                      <td className="py-1.5 text-right">{dec(r.forAvg, 1)}</td>
                      <td className="py-1.5 text-right">{dec(r.againstAvg, 1)}</td>
                      <td className="py-1.5 text-right text-muted">{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.stat === "fouls" && <div className="mt-1 text-xs text-muted">&quot;For&quot; er frispark holdet begår, &quot;imod&quot; er frispark det får.</div>}
            </Fact>
            {p.stat === "cards" && (
              <Fact label="Dommer">
                {f.referee ? (
                  <>
                    {f.referee.name}: <span className="num">{dec(f.referee.cardsPerMatch, 1)}</span> kort pr. kamp i {f.referee.n} kampe, ligasnit{" "}
                    <span className="num">{dec(f.referee.leagueCardsPerMatch, 1)}</span>.
                    <div className="text-xs text-muted">
                      {Math.abs(f.referee.factor - 1) < 0.03
                        ? "Dommeren ændrer ikke forventningen."
                        : `Forventede kort er ${f.referee.factor > 1 ? "skruet op" : "skruet ned"} med ${Math.round(Math.abs(f.referee.factor - 1) * 100)} % for dommeren.`}
                    </div>
                  </>
                ) : (
                  <span className="text-ink-2">Dommeren er ikke meldt endnu, eller vi har ikke hans kampe.</span>
                )}
              </Fact>
            )}
          </div>
          <Fact label="Hvor ligger linjen">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1 font-normal">Linje</th>
                  <th className="pb-1 text-right font-normal">Over</th>
                  <th className="pb-1 text-right font-normal">Fair odds</th>
                  <th className="pb-1 text-right font-normal">Under</th>
                  <th className="pb-1 text-right font-normal">Fair odds</th>
                </tr>
              </thead>
              <tbody className="num">
                {f.lines.map((l) => (
                  <tr key={l.line} className={`border-t border-line ${l.line === f.fairLine ? "bg-surface-2 font-semibold" : ""} ${l.line === f.suggestion.line ? "text-accent" : ""}`}>
                    <td className="py-1.5">{lineLabel(l.line)}</td>
                    <td className="py-1.5 text-right">{Math.round(l.over * 100)}%</td>
                    <td className="py-1.5 text-right">{dec(1 / Math.max(l.over, 0.01))}</td>
                    <td className="py-1.5 text-right">{Math.round(l.under * 100)}%</td>
                    <td className="py-1.5 text-right">{dec(1 / Math.max(l.under, 0.01))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-2">
              Den fremhævede række er linjen, hvor over og under er tættest på 50/50. Spil kun, hvis bookmakeren giver en højere odds end fair odds for samme
              linje.
            </p>
          </Fact>
          <NewsBlock home={home} away={away} now={now} />
        </div>
      </details>
    </article>
  );
}

function ExtraCard({ p, rank, now, save }: { p: ExtraPick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <h2 className="text-lg font-semibold leading-tight sm:text-xl">
            {home} <span className="text-muted">–</span> {away}
          </h2>
          <span className="inline-block rounded-lg bg-accent/15 px-3 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <div className="min-w-[96px] rounded-lg border border-line bg-surface-2 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Fair odds</div>
            <div className="num text-2xl font-semibold">{dec(p.fairOdds)}</div>
            <div className="text-[11px] text-ink-2">spil over denne</div>
          </div>
        </div>
      </div>
      <AdviceRow p={p.probability} odds={null} eventId={p.row.eventId} save={save} />
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
          <NewsBlock home={home} away={away} now={now} />
        </div>
      </details>
    </article>
  );
}

function CouponCard({ coupons }: { coupons: Coupon[] }) {
  if (!coupons.length) return null;
  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Dagens kupon</h2>
        <span className="text-xs text-muted">De stærkeste bets lagt sammen. Alle skal gå hjem.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {coupons.map((c) => (
          <div key={c.picks.length} className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-semibold">{c.picks.length} bets</span>
              <span className="num text-sm">
                <span className="text-accent">{Math.round(c.probability * 100)}%</span> · odds {dec(c.odds)}
              </span>
            </div>
            <ul className="space-y-1 text-sm">
              {c.picks.map((p) => (
                <li key={p.row.selectionId} className="flex justify-between gap-3">
                  <span className="truncate">
                    {p.outcome} <span className="text-muted">· {p.row.match.replace(" vs ", " – ")}</span>
                  </span>
                  <span className="num shrink-0 text-ink-2">{dec(p.row.bestOdds)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-muted">100 kr giver {Math.round(c.odds * 100)} kr, hvis alle går hjem.</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const EXTRA: Record<string, (rows: Parameters<typeof doubleChancePicks>[0], now: number, n: number, ctx: Parameters<typeof doubleChancePicks>[3]) => ExtraPick[]> = {
  dobbelt: doubleChancePicks,
  resultat: correctScorePicks,
  halvleg: halfTimePicks,
};

const TABS = [
  { id: "bedste", label: "Bedste bets" },
  { id: "vinder", label: "Hvem vinder" },
  { id: "dobbelt", label: "Dobbeltchance" },
  { id: "maal", label: "Over/under 2,5 mål" },
  { id: "btts", label: "Begge hold scorer" },
  { id: "resultat", label: "Korrekt resultat" },
  { id: "halvleg", label: "1. halvleg" },
  ...COUNT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  { id: "straffe", label: "Straffespark" },
];

const MAIN_IDS = ["bedste", "vinder", "maal", "btts", "dobbelt"];
const MAIN_TABS = MAIN_IDS.map((id) => TABS.find((x) => x.id === id)!);
const MORE_TABS = TABS.filter((x) => !MAIN_IDS.includes(x.id));
const chip = (active: boolean) =>
  `flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-4 py-2 text-sm ${active ? "border-accent bg-accent/15 font-medium text-accent" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"}`;

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{text}</p>
    </div>
  );
}

const SAVED_FLASH: Record<string, string> = {
  ok: "Bettet er gemt i vennerligaen.",
  fejl: "Bettet blev ikke gemt. Tjek indsats og odds.",
  lukket: "Bettet kan ikke gemmes længere, fordi kampen er gået i gang eller ikke er på listen mere.",
};

export default async function PicksPage({ searchParams }: { searchParams: Promise<{ antal?: string; type?: string; gemt?: string }> }) {
  const user = await requireFriend();
  const t = await terminal();
  const q = await searchParams;
  const count = PICK_COUNTS.find((n) => String(n) === q.antal) ?? 10;
  const tab = TABS.find((x) => x.id === q.type)?.id ?? "bedste";
  const rows = t.marketRows();
  const goalCat = GOAL_CATEGORIES.find((c) => c.id === tab);
  const countCat = COUNT_CATEGORIES.find((c) => c.id === tab);
  const history = await t.recordedPicks(LEARN_DAYS);
  const allLearning = learn(history, t.dataLabel);
  const learned = allLearning.get(tab);
  const picks = applyLearningToPicks(tab === "bedste" ? dailyPicks(rows, t.now, count, t.pickContext) : goalCat ? marketPicks(rows, t.now, count, goalCat.market, t.pickContext) : [], learned);
  const cPicks = applyLearning(countCat ? countPicks(rows, t.now, count, countCat.stat, t.pickContext) : [], learned);
  const xPicks = applyLearning(EXTRA[tab] ? EXTRA[tab](rows, t.now, count, t.pickContext) : [], learned);
  const recent = tab === "bedste" ? summarise(history.filter((p) => p.category === "bedste" && p.kickoff >= t.now - 7 * 86_400_000)) : null;
  const href = (type: string, n: number) => `/picks?${new URLSearchParams({ ...(type !== "bedste" ? { type } : {}), ...(n !== 10 ? { antal: String(n) } : {}) })}`;
  const scope = analysedMatches(rows, t.now);
  const savedKeys = user ? await openBetKeys(db(), user.id, t.now) : new Set<string>();
  const back = href(tab, count);
  const saveFor = (eventId: string): SaveTarget | null =>
    tab === "straffe" ? null : { category: tab, back, saved: savedKeys.has(`${eventId}|${tab}`), signedIn: !!user, accounts: ACCOUNTS_ENABLED };
  const today = new Date(t.now).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted">{today.charAt(0).toUpperCase() + today.slice(1)}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Dagens bedste bets</h1>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-2">De udfald med størst chance for at gå hjem i kampene de næste 24 timer. Øverst er det sikreste.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          <BankrollInput />
          <nav aria-label="Antal bets" className="flex rounded-xl border border-line bg-surface p-1">
            {PICK_COUNTS.map((n) => (
              <Link
                key={n}
                href={href(tab, n)}
                scroll={false}
                aria-current={n === count ? "page" : undefined}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium ${n === count ? "bg-accent text-page" : "text-ink-2 hover:text-ink"}`}
              >
                Top {n}
              </Link>
            ))}
          </nav>
          </div>
        </div>
        <p className="text-xs text-muted">
          <span className="num">{scope.matches}</span> kampe i <span className="num">{scope.leagues}</span> {scope.leagues === 1 ? "liga" : "ligaer"} analyseret · odds opdateret kl.{" "}
          <span className="num">{clock(t.feedTime)}</span>
        </p>
      </header>

      <nav aria-label="Bet-type" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {MAIN_TABS.map((x) => (
          <Link key={x.id} href={href(x.id, count)} scroll={false} aria-current={x.id === tab ? "page" : undefined} className={chip(x.id === tab)}>
            {x.label}
          </Link>
        ))}
        <details className="group relative shrink-0">
          <summary className={`${chip(MORE_TABS.some((x) => x.id === tab))} cursor-pointer list-none`}>
            {MORE_TABS.find((x) => x.id === tab)?.label ?? "Flere"} <span aria-hidden>▾</span>
          </summary>
          <div className="fixed inset-x-4 z-20 mt-2 grid gap-1 rounded-2xl border border-line-strong bg-surface-2 p-2 shadow-2xl shadow-black/40 sm:absolute sm:inset-x-auto sm:right-0 sm:w-56">
            {MORE_TABS.map((x) => (
              <Link
                key={x.id}
                href={href(x.id, count)}
                scroll={false}
                aria-current={x.id === tab ? "page" : undefined}
                className={`rounded-xl px-3 py-2 text-sm ${x.id === tab ? "bg-accent/15 font-medium text-accent" : "text-ink-2 hover:bg-surface-3 hover:text-ink"}`}
              >
                {x.label}
              </Link>
            ))}
          </div>
        </details>
      </nav>

      {q.gemt && SAVED_FLASH[q.gemt] && (
        <div role="status" className={`rounded-2xl border px-4 py-3 text-sm ${q.gemt === "ok" ? "border-good/40 bg-good/10 text-good" : "border-warning/40 bg-warning/10 text-warning"}`}>
          {SAVED_FLASH[q.gemt]} {q.gemt === "ok" && <Link href="/picks/liga" className="underline">Se vennerligaen</Link>}
        </div>
      )}

      {tab === "bedste" && recent && recent.settled > 0 && (
        <Link href="/picks/resultater" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-good/30 bg-good/5 px-4 py-3 text-sm hover:bg-good/10">
          <span>
            Sidste 7 dage: <span className="font-semibold">{recent.won} af {recent.settled}</span> bets gik hjem ({Math.round((recent.won / recent.settled) * 100)} %)
            {recent.withOdds > 0 && (
              <>
                {" · "}
                <span className={recent.profit >= 0 ? "text-good" : "text-serious"}>
                  {recent.profit >= 0 ? "+" : "−"}
                  {Math.round(Math.abs(recent.profit) * 100)} kr
                </span>{" "}
                ved 100 kr pr. bet
              </>
            )}
          </span>
          <span className="text-ink-2">Se alle resultater →</span>
        </Link>
      )}

      <HitRates learning={allLearning} labels={TABS.filter((x) => x.id !== "straffe")} current={tab} days={LEARN_DAYS} source={t.dataLabel} />

      {EXTRA[tab] ? (
        xPicks.length === 0 ? (
          <Empty title="Ingen kampe at vise lige nu" text="Der er ingen fodboldkampe med en analyse de næste 24 timer. Kig forbi igen senere." />
        ) : (
          <ol className="space-y-4">
            {xPicks.map((p, i) => (
              <li key={p.row.eventId}>
                <ExtraCard p={p} rank={i + 1} now={t.now} save={saveFor(p.row.eventId)} />
              </li>
            ))}
          </ol>
        )
      ) : tab === "straffe" ? (
        <Empty
          title="Straffespark kommer senere"
          text="Vores kampdata har ikke straffespark med. Det kræver kamphændelser fra statistik-feedet (API-Football), som skal sættes op med STATS_API_KEY først."
        />
      ) : countCat ? (
        cPicks.length === 0 ? (
          <Empty
            title={`Ingen ${countCat.unit}-analyser lige nu`}
            text={`Der er ingen kampe de næste 24 timer, hvor vi har nok ${countCat.unit}-historik for begge hold. Data hentes automatisk fra football-data.co.uk.`}
          />
        ) : (
          <ol className="space-y-4">
            {cPicks.map((p, i) => (
              <li key={p.row.eventId}>
                <CountCard p={p} rank={i + 1} now={t.now} save={saveFor(p.row.eventId)} />
              </li>
            ))}
          </ol>
        )
      ) : picks.length === 0 ? (
        <Empty
          title="Ingen kampe at vise lige nu"
          text="Der er ingen fodboldkampe med en analyse de næste 24 timer. Vi analyserer en kamp, når der er under et døgn til kampstart. Kig forbi igen senere."
        />
      ) : (
        <ol className="space-y-4">
          {picks.map((p, i) => (
            <li key={p.row.selectionId}>
              <PickCard p={p} rank={i + 1} now={t.now} save={saveFor(p.row.eventId)} />
            </li>
          ))}
        </ol>
      )}

      {tab === "bedste" && <CouponCard coupons={coupons(picks)} />}
      {learned && tab !== "straffe" && <LearningNote l={learned} />}

      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2 md:grid-cols-3">
        <div>
          <div className="mb-1 font-semibold text-ink">Hvad vi analyserer</div>
          Kampresultater og holdstyrke (Elo), forventede mål, xG-form, skader og karantæner, startopstillinger, form, indbyrdes opgør, bookmakernes odds,
          hjørnespark, kort og frispark for hvert hold, dommerens kortstatistik og målene i 1. halvleg.
        </div>
        <div>
          <div className="mb-1 font-semibold text-ink">Hvad &quot;Værdi&quot; betyder</div>
          Oddsen betaler mere, end vores procent siger den burde. Høj procent giver ofte lav odds, så værdi er ikke det samme som et sikkert bet.
        </div>
        <div>
          <div className="mb-1 font-semibold text-ink">Husk</div>
          Procenterne er skøn, ikke garantier. Selv 80 % taber hver femte gang. Spil kun for penge, du har råd til at tabe. 18+.
        </div>
        <p className="text-xs text-muted md:col-span-3">
          Kilde: {t.dataLabel}. Bookmakernes odds vejer halvdelen, fordi de rummer nyheder og rygter. Skader og xG-form flytter de forventede mål efter en fast
          tommelfingerregel. Form og indbyrdes opgør indgår allerede i resultatmodellen og vises som baggrund. Hjørnespark, kort og frispark: holdenes seneste 20 kampe fra
          football-data.co.uk sammenlignet med ligasnittet; tippet går i retning af, om kampen ventes over eller under snittet, én linje på den sikre side.
        </p>
      </section>
    </div>
  );
}
