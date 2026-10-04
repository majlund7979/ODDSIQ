import Link from "next/link";
import { TeamNews } from "@/components/TeamNews";
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
import { COUPON_MIN_ODDS, correctScorePicks, coupons, isValue, doubleChancePicks, halfTimePicks, summarise, type Coupon, type ExtraPick } from "@/lib/picks-extra";
import { terminal } from "@/lib/terminal";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { livePicks } from "@/lib/live/scores";
import { LiveNow } from "@/components/picks/LiveNow";
import { MyCoupon } from "@/components/picks/MyCoupon";
import { GoodSingles, Overview } from "@/components/picks/Overview";
import { compareBooks, isFriendly, oddsMove, STAKE_VERSION } from "@/lib/picks-advice";
import { openBetKeys } from "@/lib/real/friend-bets";
import { AdviceRow, OddsMoveTag, RiskBadge, type SaveTarget } from "@/components/picks/Advice";
import { BankrollInput } from "@/components/picks/BankrollInput";
import { HitRates } from "@/components/picks/HitRates";
import { DEMO_MODE } from "@/lib/data";
import { demoShotBoard } from "@/lib/demo/player-shots";
import { demoLivePicks } from "@/lib/demo/picks";
import { POSITION_LABEL, SHOTS_MODEL_VERSION, topShotPicks, TYPICAL_TEAM_GOALS, type ShotPick } from "@/lib/player-shots";
import { realShotBoard, type ShotBoard } from "@/lib/real/player-shots";

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
      <div className="num text-[34px] font-extrabold leading-none tracking-[-0.03em] text-ink">{pct}%</div>
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
      <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-white">{rank}</span>
      <span>{league}</span>
      <span aria-hidden>·</span>
      <span>{kickoffLabel(kickoff, now)}</span>
      {isFriendly(league) && (
        <span
          className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"
          title="Venskabskampe er sværere at forudsige: holdene roterer, og der er ikke meget på spil. Procenten er mere usikker end normalt."
        >
          Venskabskamp, mere usikker
        </span>
      )}
      <RiskBadge p={probability} className="ml-auto sm:ml-2" />
    </div>
  );
}

function NewsBlock({ home, away }: { home: string; away: string }) {
  return (
    <div className="space-y-2.5 border-t border-line pt-5 md:col-span-2">
      <div className="text-[13px] font-semibold text-ink-2">Nyheder om holdene</div>
      <TeamNews home={home} away={away} />
    </div>
  );
}

function MoreToggle() {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-center gap-2 border-t border-line px-5 py-3 text-sm font-semibold text-accent hover:bg-surface-2">
      <span className="group-open:hidden">Hvorfor? Se analysen</span>
      <span className="hidden group-open:inline">Skjul analysen</span>
      <span className="transition-transform group-open:rotate-180" aria-hidden>
        ▾
      </span>
    </summary>
  );
}

