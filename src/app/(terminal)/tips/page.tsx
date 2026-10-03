import Link from "next/link";
import { setTip } from "@/app/tips-actions";
import { TipButtons } from "@/components/TipButtons";
import { requireFriend } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/data";
import { db } from "@/lib/db";
import { demoTips } from "@/lib/demo/tips";
import { readTips } from "@/lib/real/tips";
import { terminal } from "@/lib/terminal";
import {
  funStats,
  MODEL_ID,
  MODEL_NAME,
  modelTips,
  nextWeek,
  previousWeek,
  SIDE_LABEL,
  standings,
  tipCounts,
  weekById,
  weekMatches,
  weekOf,
  weekWinners,
  type Side,
  type Standing,
  type Tip,
  type TipMatch,
  type Week,
} from "@/lib/tips";

export const metadata = { title: "Ugens tips · Oddsanalyse" };

const TZ = "Europe/Copenhagen";
const day = (t: number) => new Date(t).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const time = (t: number) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const dateShort = (t: number) => new Date(t).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const weekLabel = (w: Week) => `Uge ${w.number}`;

/** Model tips for a week: from the page's matches, plus the model's stored pick on older matches the page no longer shows. */
function modelWeekTips(matches: TipMatch[], tips: Tip[], week: string): Tip[] {
  const out = modelTips(matches, week);
  const seen = new Set(out.map((t) => t.eventId));
  for (const t of tips)
    if (t.week === week && t.modelPick && !seen.has(t.eventId)) {
      seen.add(t.eventId);
      out.push({ ...t, userId: MODEL_ID, name: MODEL_NAME, pick: t.modelPick, odds: t.modelPick === t.pick ? t.odds : null });
    }
  return out;
}

