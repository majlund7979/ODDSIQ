import Link from "next/link";
import { setTip } from "@/app/tips-actions";
import { TipButtons } from "@/components/TipButtons";
import { requireFriend } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/data";
import { capitalize, clock, shortDate, TZ } from "@/lib/format";
import { terminal } from "@/lib/terminal";
import { loadTips } from "@/lib/tips-data";
import { dayById, dayOf, MAX_TIP_POINTS, nextDay, previousDay, SIDE_LABEL, tipCounts, type Day, type Side } from "@/lib/tips";

export const metadata = { title: "Dagens tips · Oddsanalyse" };

const day = (t: number) => new Date(t).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const DAY_NAMES: Record<number, string> = { 0: "I dag", 1: "I morgen", [-1]: "I går" };

export default async function TipsPage({ searchParams }: { searchParams: Promise<{ dag?: string }> }) {
  const user = await requireFriend("/tips");
  const t = await terminal();
  const q = await searchParams;
  const today = dayOf(t.now);
  const shown = (q.dag && dayById(q.dag)) || today;

  // Only your own tips and the tip counts show here, so older tips are not settled.
  const { all, tips } = await loadTips(t, { settle: false });
  const matches = all.filter((m) => m.kickoff >= shown.start && m.kickoff < shown.end);
  const mine = new Map(tips.filter((x) => x.userId === user?.id).map((x) => [x.eventId, x.pick]));

  const open = matches.filter((m) => m.kickoff > t.now);
  const tippedOpen = open.filter((m) => mine.has(m.eventId)).length;
  const prev = previousDay(shown);
  const next = nextDay(shown);
  const hasNext = all.some((m) => m.kickoff >= next.start);
  const offset = Math.round((shown.start - today.start) / 86_400_000);
  const label = DAY_NAMES[offset] ?? capitalize(day(shown.start + 12 * 3_600_000));
  const dayHref = (d: Day) => (d.id === today.id ? "/tips" : `/tips?dag=${d.id}`);

  return (
    <div>
      <div className="mx-auto min-w-0 max-w-3xl space-y-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display text-[40px] text-ink sm:text-5xl">Dagens tips</h1>
              <p className="mt-2 max-w-xl text-[15px] text-ink-2">
                Tip 1, X eller 2 på dagens kampe og dyst mod vennerne. Et rigtigt tip giver point efter, hvor usandsynligt det var: oddsen, da du tippede. En favorit til 1,40 giver 1,4 point, en outsider til 4,50 giver 4,5 point (højst {MAX_TIP_POINTS}). Du kan ændre dit tip, indtil kampen starter.
              </p>
              <Link href="/picks/liga#stilling" className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
                Stilling og sjove stats i Vennerligaen →
              </Link>
            </div>
            <nav aria-label="Dag" className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
              <Link href={dayHref(prev)} scroll={false} className="rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Forrige dag">
                ←
              </Link>
              <span className="px-2 font-medium whitespace-nowrap">
                {label}
                {offset >= -1 && offset <= 1 && <span className="ml-1.5 text-xs font-normal text-muted">{shortDate(shown.start + 12 * 3_600_000)}</span>}
              </span>
              {hasNext ? (
                <Link href={dayHref(next)} scroll={false} className="rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Næste dag">
                  →
                </Link>
              ) : (
                <span className="px-2.5 py-1.5 text-muted/40" aria-hidden>
                  →
                </span>
              )}
            </nav>
          </div>
        </header>

        {!ACCOUNTS_ENABLED && !DEMO_MODE && (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">Tipsspillet kræver login, som ikke er slået til på siden endnu.</div>
        )}

        {open.length > 0 && user && (
          <div className="flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3 text-sm">
            <span className="num shrink-0 rounded-full bg-lime-soft px-2.5 py-1 text-xs font-semibold text-accent">
              {tippedOpen}/{open.length}
            </span>
            <span className="text-ink-2">
              {tippedOpen === open.length ? "Du har tippet alle kampe, der ikke er startet endnu." : "kampe tippet af dem, der ikke er startet endnu. Tryk 1, X eller 2 for at tippe."}
            </span>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="rounded-[20px] border border-line bg-surface px-5 py-10 text-center text-sm text-ink-2">
            {shown.start > t.now ? "Kampene denne dag er ikke klar endnu." : shown.end <= t.now ? "Siden har ikke kampene fra denne dag længere." : "Der er ingen kampe klar i dag endnu."} Kampene kommer på, når oddsene er klar, typisk dagen før.
          </div>
        ) : (
          (
            <section className="space-y-2">
              <ul className="space-y-2">
                {matches
                  .map((m) => {
                    const locked = m.kickoff <= t.now;
                    const pick = mine.get(m.eventId) ?? null;
                    const counts = tipCounts(tips, m.eventId);
                    const n = counts.home + counts.draw + counts.away;
                    return (
                      <li key={m.eventId} id={m.eventId} className="rounded-[20px] border border-line bg-surface p-4">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:flex-nowrap">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {m.home} <span className="text-muted">–</span> {m.away}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                              <span>{m.league}</span>
                              <span>·</span>
                              {m.score ? (
                                <span className="num font-semibold text-ink">
                                  Slut {m.score[0]}–{m.score[1]}
                                </span>
                              ) : m.status === "live" ? (
                                <span className="font-semibold text-good">I gang</span>
                              ) : locked ? (
                                <span>Startet {clock(m.kickoff)}</span>
                              ) : (
                                <span>{clock(m.kickoff)}</span>
                              )}
                            </div>
                          </div>
                          <div className="w-full sm:w-60">
                            <TipButtons action={setTip} eventId={m.eventId} pick={pick} odds={m.odds} model={m.model} locked={locked || !user} result={m.result} />
                          </div>
                        </div>
                        {n > 0 && (
                          <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted">
                            {locked ? (
                              <>
                                Vennerne tippede{" "}
                                {(["home", "draw", "away"] as Side[]).map((s, i) => (
                                  <span key={s}>
                                    {i > 0 && " · "}
                                    <span className={m.result === s ? "font-semibold text-good" : "text-ink-2"}>
                                      {SIDE_LABEL[s]}: {counts[s]}
                                    </span>
                                  </span>
                                ))}
                              </>
                            ) : (
                              <>
                                {n} {n === 1 ? "ven har" : "venner har"} tippet. Du ser, hvad de tippede, når kampen starter.
                              </>
                            )}
                          </p>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          )
        )}

        <p className="px-1 text-xs text-muted">
          Under hvert tip står den bedste odds og modellens sandsynlighed. Point er oddsen på dine rigtige tips (1 point uden odds, højst {MAX_TIP_POINTS} pr. tip). Point lægges sammen for ugen, og ugens vinder og stillingen står i Vennerligaen. Ved lige mange point vinder den med flest rigtige. Modellen spiller med for sjov og kan ikke
          vinde ugen. Kampene kommer på, når oddsene er klar, typisk dagen før. Kun for sjov, der spilles ikke om penge.
        </p>
      </div>

    </div>
  );
}
