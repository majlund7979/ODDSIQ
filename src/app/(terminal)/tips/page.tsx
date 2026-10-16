import Link from "next/link";
import { setTip } from "@/app/tips-actions";
import { TipButtons } from "@/components/TipButtons";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
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

  const started = matches.filter((m) => m.kickoff <= t.now);
  const card = (m: (typeof matches)[number]) => {
    const locked = m.kickoff <= t.now;
    const pick = mine.get(m.eventId) ?? null;
    const counts = tipCounts(tips, m.eventId);
    const n = counts.home + counts.draw + counts.away;
    return (
      <li key={m.eventId} id={m.eventId} className={`rounded-card border border-line p-4 transition-colors sm:p-5 ${locked ? "bg-surface/60" : "bg-surface hover:border-line-strong"}`}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <div className="text-md font-semibold leading-snug sm:text-lg">
              {m.home} <span className="font-normal text-muted">–</span> {m.away}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
              <span>{m.league}</span>
              <span>·</span>
              {m.score ? (
                <span className="num font-semibold text-ink">
                  Slut {m.score[0]}–{m.score[1]}
                </span>
              ) : m.status === "live" ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-good">
                  <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-good text-good" />I gang
                </span>
              ) : locked ? (
                <span>Startet {clock(m.kickoff)}</span>
              ) : (
                <span className="num font-semibold text-ink">kl. {clock(m.kickoff)}</span>
              )}
            </div>
          </div>
          <div className="w-full sm:w-64">
            <TipButtons action={setTip} eventId={m.eventId} pick={pick} odds={m.odds} model={m.model} locked={locked || !user} started={locked} result={m.result} />
          </div>
        </div>
        {n > 0 && (
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
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
  };

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-8">
      <PageHeader
        title="Dagens tips"
        intro={
          <>
            Tip 1, X eller 2 og dyst mod vennerne. Et rigtigt tip giver point efter oddsen, da du tippede: en favorit til 1,40 giver 1,4 point, en outsider til 4,50 giver 4,5 point (højst{" "}
            {MAX_TIP_POINTS}). Du kan ændre dit tip, indtil kampen starter.
          </>
        }
      >
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <Link href="/picks/liga#stilling" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
            Stilling og sjove stats i Vennerligaen <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <nav aria-label="Dag" className="flex items-center gap-1 rounded-field border border-line bg-surface p-1 text-sm">
            <Link href={dayHref(prev)} scroll={false} className="flex h-10 w-10 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Forrige dag">
              ←
            </Link>
            <span className="min-w-28 px-2 text-center font-semibold whitespace-nowrap" aria-live="polite">
              {label}
              {offset >= -1 && offset <= 1 && <span className="ml-1.5 text-xs font-normal text-ink-2">{shortDate(shown.start + 12 * 3_600_000)}</span>}
            </span>
            {hasNext ? (
              <Link href={dayHref(next)} scroll={false} className="flex h-10 w-10 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Næste dag">
                →
              </Link>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center text-muted/40" aria-hidden>
                →
              </span>
            )}
          </nav>
        </div>
      </PageHeader>

      {!ACCOUNTS_ENABLED && !DEMO_MODE && <Notice tone="warning">Tipsspillet kræver login, som ikke er slået til på siden endnu.</Notice>}

      {open.length > 0 && user && (
        <div className="flex items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5 text-sm">
          <span className="relative h-10 w-10 shrink-0" aria-hidden>
            <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(tippedOpen / open.length) * 100.5} 100.5`} />
            </svg>
          </span>
          <span className="text-ink-2">
            <span className="num font-semibold text-ink">
              {tippedOpen}/{open.length}
            </span>{" "}
            {tippedOpen === open.length ? "Du har tippet alle kampe, der ikke er startet endnu." : "kampe tippet af dem, der ikke er startet endnu. Tryk 1, X eller 2 for at tippe."}
          </span>
        </div>
      )}

      {matches.length === 0 ? (
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
              <ul className="space-y-3">{open.map(card)}</ul>
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
              <ul className="mt-3 space-y-3">{started.map(card)}</ul>
            </details>
          )}
        </>
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-2/80">
        Under hvert tip står den bedste odds og modellens sandsynlighed. Point er oddsen på dine rigtige tips (1 point uden odds, højst {MAX_TIP_POINTS} pr. tip). Point lægges sammen for
        ugen, og ugens vinder og stillingen står i Vennerligaen. Ved lige mange point vinder den med flest rigtige. Modellen spiller med for sjov og kan ikke vinde ugen. Kampene kommer på,
        når oddsene er klar, typisk dagen før. Kun for sjov, der spilles ikke om penge.
      </p>
    </div>
  );
}