function Table({ rows, me, empty }: { rows: Standing[]; me?: string; empty: string }) {
  if (!rows.length) return <p className="px-5 py-6 text-center text-sm text-ink-2">{empty}</p>;
  let place = 0;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="w-8 px-4 py-2 font-normal">#</th>
          <th className="px-1 py-2 font-normal">Navn</th>
          <th className="px-2 py-2 text-right font-normal">Tips</th>
          <th className="px-4 py-2 text-right font-normal">Point</th>
        </tr>
      </thead>
      <tbody className="num whitespace-nowrap">
        {rows.map((r) => {
          const model = r.userId === MODEL_ID;
          if (!model) place++;
          return (
            <tr key={r.userId} className={`border-t border-line ${r.userId === me ? "bg-accent/5" : ""} ${model ? "text-ink-2" : ""}`}>
              <td className="px-4 py-2 text-muted">{model ? "" : place}</td>
              <td className="max-w-[9rem] truncate px-1 py-2 font-sans font-medium">
                {model ? <span className="italic">Modellen</span> : r.name}
                {r.userId === me && <span className="ml-1.5 text-xs font-normal text-muted">(dig)</span>}
              </td>
              <td className="px-2 py-2 text-right text-ink-2">{r.tips}</td>
              <td className="px-4 py-2 text-right font-semibold">{r.correct}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function TipsPage({ searchParams }: { searchParams: Promise<{ uge?: string }> }) {
  const user = await requireFriend("/tips");
  const t = await terminal();
  const q = await searchParams;
  const current = weekOf(t.now);
  const week = (q.uge && weekById(q.uge)) || current;

  const all = weekMatches(t.marketRows(), { start: -Infinity, end: Infinity });
  const known = new Map(all.map((m) => [m.eventId, m.result]));
  const stored = ACCOUNTS_ENABLED ? await readTips(db(), t.now, known) : [];
  const tips = DEMO_MODE ? [...demoTips(all), ...stored] : stored;

  const matches = all.filter((m) => m.kickoff >= week.start && m.kickoff < week.end);
  const weekTips = tips.filter((x) => x.week === week.id);
  const table = standings([...weekTips, ...modelWeekTips(matches, tips, week.id)]);
  const mine = new Map(weekTips.filter((x) => x.userId === user?.id).map((x) => [x.eventId, x.pick]));
  const winners = weekWinners(tips);
  const shownWinner = winners.find((w) => w.week === (week.end <= t.now ? week.id : previousWeek(current).id));
  const allTime = standings(tips.filter((x) => x.userId !== MODEL_ID)).slice(0, 10);
  const stats = funStats(tips, winners);

  const open = matches.filter((m) => m.kickoff > t.now);
  const tippedOpen = open.filter((m) => mine.has(m.eventId)).length;
  const days = [...new Set(matches.map((m) => day(m.kickoff)))];
  const prev = previousWeek(week);
  const next = nextWeek(week);
  const hasNext = all.some((m) => m.kickoff >= next.start && m.kickoff < next.end);
  const weekHref = (w: Week) => (w.id === current.id ? "/tips" : `/tips?uge=${w.id}`);
  const source = DEMO_MODE ? "DEMO DATA" : `vennernes egne tips, afgjort med kampresultater fra ${t.dataLabel}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Ugens tips</h1>
              <p className="mt-2 max-w-xl text-[15px] text-ink-2">
                Tip 1, X eller 2 på ugens kampe og dyst mod vennerne. Et rigtigt tip giver 1 point. Du kan ændre dit tip, indtil kampen starter.
              </p>
              <a href="#stilling" className="mt-2 inline-block text-sm font-medium text-accent hover:underline lg:hidden">
                Se stillingen ↓
              </a>
            </div>
            <nav aria-label="Uge" className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
              <Link href={weekHref(prev)} scroll={false} className="rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Forrige uge">
                ←
              </Link>
              <span className="px-2 font-medium whitespace-nowrap">
                {weekLabel(week)}
                {week.id === current.id && <span className="ml-1.5 text-xs font-normal text-muted">denne uge</span>}
              </span>
              {hasNext || week.id !== current.id ? (
                <Link href={weekHref(next)} scroll={false} className="rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Næste uge">
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
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="num shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
              {tippedOpen}/{open.length}
            </span>
            <span className="text-ink-2">
              {tippedOpen === open.length ? "Du har tippet alle kampe, der ikke er startet endnu." : "kampe tippet af dem, der ikke er startet endnu. Tryk 1, X eller 2 for at tippe."}
            </span>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-5 py-10 text-center text-sm text-ink-2">
            {week.start > t.now ? "Kampene i denne uge er ikke klar endnu." : week.end <= t.now ? "Siden har ikke kampene fra denne uge længere." : "Der er ingen kampe klar endnu."} Kampene kommer på, når oddsene er klar, typisk dagen
            før.
          </div>
        ) : (
          days.map((d) => (
            <section key={d} className="space-y-2">
              <h2 className="px-1 text-sm font-semibold text-ink-2">{cap(d)}</h2>
              <ul className="space-y-2">
                {matches
                  .filter((m) => day(m.kickoff) === d)
                  .map((m) => {
                    const locked = m.kickoff <= t.now;
                    const pick = mine.get(m.eventId) ?? null;
                    const counts = tipCounts(weekTips, m.eventId);
                    const n = counts.home + counts.draw + counts.away;
                    return (
                      <li key={m.eventId} id={m.eventId} className="rounded-2xl border border-line bg-surface p-4">
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
                                <span>Startet {time(m.kickoff)}</span>
                              ) : (
                                <span>{time(m.kickoff)}</span>
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
          ))
        )}

        <p className="px-1 text-xs text-muted">
          Under hvert tip står den bedste odds og modellens sandsynlighed. Ved lige mange point vinder den, hvis rigtige tips havde den højeste samlede odds. Modellen spiller med for sjov og kan ikke
          vinde ugen. Kampene kommer på, når oddsene er klar, typisk dagen før. Kun for sjov, der spilles ikke om penge.
        </p>
      </div>

      <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
        {shownWinner && (
          <section className="rounded-2xl border border-warning/40 bg-warning/10 p-5">
            <div className="text-xs font-semibold tracking-wide text-warning uppercase">Ugens vinder · {weekLabel(weekById(shownWinner.week)!)}</div>
            <div className="mt-2 text-2xl font-semibold">{shownWinner.winners.map((w) => w.name).join(" og ")}</div>
            <div className="mt-1 text-sm text-ink-2">
              {shownWinner.winners[0].correct} rigtige af {shownWinner.winners[0].settled}
            </div>
          </section>
        )}

        <section id="stilling" className="scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Stillingen</span>
            <span className="text-xs text-muted">{weekLabel(week)}</span>
          </div>
          <Table rows={table} me={user?.id} empty="Ingen har tippet i denne uge endnu." />
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            {week.end <= t.now ? "Historisk" : "Live"}, {weekLabel(week).toLowerCase()} ({dateShort(week.start)} til {dateShort(week.end - 1)}), {weekTips.length} tips · {source}.
          </p>
        </section>

        {stats.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">Sjove stats</div>
            <ul className="divide-y divide-line">
              {stats.map((s) => (
                <li key={s.id} className="px-4 py-2.5">
                  <div className="text-xs text-muted">{s.title}</div>
                  <div className="text-sm">
                    <span className="font-semibold">{s.name}</span> <span className="text-ink-2">· {s.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">Historisk, alle afgjorte tips siden spillet startede · {source}.</p>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">Hele tiden</div>
          <Table rows={allTime} me={user?.id} empty="Ingen tips endnu." />
          {winners.length > 0 && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Tidligere vindere: {winners.slice(0, 6).map((w) => `${weekLabel(weekById(w.week)!)} ${w.winners.map((x) => x.name).join(" og ")}`).join(", ")}.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
