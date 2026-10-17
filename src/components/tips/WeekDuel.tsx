// The top of Vennerligaen: this week's podium in the tipping game and, for the signed-in
// friend, their own week (place, points, streak and how many of today's matches they tipped).

import Link from "next/link";
import { shortDate } from "@/lib/format";
import {
  MODEL_ID,
  standings,
  type Standing,
  type Tip,
  type Week,
} from "@/lib/tips";

const pts = (x: number) => x.toFixed(1).replace(".", ",");

/** Correct tips in a row, counted back from the newest settled tip. */
export function currentStreak(tips: Tip[], me: string): number {
  const mine = tips
    .filter((t) => t.userId === me && t.result)
    .sort((a, b) => b.kickoff - a.kickoff);
  let n = 0;
  for (const t of mine) {
    if (t.result !== t.pick) break;
    n++;
  }
  return n;
}

const STEP = [
  { h: "h-24 sm:h-28", tone: "bg-accent text-on-accent", label: "1" },
  { h: "h-16 sm:h-20", tone: "bg-surface-3 text-ink", label: "2" },
  { h: "h-12 sm:h-14", tone: "bg-surface-2 text-ink-2", label: "3" },
];

function Podium({ top }: { top: Standing[] }) {
  // Second place stands left of the winner and third to the right, as on a real podium.
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <ol
      className="grid grid-cols-3 items-end gap-2 sm:gap-3"
      aria-label="Top 3 i ugen"
    >
      {order.map((i) => {
        const r = top[i];
        return (
          <li
            key={r.userId}
            className={`flex min-w-0 flex-col items-center text-center ${i === 0 ? "col-start-2 row-start-1" : i === 1 ? "col-start-1 row-start-1" : "col-start-3 row-start-1"}`}
          >
            <span
              className={`truncate font-semibold ${i === 0 ? "text-md sm:text-lg" : "text-sm"} max-w-full`}
            >
              {r.name}
            </span>
            <span className="num mb-2 text-xs text-ink-2">
              {pts(r.points)} point · {r.correct} rigtige
            </span>
            <span
              className={`flex w-full items-start justify-center rounded-t-[10px] pt-2 ${STEP[i].h} ${STEP[i].tone}`}
            >
              <span className="figure text-2xl">{STEP[i].label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Ring({ done, total }: { done: number; total: number }) {
  return (
    <span
      className="relative flex h-14 w-14 shrink-0 items-center justify-center"
      aria-hidden
    >
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="4"
        />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${total ? (done / total) * 100.5 : 0} 100.5`}
        />
      </svg>
      <span className="num text-xs font-semibold">
        {done}/{total}
      </span>
    </span>
  );
}

export function WeekDuel({
  tips,
  modelWeek,
  week,
  now,
  me,
  open,
  tippedOpen,
  tipHref,
  loginHref,
  source,
}: {
  tips: Tip[];
  modelWeek: Tip[];
  week: Week;
  now: number;
  me?: string;
  /** Matches that can still be tipped today, and how many of them the friend has tipped. */
  open: number;
  tippedOpen: number;
  tipHref: string;
  loginHref: string | null;
  source: string;
}) {
  const weekTips = tips.filter((x) => x.week === week.id);
  const table = standings(weekTips);
  const scored = table.filter((r) => r.points > 0);
  const model = standings(modelWeek)[0];
  const place = me ? table.findIndex((r) => r.userId === me) : -1;
  const mine = place >= 0 ? table[place] : null;
  const streak = me
    ? currentStreak(
        tips.filter((t) => t.userId !== MODEL_ID),
        me,
      )
    : 0;
  const leader = scored[0];
  // Without a signed-in friend or a way to sign in (the demo), there is no "your week" to show.
  const solo = !me && !loginHref;
  const behind =
    mine && leader && leader.userId !== mine.userId
      ? leader.points - mine.points
      : 0;

  return (
    <section
      aria-labelledby="ugens-dyst"
      className={`rise grid gap-px overflow-hidden rounded-card border border-line bg-line [--i:1] ${solo ? "" : "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"}`}
    >
      <div className="bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ugens-dyst" className="eyebrow">
            Ugens dyst · Uge {week.number}
          </h2>
          <span className="text-xs text-muted">
            {shortDate(week.start)} til {shortDate(week.end - 1)}
          </span>
        </div>
        {scored.length ? (
          <div className="mt-5">
            <Podium top={scored.slice(0, 3)} />
          </div>
        ) : (
          <div className="mt-5 rounded-field border border-dashed border-line-strong px-4 py-6 text-center">
            <div className="display text-[28px]">Podiet er tomt</div>
            <p className="mt-1 text-sm text-ink-2">
              Første rigtige tip i ugen tager føringen.
            </p>
            {table.length > 0 && (
              <ul
                className="mt-4 flex flex-wrap justify-center gap-2"
                aria-label="Med i ugen"
              >
                {table.map((r) => (
                  <li
                    key={r.userId}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${r.userId === me ? "border-accent/50 bg-accent-fill text-accent" : "border-line bg-surface-2 text-ink-2"}`}
                  >
                    {r.name} · {r.tips} {r.tips === 1 ? "tip" : "tips"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
          {model && model.settled > 0 ? (
            <>
              Modellen spiller med for sjov og står på{" "}
              <span className="num font-semibold text-ink">
                {pts(model.points)} point
              </span>
              .{" "}
              {leader
                ? leader.points > model.points
                  ? `${leader.name} slår den lige nu.`
                  : "Kan I slå den?"
                : "Kan I slå den?"}
            </>
          ) : (
            "Modellen spiller med for sjov, men kan ikke vinde ugen."
          )}{" "}
          <span className="text-muted">
            {week.end <= now ? "Historisk" : "Live"}, {weekTips.length} tips ·{" "}
            {source}.
          </span>
        </p>
      </div>

      {!solo && (
        <div className="flex flex-col bg-surface p-5 sm:p-6">
          <h2 className="eyebrow">Din uge</h2>
          {!me ? (
            <div className="mt-4 flex flex-1 flex-col justify-center gap-3">
              <p className="text-md text-ink-2">
                {loginHref
                  ? "Log ind for at tippe og komme med i ligaen."
                  : "Din plads, dine point og din stime står her, når du er logget ind."}
              </p>
              {loginHref && (
                <Link
                  href={loginHref}
                  className="font-semibold text-accent hover:underline"
                >
                  Log ind →
                </Link>
              )}
            </div>
          ) : (
            <>
              <dl className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-xs text-ink-2">Plads</dt>
                  <dd className="figure mt-1 text-[34px] leading-none">
                    {mine ? place + 1 : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-2">Point</dt>
                  <dd className="figure mt-1 text-[34px] leading-none">
                    {mine ? pts(mine.points) : "0"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-2">Stime</dt>
                  <dd
                    className={`figure mt-1 text-[34px] leading-none ${streak >= 2 ? "text-accent" : ""}`}
                  >
                    {streak}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-ink-2">
                {!mine
                  ? "Du har ikke tippet i denne uge endnu."
                  : behind > 0
                    ? `${pts(behind)} point efter ${leader!.name}.`
                    : mine.points > 0
                      ? "Du fører ugen. Hold fast!"
                      : `${mine.tips} ${mine.tips === 1 ? "tip" : "tips"} afgives, når kampene er spillet.`}
                {streak >= 2 && ` ${streak} rigtige i træk.`}
              </p>
              <div className="mt-auto flex items-center gap-4 border-t border-line pt-4">
                {open > 0 ? (
                  <>
                    <Ring done={tippedOpen} total={open} />
                    <span className="min-w-0 text-sm text-ink-2">
                      {tippedOpen === open ? (
                        "Alle dagens kampe er tippet."
                      ) : (
                        <>
                          <span className="font-semibold text-ink">
                            {open - tippedOpen} kampe
                          </span>{" "}
                          mangler dit tip i dag.{" "}
                          <Link
                            href={tipHref}
                            className="font-semibold text-accent hover:underline"
                          >
                            Tip nu →
                          </Link>
                        </>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-ink-2">
                    Ingen flere kampe at tippe i dag.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
