import Link from "next/link";
import { deleteBet, updateLeagueProfile } from "@/app/friends-actions";
import { requireFriend } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/data";
import { db } from "@/lib/db";
import { demoFriendBets } from "@/lib/demo/friends";
import { capitalize, dec, TZ } from "@/lib/format";
import { betProfit, displayName, LEAGUE_PERIODS, leagueTable, monthStart, type FriendBet } from "@/lib/friends";
import { CATEGORY_LABEL } from "@/lib/pick-categories";
import { readFriendBets } from "@/lib/real/friend-bets";
import { readFriendCoupons } from "@/lib/real/friend-coupons";
import { terminal } from "@/lib/terminal";
import { Tile } from "@/components/picks/charts";
import { PendingButton } from "@/components/forms";
import { TipsStandings } from "@/components/tips/TipsStandings";
import { loadTips, modelWeekTips } from "@/lib/tips-data";
import { previousWeek, weekOf } from "@/lib/tips";

export const metadata = { title: "Vennerligaen · Oddsanalyse" };

const pct = (x: number) => (Number.isFinite(x) && x >= 0 ? `${Math.round(x * 100)} %` : "—");
const kroner = (x: number) => `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x)).toLocaleString("da-DK")} kr`;
const when = (t: number) => new Date(t).toLocaleString("da-DK", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const RECENT = 40;
const HIT_MIN = 10;

function Mark({ r }: { r: FriendBet["result"] }) {
  if (r === "won") return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-good/20 text-sm font-bold text-good">✓</span>;
  if (r === "lost") return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-critical/20 text-sm font-bold text-critical">✗</span>;
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs text-muted">…</span>;
}

export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ periode?: string; gemt?: string }> }) {
  const user = await requireFriend("/picks/liga");
  const t = await terminal();
  const q = await searchParams;
  const period = LEAGUE_PERIODS.find((p) => p.id === q.periode)?.id ?? "maaned";
  const since = period === "maaned" ? monthStart(t.now) : null;
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
  const back = `/picks/liga${period !== "maaned" ? `?periode=${period}` : ""}`;
  const month = new Date(t.now).toLocaleDateString("da-DK", { month: "long", timeZone: TZ });
  const leader = table.find((r) => r.settled > 0) ?? null;
  const sharp = [...table].filter((r) => r.settled >= HIT_MIN).sort((a, b) => b.won / b.settled - a.won / a.settled)[0] ?? null;
  const settledAll = table.reduce((n, r) => n + r.settled, 0);
  const wonAll = table.reduce((n, r) => n + r.won, 0);
  const teamProfit = table.reduce((n, r) => n + r.profit, 0);
  const week = weekOf(t.now);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-5 rounded-[28px] border border-line bg-gradient-to-br from-accent/15 to-surface px-4 py-5 sm:px-10 sm:py-8">
        <Link href="/picks" className="text-sm text-muted hover:text-ink">
          ← Dagens bedste bets
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-[40px] text-ink sm:text-5xl">Vennerligaen</h1>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
              Gem de bets, du spiller, med &quot;Gem bet&quot; eller &quot;Spil kupon&quot; på Dagens bedste bets. Her kan I se, hvem der rammer flest, og hvem der tjener mest.
            </p>
          </div>
          <nav aria-label="Periode" className="flex rounded-full border border-line bg-surface p-1">
            {LEAGUE_PERIODS.map((p) => (
              <Link
                key={p.id}
                href={`/picks/liga${p.id !== "maaned" ? `?periode=${p.id}` : ""}`}
                scroll={false}
                aria-current={p.id === period ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${p.id === period ? "bg-accent text-page" : "text-ink-2 hover:text-ink"}`}
              >
                {p.id === "maaned" ? capitalize(month) : p.label}
              </Link>
            ))}
          </nav>
        </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Fører lige nu" foot={`Mest vundet i ${period === "maaned" ? month : "hele perioden"}. Historisk${DEMO_MODE ? " · DEMO DATA" : ""}.`}>
            {leader ? (
              <>
                <div className="truncate text-2xl font-extrabold tracking-[-0.02em]">{leader.name}</div>
                <div className={`num text-sm font-semibold ${leader.profit >= 0 ? "text-good" : "text-serious"}`}>{kroner(leader.profit)}</div>
              </>
            ) : (
              <div className="text-sm text-ink-2">Ingen bets endnu.</div>
            )}
          </Tile>
          <Tile label="Bedste træfprocent" foot={`Kun spillere med mindst ${HIT_MIN} afgjorte bets.`}>
            {sharp ? (
              <>
                <div className="truncate text-2xl font-extrabold tracking-[-0.02em]">{sharp.name}</div>
                <div className="num text-sm text-ink-2">
                  {pct(sharp.won / sharp.settled)} · {sharp.won} af {sharp.settled}
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-2">For få afgjorte bets endnu.</div>
            )}
          </Tile>
          <Tile label="Bets i perioden" foot={`${settledAll} afgjort, ${bets.length - settledAll} venter på kampen.`}>
            <div className="num text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">{bets.length}</div>
            <div className="text-sm text-ink-2">af {table.length} {table.length === 1 ? "spiller" : "spillere"}</div>
          </Tile>
          <Tile label="Holdet samlet" foot="Gevinst tæller bets med odds, ramte tæller alle afgjorte bets.">
            <div className={`num text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl ${teamProfit >= 0 ? "text-good" : "text-serious"}`}>{kroner(teamProfit)}</div>
            <div className="num text-sm text-ink-2">{settledAll ? `${pct(wonAll / settledAll)} ramte` : "—"}</div>
          </Tile>
        </div>
      </header>

      {q.gemt === "profil" && (
        <div role="status" className="rounded-2xl border border-good/40 bg-good/10 px-4 py-3 text-sm text-good">
          Dine indstillinger er gemt.
        </div>
      )}

      {!ACCOUNTS_ENABLED && !DEMO_MODE && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">Ligaen kræver login, som ikke er slået til på siden endnu.</div>
      )}
      {ACCOUNTS_ENABLED && !user && (
        <div className="rounded-[20px] border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          <Link href="/login?next=/picks/liga" className="font-semibold text-accent hover:underline">
            Log ind
          </Link>{" "}
          for at gemme dine bets og komme med i ligaen.
        </div>
      )}

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        <div className="border-b border-line px-5 py-3 text-sm font-semibold">Stillingen</div>
        {table.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen har gemt et bet i perioden endnu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="w-8 px-3 py-2 font-normal sm:px-5">#</th>
                <th className="px-2 py-2 font-normal">Navn</th>
                <th className="px-3 py-2 text-right font-normal">Bets</th>
                <th className="px-3 py-2 text-right font-normal">Ramte</th>
                <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Afkast</th>
                <th className="px-3 py-2 text-right font-normal sm:px-5">Gevinst</th>
              </tr>
            </thead>
            <tbody className="num whitespace-nowrap">
              {table.map((r, i) => (
                <tr key={r.userId} className={`border-t border-line ${r.userId === user?.id ? "bg-lime-soft/60" : ""}`}>
                  <td className="px-3 py-2.5 text-muted sm:px-5">{i + 1}</td>
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
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Sorteret efter gevinst, så træfprocent. Gevinst og afkast tæller kun afgjorte bets, hvor der er skrevet en odds på. Historisk, {period === "maaned" ? month : "hele tiden"}, {bets.length}{" "}
          gemte bets · {DEMO_MODE ? "DEMO DATA" : "vennernes egne bets, afgjort med kampresultater fra " + t.dataLabel}.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em]">Tipsspillet</h2>
          <Link href="/tips" className="text-sm font-medium text-accent hover:underline">
            Tip dagens kampe →
          </Link>
        </div>
        <TipsStandings tips={tipData.tips} modelWeek={modelWeekTips(tipData.all, tipData.tips, week)} week={week} previous={previousWeek(week)} now={t.now} me={user?.id} source={tipData.source} />
      </section>

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
          <span className="text-sm font-semibold">Vennernes bets</span>
          <span className="text-xs text-muted">de seneste {Math.min(RECENT, recent.length)}</span>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen bets endnu.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
                <Mark r={b.result} />
                {b.legs ? (
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{b.name}</span>
                      <span className="shrink-0 rounded-full border border-accent/40 bg-lime-soft px-1.5 text-[10px] font-semibold text-accent">Kupon · {b.outcome}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {pct(b.probability)} chance for alle · sidste kamp {when(b.kickoff)}
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
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
                    <PendingButton className="text-xs text-muted hover:text-critical" aria-label={b.legs ? "Slet kupon" : "Slet bet"} confirm={b.legs ? "Slet kuponen?" : "Slet bettet?"}>
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
            ))}
          </ul>
        )}
      </section>

      {profile && (
        <section className="rounded-[20px] border border-line bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Dine indstillinger</h2>
          <form action={updateLeagueProfile} className="flex flex-wrap items-end gap-4">
            <label className="space-y-1 text-xs text-muted">
              Dit navn i ligaen
              <input
                name="displayName"
                maxLength={30}
                defaultValue={profile.displayName ?? ""}
                placeholder={displayName(null, profile.email)}
                className="block w-52 rounded-[10px] border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-sm text-ink-2">
              <input type="checkbox" name="morningEmail" defaultChecked={profile.morningEmail} className="h-4 w-4 accent-[var(--accent)]" />
              Send mig dagens top 5 på mail hver morgen
            </label>
            <PendingButton className="rounded-full bg-lime px-4 py-1.5 text-sm font-semibold text-accent hover:brightness-125">
              Gem
            </PendingButton>
          </form>
        </section>
      )}
    </div>
  );
}