function FormRow({ team, games }: { team: string; games: FormGame[] }) {
  const tone = { V: "bg-good text-white", U: "bg-surface-3 text-ink-2", T: "bg-critical text-white" };
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

/** Every bookmaker's price for the bet, best first. */
function BookTable({ quotes, fairOdds, marketOnly }: { quotes: Pick["row"]["quotes"]; fairOdds: number; marketOnly: boolean }) {
  const c = compareBooks(quotes, fairOdds);
  if (!c) return null;
  const pctDiff = Math.round(c.bestOverMedian * 1000) / 10;
  return (
    <Fact label="Odds hos bookmakerne">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {c.rows.map((r) => (
          <li key={r.book} className={`flex items-center justify-between gap-3 px-3 py-1.5 ${r.best ? "bg-lime-soft" : ""}`}>
            <span className="truncate">{r.book}</span>
            <span className="flex shrink-0 items-center gap-2">
              {r.best && <span className="text-[11px] font-semibold text-accent">Bedst</span>}
              {r.value && !marketOnly && <span className="rounded-full border border-good/40 bg-good/10 px-1.5 text-[10px] font-semibold text-good">Værdi</span>}
              <span className={`num ${r.best ? "font-semibold" : ""}`}>{dec(r.odds)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="text-xs text-muted">
        Den bedste odds er {String(pctDiff).replace(".", ",")} % over snittet ({dec(c.median)}). Over mange bets betyder den forskel meget.{marketOnly ? "" : ` Værdi: oddsen er højere end vores fair odds ${dec(fairOdds)}.`}
      </div>
    </Fact>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-semibold text-ink-2">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function LearningNote({ l }: { l: CategoryLearning }) {
  const n = l.hitRate.n;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
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
        Historisk, {l.hitRate.periodFrom ? new Date(l.hitRate.periodFrom).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ }) : ""}
        {l.hitRate.periodTo ? `–${new Date(l.hitRate.periodTo).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ })}` : ""} · {l.hitRate.source} ·{" "}
        {l.hitRate.modelVersion}
      </span>
    </div>
  );
}

function Analysis({ p, home, away }: { p: Pick; home: string; away: string }) {
  const move = oddsMove(p.insights.movement, p.row.openingOdds, p.row.currentOdds);
  const i = p.insights;
  const maxPp = Math.max(4, ...p.factors.map((f) => Math.abs(f.pp ?? 0)));
  return (
    <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <div className="text-[13px] font-semibold text-ink-2">Hvorfor dette bet</div>
        {explainPick(p).map((s, k) => (
          <p key={k} className="text-[15px] leading-relaxed text-ink-2">
            {s}
          </p>
        ))}
      </div>
      <div className="space-y-3">
        <div className="text-[13px] font-semibold text-ink-2">Sådan er procenten regnet ud</div>
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
        <BookTable quotes={p.row.quotes} fairOdds={p.fairOdds} marketOnly={p.marketOnly} />
        <Fact label="Startopstilling">{i.lineupsConfirmed ? "Bekræftet for begge hold." : "Ikke meldt endnu. Den kommer typisk en time før kampstart, og så bliver procenten mere præcis."}</Fact>
      </div>
      <NewsBlock home={home} away={away} />
    </div>
  );
}

function PickCard({ p, rank, now, save }: { p: Pick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  return (
    <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] sm:text-[22px]">
            {home} <span className="text-muted">–</span> {away}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Vores bud</span>
            <span className="rounded-full bg-lime-soft px-3.5 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
            {p.value && <span className="rounded-full border border-good/40 bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">Værdi</span>}
            <OddsMoveTag row={p.row} />
            {p.lineupsConfirmed ? (
              <span className="rounded-full border border-good/40 bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">Opstilling bekræftet</span>
            ) : (
              <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2" title="Procenten bliver mere præcis, når holdopstillingerne er meldt, typisk en time før kampstart">
                Afventer opstilling
              </span>
            )}
            {p.marketOnly && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2" title="Ingen kampresultater for ligaen endnu, så procenten er bookmakernes">Kun odds</span>}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <div className="min-w-[96px] rounded-2xl bg-surface-2 px-3 py-2.5 text-center">
            <div className="text-[11px] font-medium text-muted">Bedste odds</div>
            <div className="num text-2xl font-semibold">{dec(p.row.bestOdds)}</div>
            <div className="truncate text-[11px] text-ink-2">{p.row.bestBook}</div>
          </div>
        </div>
      </div>
      <AdviceRow p={p.probability} odds={p.row.bestOdds} eventId={p.row.eventId} save={save} leg={{ key: `${p.row.eventId}|${p.row.selectionId}`, match: p.row.match, outcome: p.outcome, kickoff: p.row.kickoff }} />
      <details className="group">
        <MoreToggle />
        <Analysis p={p} home={home} away={away} />
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
    <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] sm:text-[22px]">
            {home} <span className="text-muted">–</span> {away}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-lime-soft px-3.5 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
            <span className="text-sm text-ink-2">
              Forventet <span className="num font-semibold text-ink">{dec(f.expected.total, 1)}</span> · {vs === 0 ? "som ligasnittet" : `${Math.abs(vs)} % ${vs > 0 ? "over" : "under"} ligasnittet`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <div className="min-w-[96px] rounded-2xl bg-surface-2 px-3 py-2.5 text-center">
            <div className="text-[11px] font-medium text-muted">Linjen</div>
            <div className="num text-2xl font-semibold">{lineLabel(f.fairLine)}</div>
            <div className="text-[11px] text-ink-2">fair odds {dec(p.fairOdds)}</div>
          </div>
        </div>
      </div>
      <AdviceRow p={p.probability} odds={null} eventId={p.row.eventId} save={save} leg={{ key: `${p.row.eventId}|count|${p.outcome}`, match: p.row.match, outcome: p.outcome, kickoff: p.row.kickoff }} />
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
          <NewsBlock home={home} away={away} />
        </div>
      </details>
    </article>
  );
}

function ExtraCard({ p, rank, now, save }: { p: ExtraPick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  return (
    <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] sm:text-[22px]">
            {home} <span className="text-muted">–</span> {away}
          </h2>
          <span className="inline-block rounded-lg bg-lime-soft px-3 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          {p.best && (
            <div className="min-w-[96px] rounded-2xl bg-surface-2 px-3 py-2.5 text-center">
              <div className="text-[11px] font-medium text-muted">Bedste odds</div>
              <div className="num text-2xl font-semibold">{dec(p.best.odds)}</div>
              <div className="truncate text-[11px] text-ink-2">{p.best.book}</div>
              {p.best.odds * p.probability > 1 && <div className="mt-1 rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-semibold text-good">Værdi</div>}
            </div>
          )}
          <div className="min-w-[96px] rounded-2xl bg-surface-2 px-3 py-2.5 text-center">
            <div className="text-[11px] font-medium text-muted">Fair odds</div>
            <div className="num text-2xl font-semibold">{dec(p.fairOdds)}</div>
            <div className="text-[11px] text-ink-2">spil over denne</div>
          </div>
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

function CouponCard({ coupons }: { coupons: Coupon[] }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">Dagens kuponforslag</h2>
        <span className="text-sm text-muted">Alle bets på en kupon skal gå hjem</span>
      </div>
      {coupons.length === 0 ? (
        <p className="rounded-[20px] border border-line bg-surface px-5 py-6 text-sm text-ink-2">Der er ikke nok kampe i dag til en kupon. Kig forbi igen senere.</p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {coupons.map((c) => (
            <article key={c.picks.length} className="flex flex-col overflow-hidden rounded-[20px] border border-accent/40 bg-lime-soft">
              <div className="flex items-end justify-between gap-3 px-5 pt-5">
                <div>
                  <div className="text-[13px] font-bold text-accent">{c.picks.length} bets</div>
                  <div className="text-xs text-muted">{c.kind === "odds" ? `Samlet odds mindst ${dec(COUPON_MIN_ODDS, 1)}` : "Valgt efter værdi og sandsynlighed"}</div>
                  <div className="num mt-2 text-[40px] font-extrabold leading-none tracking-[-0.03em]">{dec(c.odds)}</div>
                  <div className="mt-1 text-xs text-muted">samlet odds</div>
                </div>
                <div className="text-right">
                  <div className="num text-[28px] font-extrabold leading-none tracking-[-0.02em]">{Math.round(c.probability * 100)}%</div>
                  <div className="mt-1 text-xs text-muted">chance for at alle går hjem</div>
                </div>
              </div>
              <ul className="mx-3 mt-4 divide-y divide-line rounded-2xl bg-surface text-ink">
                {c.picks.map((p) => (
                  <li key={p.row.selectionId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.outcome}
                        {isValue(p) && <span className="ml-2 rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-semibold text-good">Værdi</span>}
                      </span>
                      <span className="block truncate text-xs text-muted">{p.row.match.replace(" vs ", " – ")}</span>
                    </span>
                    <span className="num shrink-0 text-sm">
                      <span className="text-ink-2">{Math.round(p.probability * 100)}%</span> · {dec(p.row.bestOdds)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="px-5 py-3.5 text-sm text-ink-2">
                100 kr giver <span className="num font-bold text-ink">{Math.round(c.odds * 100)} kr</span>, hvis alle går hjem
                {c.kind === "value" && (
                  <span className="mt-1 block text-xs text-muted">
                    Værdi i {c.valueLegs} af {c.picks.length} bets
                    {c.valueLegs === 0 ? " (ingen af dagens bets har værdi, så kuponen tager de mest sandsynlige)" : c.valueLegs < c.picks.length ? ", resten er dagens mest sandsynlige" : ""}. Estimeret tilbagebetaling i snit:{" "}
                    <span className="num">{Math.round(c.expectedReturn * 100)} kr</span> pr. 100 kr (vores sandsynlighed × odds, ikke en garanti).
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ShotCard({ p, rank, now }: { p: ShotPick; rank: number; now: number }) {
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
  { id: "skud", label: "Skud på mål" },
  ...COUNT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  { id: "straffe", label: "Straffespark" },
];

/** The bet types, grouped so the menu reads like a list rather than a wall of buttons. */
const TAB_GROUPS = [
  { title: "Kampen", ids: ["bedste", "vinder", "dobbelt", "resultat"] },
  { title: "Mål", ids: ["maal", "btts", "halvleg"] },
  { title: "Spillere", ids: ["skud"] },
  { title: "Statistik", ids: [...COUNT_CATEGORIES.map((c) => c.id), "straffe"] },
].map((g) => ({ ...g, tabs: g.ids.map((id) => TABS.find((x) => x.id === id)!).filter(Boolean) }));

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[20px] bg-surface-2 px-6 py-12 text-center">
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
  const couponPool = tab === "bedste" ? applyLearningToPicks(dailyPicks(rows, t.now, 15, t.pickContext), allLearning.get("bedste")) : [];
  const cPicks = applyLearning(countCat ? countPicks(rows, t.now, count, countCat.stat, t.pickContext) : [], learned);
  const xPicks = applyLearning(EXTRA[tab] ? EXTRA[tab](rows, t.now, count, t.pickContext) : [], learned);
  const shots: ShotBoard | null =
    tab !== "skud" ? null : DEMO_MODE ? demoShotBoard(rows, t.now, t.pickContext) : await realShotBoard(db(), rows, t.now, t.pickContext);
  const sPicks = shots ? topShotPicks(shots.picks, count) : [];
  const week = history.filter((p) => p.category === "bedste" && p.kickoff >= t.now - 7 * 86_400_000 && p.kickoff < t.now);
  const upcoming = rows.filter((r) => r.sportId === "football" && r.status === "scheduled" && r.kickoff > t.now).map((r) => r.kickoff);
  const nextKickoff = upcoming.length ? Math.min(...upcoming) : null;
  const href = (type: string, n: number) => {
    const qs = new URLSearchParams({ ...(type !== "bedste" ? { type } : {}), ...(n !== 10 ? { antal: String(n) } : {}) }).toString();
    return qs ? `/picks?${qs}` : "/picks";
  };
  const scope = analysedMatches(rows, t.now);
  const live = await (DEMO_MODE ? Promise.resolve(demoLivePicks(tab, t.now)) : DATABASE_CONFIGURED ? livePicks(db(), process.env.STATS_API_KEY || null, tab, t.now) : Promise.resolve([])).catch(() => []);
  const savedKeys = user ? await openBetKeys(db(), user.id, t.now) : new Set<string>();
  const back = href(tab, count);
  const saveFor = (eventId: string): SaveTarget | null =>
    tab === "straffe" || tab === "skud" ? null : { category: tab, back, saved: savedKeys.has(`${eventId}|${tab}`), signedIn: !!user, accounts: ACCOUNTS_ENABLED };
  const today = new Date(t.now).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

  const tabLabel = TABS.find((x) => x.id === tab)!.label;
  const hit = (id: string) => {
    const l = allLearning.get(id);
    return l && l.hitRate.n > 0 ? l.hitRate : null;
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <header className="rounded-[28px] border border-line bg-gradient-to-br from-accent/15 to-surface px-4 py-5 sm:px-10 sm:py-10">
        <div className="text-sm font-medium text-muted">{today.charAt(0).toUpperCase() + today.slice(1)}</div>
        <h1 className="display mt-2 text-[36px] text-ink sm:text-6xl">{tab === "bedste" ? "Dagens bedste bets" : tabLabel}</h1>
        <p className="mt-3 hidden max-w-2xl text-[16px] leading-relaxed text-ink-2 sm:mt-4 sm:block sm:text-[17px]">De udfald med størst chance for at gå hjem i kampene de næste 24 timer. Øverst er det sikreste.</p>
        {tab === "bedste" ? (
          <div className="mt-4 sm:mt-6">
            <Overview
              top={picks[0] ? { outcome: picks[0].outcome, match: picks[0].row.match, league: picks[0].row.league, kickoff: picks[0].row.kickoff, probability: picks[0].probability, odds: picks[0].row.bestOdds } : null}
              matches={scope.matches}
              leagues={scope.leagues}
              nextKickoff={nextKickoff}
              feedTime={t.feedTime}
              week={week}
              source={t.dataLabel}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            <span className="num">{scope.matches}</span> kampe i <span className="num">{scope.leagues}</span> {scope.leagues === 1 ? "liga" : "ligaer"} analyseret · odds opdateret kl.{" "}
            <span className="num">{clock(t.feedTime)}</span>
          </p>
        )}
        <p className="mt-4 hidden text-xs text-muted sm:block">Procenterne bliver mere præcise, når holdopstillingen er meldt, typisk en time før kampstart.</p>
      </header>

    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      {/* Left: everything you choose. On phones it collapses to one row of buttons. */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:space-y-6 lg:self-start">
        <nav aria-label="Bet-type" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0">
          {TAB_GROUPS.map((g) => (
            <div key={g.title} className="contents lg:block">
              <div className="mb-1.5 hidden px-3 text-xs font-semibold text-muted lg:block">{g.title}</div>
              {g.tabs.map((x) => {
                const h = hit(x.id);
                const active = x.id === tab;
                return (
                  <Link
                    key={x.id}
                    href={href(x.id, count)}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    title={h ? `Træfprocent ${Math.round(h.value * 100)} % i ${h.n} afgjorte bets, sidste ${LEARN_DAYS} dage (historisk)` : undefined}
                    className={`flex shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-full border px-4 py-2 text-[15px] font-medium lg:border-0 lg:px-4 ${
                      active ? "border-lime bg-lime font-semibold text-accent" : "border-line bg-surface text-ink-2 hover:text-accent lg:bg-transparent lg:hover:bg-surface-2"
                    }`}
                  >
                    {x.label}
                    {h && <span className={`num hidden text-xs lg:inline ${active ? "text-accent/80" : "text-muted"}`}>{Math.round(h.value * 100)}%</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <p className="hidden px-4 text-xs leading-relaxed text-muted lg:block">Tallet er træfprocenten de sidste {LEARN_DAYS} dage (historisk).</p>

        <div className="flex flex-wrap items-center gap-3 lg:block lg:space-y-3 lg:rounded-[20px] lg:bg-surface-2 lg:p-4">
          <nav aria-label="Antal bets" className="flex rounded-full bg-surface-2 p-1 lg:bg-surface-3">
            {PICK_COUNTS.map((n) => (
              <Link
                key={n}
                href={href(tab, n)}
                scroll={false}
                aria-current={n === count ? "page" : undefined}
                className={`flex-1 whitespace-nowrap rounded-full px-4 py-1.5 text-center text-sm font-semibold ${n === count ? "bg-accent text-white" : "text-ink-2 hover:text-accent"}`}
              >
                Top {n}
              </Link>
            ))}
          </nav>
          <BankrollInput />
          <details className="basis-full text-xs text-muted">
            <summary className="cursor-pointer font-medium text-accent underline underline-offset-2">Sådan regner vi indsatsen</summary>
            <p className="mt-1.5 leading-relaxed">
              Indsatsforslag efter kvart-Kelly: en fjerdedel af det, Kelly-formlen giver ud fra chance og odds, højst 5 % af puljen. Er oddsen lavere end vores fair odds, er
              der ingen værdi, og forslaget er en lille fast indsats på 1 %. Skøn, {STAKE_VERSION}.
            </p>
          </details>
        </div>
      </aside>

      <div className="min-w-0 space-y-6">

        {q.gemt && SAVED_FLASH[q.gemt] && (
          <div role="status" className={`rounded-[20px] border px-4 py-3 text-sm ${q.gemt === "ok" ? "border-good/40 bg-good/10 text-good" : "border-warning/40 bg-warning/10 text-warning"}`}>
            {SAVED_FLASH[q.gemt]} {q.gemt === "ok" && <Link href="/picks/liga" className="underline">Se vennerligaen</Link>}
          </div>
        )}

        {tab === "bedste" && <LiveNow type={tab} initial={live} />}

        {tab === "bedste" && <CouponCard coupons={coupons(couponPool)} />}

        {tab === "bedste" && (
          <GoodSingles
            rows={picks.slice(0, 5).map((p) => ({
              key: p.row.selectionId,
              eventId: p.row.eventId,
              outcome: p.outcome,
              match: p.row.match,
              league: p.row.league,
              kickoff: p.row.kickoff,
              probability: p.probability,
              odds: p.row.bestOdds,
              value: p.value,
            }))}
          />
        )}



        <div className="lg:hidden">
          <HitRates learning={allLearning} labels={TABS.filter((x) => x.id !== "straffe")} current={tab} days={LEARN_DAYS} source={t.dataLabel} returns={new Map(TABS.map((x) => [x.id, summarise(history.filter((h) => h.category === x.id))]))} />
        </div>

        {tab !== "bedste" && <LiveNow type={tab} initial={live} />}

        {tab === "bedste" && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
            <h2 className="text-2xl font-extrabold tracking-[-0.02em]">Alle {count} enkeltbets med analyse</h2>
            <span className="text-sm text-muted">Tryk &quot;Hvorfor?&quot; for begrundelsen</span>
          </div>
        )}
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
      ) : shots ? (
        sPicks.length === 0 ? (
          <Empty
            title="Ingen spillere at vise lige nu"
            text={
              shots.matches === 0
                ? "Der er ingen fodboldkampe de næste 24 timer. Kig forbi igen senere."
                : "Spillerstatistikken hentes automatisk fra API-Football op til to dage før kampstart. Kig forbi igen om lidt."
            }
          />
        ) : (
          <>
            <ol className="space-y-4">
              {sPicks.map((p, i) => (
                <li key={`${p.eventId}|${p.player}`}>
                  <ShotCard p={p} rank={i + 1} now={t.now} />
                </li>
              ))}
            </ol>
            <p className="px-1 text-xs text-muted">
              Estimeret, model {SHOTS_MODEL_VERSION}: spillerens skud på mål pr. 90 minutter i sæsonen {shots.season}/{String((shots.season + 1) % 100).padStart(2, "0")}, trukket mod det
              typiske for positionen, gange forventede minutter og holdets forventede mål i kampen. Højst tre spillere pr. hold. {shots.covered} af {shots.matches} kampe de næste 24 timer har
              spillerdata · kilde: {DEMO_MODE ? "DEMO DATA" : `API-Football${shots.fetchedAt ? `, hentet ${kickoffLabel(shots.fetchedAt, t.now).toLowerCase()}` : ""}`}. Bookmakerne har ikke
              odds på spillere i vores feed, så sammenlign selv med fair odds.
            </p>
          </>
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

      <MyCoupon canPlay={ACCOUNTS_ENABLED && !!user} />

      {learned && tab !== "straffe" && <LearningNote l={learned} />}

      <section className="grid gap-5 rounded-[28px] bg-surface-2 p-6 text-sm leading-relaxed text-ink-2 md:grid-cols-3">
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
    </div>
    </div>
  );
}
