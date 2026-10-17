import Link from "next/link";
import { deleteBet, updateLeagueProfile } from "@/app/friends-actions";
import { requireFriend } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/data";
import { db } from "@/lib/db";
import { demoFriendBets } from "@/lib/demo/friends";
import { capitalize, dec, shortDate, TZ } from "@/lib/format";
import { betProfit, displayName, LEAGUE_PERIODS, leagueTable, monthStart, SEASON, type FriendBet } from "@/lib/friends";
import { CATEGORY_LABEL } from "@/lib/pick-categories";
import { readFriendBets } from "@/lib/real/friend-bets";
import { readFriendCoupons } from "@/lib/real/friend-coupons";
import { terminal } from "@/lib/terminal";
import { Tile } from "@/components/picks/charts";
import { PendingButton } from "@/components/forms";
import { buttonClass, EmptyState, fieldClass, Notice, PageHeader, segmentClass, segmentedGroup } from "@/components/ui";
import { TipMatch } from "@/components/tips/TipMatch";
import { TipsStandings } from "@/components/tips/TipsStandings";
import { WeekDuel } from "@/components/tips/WeekDuel";
import { loadTips, modelWeekTips } from "@/lib/tips-data";
import { dayById, dayOf, MAX_TIP_POINTS, nextDay, previousDay, previousWeek, tipCounts, weekOf, type Day } from "@/lib/tips";

export const metadata = { title: "Vennerligaen · Oddsanalyse" };

