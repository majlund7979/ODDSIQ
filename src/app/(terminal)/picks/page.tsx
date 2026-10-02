import Link from "next/link";
import { analysedMatches, dailyPicks, PICK_COUNTS, signedPp, type FormGame, type Pick } from "@/lib/picks";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Dagens bedste bets · ODDSIQ" };

const TZ = "Europe/Copenhagen";
const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: TZ });
const clock = (t: number) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const dec = (x: number, d = 2) => x.toFixed(d).replace(".", ",");

function kickoffLabel(t: number, now: number) {
  const day = dayKey(t) === dayKey(now) ? "I dag" : dayKey(t) === dayKey(now + 86_400_000) ? "I morgen" : new Date(t).toLocaleDateString("da-DK", { weekday: "long", timeZone: TZ });
  return `${day} kl. ${clock(t)}`;
}

const STRENGTH_TONE: Record<Pick["strength"], string> = {
  "Meget stærk": "bg-good/15 text-good border-good/40",
  Stærk: "bg-accent/15 text-accent border-accent/40",
  God: "bg-surface-3 text-ink border-line-strong",
  Middel: "bg-surface-3 text-ink-2 border-line",
};

function Gauge({ p }: { p: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-2xl font-semibold leading-none">{Math.round(p * 100)}%</span>
        <span className="mt-1 text-[10px] uppercase tracking-wider text-muted">chance</span>
      </div>
    </div>
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

function Analysis({ p, home, away }: { p: Pick; home: string; away: string }) {
  const i = p.insights;
  const maxPp = Math.max(4, ...p.factors.map((f) => Math.abs(f.pp ?? 0)));
  return (
    <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-2">
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
          {Math.abs(i.movement) < 0.01 ? "Stort set uændret siden markedet åbnede." : `${i.movement < 0 ? "Faldet" : "Steget"} ${dec(Math.abs(i.movement) * 100, 0)} % siden markedet åbnede (fra ${dec(p.row.openingOdds)} til ${dec(p.row.currentOdds)}).`}
          <div className="text-xs text-muted">
            {p.row.booksQuoting} bookmakere · fair odds efter vores procent: {dec(p.fairOdds)}
          </div>
        </Fact>
        <Fact label="Startopstilling">{i.lineupsConfirmed ? "Bekræftet for begge hold." : "Ikke meldt endnu. Kommer typisk en time før kampstart."}</Fact>
      </div>
    </div>
  );
}

function PickCard({ p, rank, now }: { p: Pick; rank: number; now: number }) {
  const [home, away] = p.row.match.split(" vs ");
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink">{rank}</span>
            <span>{p.row.league}</span>
            <span aria-hidden>·</span>
            <span>{kickoffLabel(p.row.kickoff, now)}</span>
            <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold sm:ml-2 ${STRENGTH_TONE[p.strength]}`}>{p.strength}</span>
          </div>
          <h2 className="text-lg font-semibold leading-tight sm:text-xl">
            {home} <span className="text-muted">–</span> {away}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-accent/15 px-3 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
            {p.value && <span className="rounded-full border border-good/40 bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">Værdi</span>}
            {p.lineupsConfirmed && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2">Opstilling bekræftet</span>}
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
      <details className="group" open={rank === 1}>
        <summary className="flex cursor-pointer list-none items-center justify-between border-t border-line px-5 py-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
          <span>Se hele analysen</span>
          <span className="transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <Analysis p={p} home={home} away={away} />
      </details>
    </article>
  );
}

export default async function PicksPage({ searchParams }: { searchParams: Promise<{ antal?: string }> }) {
  const t = await terminal();
  const q = await searchParams;
  const count = PICK_COUNTS.find((n) => String(n) === q.antal) ?? 10;
  const rows = t.marketRows();
  const picks = dailyPicks(rows, t.now, count, t.pickContext);
  const scope = analysedMatches(rows, t.now);
  const today = new Date(t.now).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <header className="space-y-4">
        <div className="text-sm text-muted">{today.charAt(0).toUpperCase() + today.slice(1)}</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dagens bedste bets</h1>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
              Vi har gennemgået alle fodboldkampe de næste 24 timer og valgt det udfald i hver kamp, der har størst chance for at gå hjem.
            </p>
          </div>
          <nav aria-label="Antal bets" className="flex rounded-lg border border-line bg-surface p-1">
            {PICK_COUNTS.map((n) => (
              <Link
                key={n}
                href={`/picks?antal=${n}`}
                scroll={false}
                aria-current={n === count ? "page" : undefined}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${n === count ? "bg-accent text-page" : "text-ink-2 hover:text-ink"}`}
              >
                Top {n}
              </Link>
            ))}
          </nav>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { v: scope.matches, l: "kampe analyseret" },
            { v: scope.leagues, l: scope.leagues === 1 ? "liga" : "ligaer" },
            { v: clock(t.feedTime), l: "odds opdateret" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="num text-xl font-semibold">{s.v}</div>
              <div className="text-xs text-muted">{s.l}</div>
            </div>
          ))}
        </div>
      </header>

      {picks.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <div className="text-lg font-semibold">Ingen kampe at vise lige nu</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
            Der er ingen fodboldkampe med en analyse de næste 24 timer. Vi analyserer en kamp, når der er under et døgn til kampstart. Kig forbi igen senere.
          </p>
        </div>
      ) : (
        <ol className="space-y-4">
          {picks.map((p, i) => (
            <li key={p.row.selectionId}>
              <PickCard p={p} rank={i + 1} now={t.now} />
            </li>
          ))}
        </ol>
      )}

      <section className="grid gap-4 rounded-xl border border-line bg-surface p-5 text-sm text-ink-2 md:grid-cols-3">
        <div>
          <div className="mb-1 font-semibold text-ink">Hvad vi analyserer</div>
          Kampresultater og holdstyrke (Elo), forventede mål, xG-form, skader og karantæner, startopstillinger, form, indbyrdes opgør og bookmakernes odds.
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
          tommelfingerregel. Form og indbyrdes opgør indgår allerede i resultatmodellen og vises som baggrund.
        </p>
      </section>
    </div>
  );
}