const pct = (x: number) => (Number.isFinite(x) && x >= 0 ? `${Math.round(x * 100)} %` : "—");
const kroner = (x: number) => `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x)).toLocaleString("da-DK")} kr`;
const when = (t: number) => new Date(t).toLocaleString("da-DK", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const RECENT = 40;
const HIT_MIN = 10;

/** Bets shown before "Vis mere"; the rest of the recent list folds away. */
const SHOWN = 10;

/** The page's three tabs: tip today's matches (the default), the standings, and the friends' saved bets. */
const TABS = [
  { id: "tip", label: "Tip kampe" },
  { id: "stilling", label: "Stilling" },
  { id: "bets", label: "Vennernes bets" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const dayName = (t: number) => new Date(t).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const DAY_NAMES: Record<number, string> = { 0: "I dag", 1: "I morgen", [-1]: "I går" };

/** A link within the page; the defaults (first tab, this month, today) stay out of the URL. */
function ligaHref({ fane, periode, dag }: { fane?: TabId; periode?: string; dag?: string }) {
  const p = new URLSearchParams();
  if (fane && fane !== "tip") p.set("fane", fane);
  if (periode && periode !== "maaned") p.set("periode", periode);
  if (dag) p.set("dag", dag);
  const q = p.toString();
  return `/picks/liga${q ? `?${q}` : ""}`;
}

function Mark({ r }: { r: FriendBet["result"] }) {
  if (r === "won") return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-good/20 text-sm font-bold text-good">✓</span>;
  if (r === "lost") return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-critical/20 text-sm font-bold text-critical">✗</span>;
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs text-muted">…</span>;
}

export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ fane?: string; periode?: string; gemt?: string; dag?: string }> }) {
  const user = await requireFriend("/picks/liga");
  const t = await terminal();
  const q = await searchParams;
  const tab: TabId = TABS.find((x) => x.id === q.fane)?.id ?? "tip";
  const period = LEAGUE_PERIODS.find((p) => p.id === q.periode)?.id ?? "maaned";
  const seasonStart = DEMO_MODE ? null : SEASON.start;
  const since = period === "maaned" ? Math.max(monthStart(t.now), seasonStart ?? -Infinity) : seasonStart;
  const [profile, singles, coupons, tipData] = await Promise.all([
    user ? db().user.findUnique({ where: { id: user.id }, select: { displayName: true, morningEmail: true, email: true } }) : null,
    DEMO_MODE ? demoFriendBets(t.now).filter((b) => since === null || b.kickoff >= since) : ACCOUNTS_ENABLED ? readFriendBets(db(), t.now, since) : [],
    // Played coupons are real account data, so they show in demo mode too.
    ACCOUNTS_ENABLED ? readFriendCoupons(db(), t.now, since) : [],
    loadTips(t),
  ]);
  const bets = [...singles, ...coupons].sort((a, b) => b.kickoff - a.kickoff);
  const table = leagueTable(bets);
  const recent = bets.slice(0, RECENT);
  const back = ligaHref({ fane: "bets", periode: period });
  const month = new Date(t.now).toLocaleDateString("da-DK", { month: "long", timeZone: TZ });
  const leader = table.find((r) => r.settled > 0) ?? null;
  const sharp = [...table].filter((r) => r.settled >= HIT_MIN).sort((a, b) => b.won / b.settled - a.won / a.settled)[0] ?? null;
  const settledAll = table.reduce((n, r) => n + r.settled, 0);
  const wonAll = table.reduce((n, r) => n + r.won, 0);
  const teamProfit = table.reduce((n, r) => n + r.profit, 0);
  const week = weekOf(t.now);
  // Standings and stats count this season's tips only; the tip buttons still show your older tips.
  const seasonTips = seasonStart === null ? tipData.tips : tipData.tips.filter((x) => x.kickoff >= seasonStart);
  const modelWeek = modelWeekTips(tipData.all, seasonTips, week);

  // The tipping game: the day shown on the "Tip kampe" tab and how far the friend has got today.
  const today = dayOf(t.now);
  const shown = (q.dag && dayById(q.dag)) || today;
  const mine = new Map(tipData.tips.filter((x) => x.userId === user?.id).map((x) => [x.eventId, x.pick]));
  const dayMatches = tipData.all.filter((m) => m.kickoff >= shown.start && m.kickoff < shown.end);
  const open = dayMatches.filter((m) => m.kickoff > t.now);
  const started = dayMatches.filter((m) => m.kickoff <= t.now);
  const todayOpen = tipData.all.filter((m) => m.kickoff > t.now && m.kickoff < today.end);
  const prevDay = previousDay(shown);
  const nxtDay = nextDay(shown);
  const hasNext = tipData.all.some((m) => m.kickoff >= nxtDay.start);
  const offset = Math.round((shown.start - today.start) / 86_400_000);
  const shownLabel = DAY_NAMES[offset] ?? capitalize(dayName(shown.start + 12 * 3_600_000));
  const dayHref = (d: Day) => ligaHref({ dag: d.id === today.id ? undefined : d.id });
  const matchCard = (m: (typeof dayMatches)[number]) => (
    <TipMatch key={m.eventId} m={m} now={t.now} pick={mine.get(m.eventId) ?? null} counts={tipCounts(tipData.tips, m.eventId)} canTip={!!user} />
  );

  const betRow = (b: (typeof recent)[number]) => (
    <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
      <Mark r={b.result} />
      {b.legs ? (
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{b.name}</span>
            <span className="shrink-0 rounded-full border border-accent/40 bg-accent-soft px-1.5 text-xs font-semibold text-accent">Kupon · {b.outcome}</span>
          </span>
          <span className="block truncate text-xs text-muted">
            {pct(b.probability)} chance for alle · sidste kamp {when(b.kickoff)}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-medium">
            {b.name} · {b.outcome}
          </span>
          <span className="block truncate text-xs text-muted">
            {b.match.replace(" vs ", " – ")} · {CATEGORY_LABEL[b.category] ?? b.category} · {when(b.kickoff)}
          </span>
        </span>
      )}
      <span className="num shrink-0 text-right text-sm">
        {b.stake} kr{b.odds ? ` · ${dec(b.odds)}` : ""}
        {b.result && b.odds ? <span className={`block text-xs ${b.result === "won" ? "text-good" : "text-serious"}`}>{kroner(betProfit(b))}</span> : null}
      </span>
      {user && b.userId === user.id && (b.legs ? b.legs.every((l) => l.kickoff > t.now) : b.kickoff > t.now) && (
        <form action={deleteBet}>
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="back" value={back} />
          <PendingButton className="min-h-11 rounded-field px-3 text-sm text-ink-2 hover:bg-critical/10 hover:text-critical sm:min-h-9" aria-label={b.legs ? "Slet kupon" : "Slet bet"} confirm={b.legs ? "Slet kuponen?" : "Slet bettet?"}>
            Slet
          </PendingButton>
        </form>
      )}
      {b.legs && (
        <ul className="w-full min-w-0 basis-full space-y-1 border-l-2 border-line pl-3 sm:ml-9 sm:w-auto">
          {b.legs.map((l, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className={l.result === "won" ? "text-good" : l.result === "lost" ? "text-critical" : "text-muted"}>{l.result === "won" ? "✓" : l.result === "lost" ? "✗" : "…"}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink">{l.outcome}</span> <span className="text-muted">{l.match.replace(" vs ", " – ")} · {when(l.kickoff)}</span>
              </span>
              <span className="num shrink-0 text-muted">{pct(l.probability)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );

  const periodNav = (
    <nav aria-label="Periode" className={segmentedGroup}>
      {LEAGUE_PERIODS.map((p) => (
        <Link key={p.id} href={ligaHref({ fane: tab, periode: p.id })} scroll={false} aria-current={p.id === period ? "page" : undefined} className={segmentClass(p.id === period)}>
          {p.id === "maaned" ? capitalize(month) : p.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="space-y-8 lg:space-y-10">
      <PageHeader
        eyebrow={seasonStart === null ? undefined : `Sæson ${SEASON.number} · siden ${shortDate(seasonStart + 12 * 3_600_000)}`}
        title="Vennerligaen"
        intro={<>Tip dagens kampe, gem de bets, du spiller, og dyst med vennerne om ugens sejr. Kun for sjov, der spilles ikke om penge.</>}
      />

      {q.gemt === "profil" && (
        <Notice role="status" tone="good">
          Dine indstillinger er gemt.
        </Notice>
      )}
      {!ACCOUNTS_ENABLED && !DEMO_MODE && <Notice tone="warning">Ligaen og tipsspillet kræver login, som ikke er slået til på siden endnu.</Notice>}

      <WeekDuel
        tips={seasonTips}
        modelWeek={modelWeek}
        week={week}
        now={t.now}
        me={user?.id}
        open={todayOpen.length}
        tippedOpen={todayOpen.filter((m) => mine.has(m.eventId)).length}
        tipHref={ligaHref({})}
        loginHref={ACCOUNTS_ENABLED && !user ? "/login?next=/picks/liga" : null}
        source={tipData.source}
      />

      <nav aria-label="Vennerligaen" className={`${segmentedGroup} sticky top-[76px] z-20 shadow-[var(--shadow-pop)] sm:max-w-xl`}>
        {TABS.map((x) => (
          <Link key={x.id} href={ligaHref({ fane: x.id, periode: period })} scroll={false} aria-current={x.id === tab ? "page" : undefined} className={segmentClass(x.id === tab, "px-2 sm:px-4")}>
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "tip" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-[52ch] text-sm text-ink-2">
              Tryk 1, X eller 2. Et rigtigt tip giver point efter oddsen: en favorit til 1,40 giver 1,4 point, en outsider til 4,50 giver 4,5 (højst {MAX_TIP_POINTS}). Du kan ændre
              dit tip, indtil kampen starter.
            </p>
            <nav aria-label="Dag" className="flex items-center gap-1 rounded-field border border-line bg-surface p-1 text-sm">
              <Link href={dayHref(prevDay)} scroll={false} className="flex h-10 w-10 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Forrige dag">
                ←
              </Link>
              <span className="min-w-28 px-2 text-center font-semibold whitespace-nowrap" aria-live="polite">
                {shownLabel}
                {offset >= -1 && offset <= 1 && <span className="ml-1.5 text-xs font-normal text-ink-2">{shortDate(shown.start + 12 * 3_600_000)}</span>}
              </span>
              {hasNext ? (
                <Link href={dayHref(nxtDay)} scroll={false} className="flex h-10 w-10 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Næste dag">
                  →
                </Link>
              ) : (
                <span className="flex h-10 w-10 items-center justify-center text-muted/40" aria-hidden>
                  →
                </span>
              )}
            </nav>
          </div>

          {dayMatches.length === 0 ? (
            <EmptyState
              title="Ingen kampe her endnu"
              text={`${shown.start > t.now ? "Kampene denne dag er ikke klar endnu." : shown.end <= t.now ? "Siden har ikke kampene fra denne dag længere." : "Der er ingen kampe klar i dag endnu."} Kampene kommer på, når oddsene er klar, typisk dagen før.`}
            />
          ) : (
            <>
              {open.length > 0 && (
                <section aria-labelledby="kan-tippes" className="space-y-3">
                  <h2 id="kan-tippes" className="eyebrow">
                    Kan tippes · {open.length}
                  </h2>
                  <ul className="space-y-3">{open.map(matchCard)}</ul>
                </section>
              )}
              {started.length > 0 && (
                <details open={open.length === 0} className="group space-y-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-field">
                    <span className="eyebrow">I gang og spillet · {started.length}</span>
                    <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink-2 transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </summary>
                  <ul className="mt-3 space-y-3">{started.map(matchCard)}</ul>
                </details>
              )}
            </>
          )}

          <p className="px-1 text-xs leading-relaxed text-ink-2/80">
            Under hvert tip står den bedste odds og modellens sandsynlighed. Point er oddsen på dine rigtige tips (1 point uden odds, højst {MAX_TIP_POINTS} pr. tip) og lægges sammen
            for ugen. Ved lige mange point vinder den med flest rigtige. Modellen spiller med for sjov og kan ikke vinde ugen. Kampene kommer på, når oddsene er klar, typisk dagen før.
          </p>
        </div>
      )}

      {tab === "stilling" && (
        <div className="space-y-10">
          <section aria-labelledby="tipsspillet" className="space-y-4">
            <h2 id="tipsspillet" className="display text-[34px] sm:text-[40px]">
              Tipsspillet
            </h2>
            <TipsStandings tips={seasonTips} modelWeek={modelWeek} week={week} previous={previousWeek(week)} now={t.now} me={user?.id} source={tipData.source} />
          </section>

          <section aria-labelledby="bet-ligaen" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="bet-ligaen" className="display text-[34px] sm:text-[40px]">
                  Bet-ligaen
                </h2>
                <p className="mt-1 max-w-[56ch] text-sm text-ink-2">
                  Gem de bets, du spiller, med &quot;Gem bet&quot; eller &quot;Spil kupon&quot; på Dagens bedste bets. Her ser I, hvem der rammer flest, og hvem der tjener mest.
                </p>
              </div>
              {periodNav}
            </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Tile bare className="bg-surface" label="Fører lige nu" foot={`Mest vundet i ${period === "maaned" ? month : "hele sæsonen"}. Historisk${DEMO_MODE ? " · DEMO DATA" : ""}.`}>
            {leader ? (
              <>
                <div className="figure truncate text-[32px]">{leader.name}</div>
                <div className={`num mt-1.5 text-sm font-semibold ${leader.profit >= 0 ? "text-good" : "text-serious"}`}>{kroner(leader.profit)}</div>
              </>
            ) : (
              <div className="text-sm text-ink-2">Ingen bets endnu.</div>
            )}
          </Tile>
          <Tile bare className="bg-surface" label="Bedste træfprocent" foot={`Kun spillere med mindst ${HIT_MIN} afgjorte bets.`}>
            {sharp ? (
              <>
                <div className="figure truncate text-[32px]">{sharp.name}</div>
                <div className="num mt-1.5 text-sm text-ink-2">
                  {pct(sharp.won / sharp.settled)} · {sharp.won} af {sharp.settled}
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-2">For få afgjorte bets endnu.</div>
            )}
          </Tile>
          <Tile bare className="bg-surface" label="Bets i perioden" foot={`${settledAll} afgjort, ${bets.length - settledAll} venter på kampen.`}>
            <div className="figure text-[44px]">{bets.length}</div>
            <div className="mt-1.5 text-sm text-ink-2">af {table.length} {table.length === 1 ? "spiller" : "spillere"}</div>
          </Tile>
          <Tile bare className="bg-surface" label="Holdet samlet" foot="Gevinst tæller bets med odds, ramte tæller alle afgjorte bets.">
            <div className={`figure text-[44px] ${teamProfit >= 0 ? "text-good" : "text-serious"}`}>{kroner(teamProfit)}</div>
            <div className="num mt-1.5 text-sm text-ink-2">{settledAll ? `${pct(wonAll / settledAll)} ramte` : "—"}</div>
          </Tile>
        </div>

      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <h3 id="liga-stilling" className="border-b border-line px-5 py-4 text-md font-semibold">Stillingen i bet-ligaen</h3>
        {table.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen har gemt et bet i perioden endnu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-2">
                <th className="w-8 px-3 py-2.5 font-medium sm:px-5">#</th>
                <th className="px-2 py-2 font-normal">Navn</th>
                <th className="px-3 py-2 text-right font-normal">Bets</th>
                <th className="px-3 py-2 text-right font-normal">Ramte</th>
                <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Afkast</th>
                <th className="px-3 py-2 text-right font-normal sm:px-5">Gevinst</th>
              </tr>
            </thead>
            <tbody className="num whitespace-nowrap">
              {table.map((r, i) => (
                <tr key={r.userId} className={`border-t border-line ${r.userId === user?.id ? "bg-accent-soft/60" : ""}`}>
                  <td className="px-3 py-3 sm:px-5">
                    <span className={`figure text-lg ${i === 0 ? "text-accent" : "text-muted"}`}>{i + 1}</span>
                  </td>
                  <td className="px-2 py-2.5 font-sans font-medium">
                    {r.name}
                    {r.userId === user?.id && <span className="ml-1.5 text-xs text-muted">(dig)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{r.bets}</td>
                  <td className="px-3 py-2.5 text-right">
                    {r.settled ? (
                      <>
                        <span className="hidden sm:inline">
                          {r.won}/{r.settled} <span className="text-muted">· </span>
                        </span>
                        {pct(r.won / r.settled)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right text-ink-2 sm:table-cell">{Number.isFinite(r.roi) ? `${r.roi >= 0 ? "+" : "−"}${Math.round(Math.abs(r.roi) * 100)} %` : "—"}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold sm:px-5 ${r.staked ? (r.profit >= 0 ? "text-good" : "text-serious") : "text-muted"}`}>{r.staked ? kroner(r.profit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-2/80">
          Sorteret efter gevinst, så træfprocent. Gevinst og afkast tæller kun afgjorte bets, hvor der er skrevet en odds på. Historisk, {period === "maaned" ? month : seasonStart === null ? "hele tiden" : `sæson ${SEASON.number}`}, {bets.length}{" "}
          gemte bets · {DEMO_MODE ? "DEMO DATA" : "vennernes egne bets, afgjort med kampresultater fra " + t.dataLabel}.
        </p>
      </section>

          </section>
        </div>
      )}

      {tab === "bets" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-[56ch] text-sm text-ink-2">De bets og kuponer, I har gemt fra Dagens bedste bets. Du kan slette dine egne, indtil kampen starter.</p>
            {periodNav}
          </div>
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">Vennernes bets</h2>
          <span className="text-xs text-ink-2">de seneste {Math.min(RECENT, recent.length)}</span>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen bets endnu.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">{recent.slice(0, SHOWN).map(betRow)}</ul>
            {recent.length > SHOWN && (
              <details className="group border-t border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft">
                  <span className="group-open:hidden">Vis {recent.length - SHOWN} mere</span>
                  <span className="hidden group-open:inline">Vis færre</span>
                  <svg viewBox="0 0 16 16" className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </summary>
                <ul className="divide-y divide-line border-t border-line">{recent.slice(SHOWN).map(betRow)}</ul>
              </details>
            )}
          </>
        )}
      </section>

        </div>
      )}

      {profile && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-4 text-lg font-semibold">Dine indstillinger</h2>
          <form action={updateLeagueProfile} className="flex flex-wrap items-end gap-4">
            <label className="text-xs font-medium text-ink-2">
              Dit navn i ligaen
              <input
                name="displayName"
                maxLength={30}
                defaultValue={profile.displayName ?? ""}
                placeholder={displayName(null, profile.email)}
                className={`${fieldClass} block w-60`}
              />
            </label>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm text-ink-2">
              <input type="checkbox" name="morningEmail" defaultChecked={profile.morningEmail} className="h-5 w-5 accent-[var(--accent)]" />
              Send mig dagens top 5 på mail hver morgen
            </label>
            <PendingButton className={buttonClass("primary", "lg")}>
              Gem
            </PendingButton>
          </form>
        </section>
      )}
    </div>
  );
}
