// The tipping game's standings: the week's winner, this week's table, fun stats
// and the all-time table. Shown in Vennerligaen; the tips themselves are on /tips.

import { shortDate } from "@/lib/format";
import { funStats, MODEL_ID, standings, weekById, weekWinners, type Standing, type Tip, type Week } from "@/lib/tips";

const weekLabel = (w: Week) => `Uge ${w.number}`;

function Table({ rows, me, empty }: { rows: Standing[]; me?: string; empty: string }) {
  if (!rows.length) return <p className="px-5 py-6 text-center text-sm text-ink-2">{empty}</p>;
  let place = 0;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-2">
          <th className="w-8 px-4 py-2.5 font-medium">#</th>
          <th className="px-1 py-2 font-normal">Navn</th>
          <th className="px-2 py-2 text-right font-normal">Tips</th>
          <th className="px-2 py-2 text-right font-normal">Rigtige</th>
          <th className="px-4 py-2 text-right font-normal" title="Et rigtigt tip giver point efter oddsen: jo mindre sandsynligt, jo flere point">Point</th>
        </tr>
      </thead>
      <tbody className="num whitespace-nowrap">
        {rows.map((r) => {
          const model = r.userId === MODEL_ID;
          if (!model) place++;
          return (
            <tr key={r.userId} className={`border-t border-line ${r.userId === me ? "bg-accent-soft/60" : ""} ${model ? "text-ink-2" : ""}`}>
              <td className="px-4 py-2.5">{model ? "" : <span className={`figure text-lg ${place === 1 ? "text-accent" : "text-muted"}`}>{place}</span>}</td>
              <td className="max-w-[9rem] truncate px-1 py-2 font-sans font-medium">
                {model ? <span className="italic">Modellen</span> : r.name}
                {r.userId === me && <span className="ml-1.5 text-xs font-normal text-muted">(dig)</span>}
              </td>
              <td className="px-2 py-2 text-right text-ink-2">{r.tips}</td>
              <td className="px-2 py-2 text-right text-ink-2">{r.correct}</td>
              <td className="px-4 py-2 text-right font-semibold">{r.points.toFixed(1).replace(".", ",")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * `tips` are all stored tips (friends'); `modelWeek` the model's tips for `week`.
 * `previous` is the week whose winner is shown while `week` is still being played.
 */
export function TipsStandings({ tips, modelWeek, week, previous, now, me, source }: { tips: Tip[]; modelWeek: Tip[]; week: Week; previous: Week; now: number; me?: string; source: string }) {
  const weekTips = tips.filter((x) => x.week === week.id);
  const table = standings([...weekTips, ...modelWeek]);
  const winners = weekWinners(tips);
  const shownWinner = winners.find((w) => w.week === (week.end <= now ? week.id : previous.id));
  const allTime = standings(tips.filter((x) => x.userId !== MODEL_ID)).slice(0, 10);
  const stats = funStats(tips, winners);
  const label = (id: string) => {
    const w = weekById(id);
    return w ? weekLabel(w) : id;
  };

  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <div className="space-y-5">
        {shownWinner && (
          <section className="rounded-card border border-accent/35 bg-accent-soft p-5">
            <div className="eyebrow text-accent">Ugens vinder · {label(shownWinner.week)}</div>
            <div className="display mt-3 text-[36px]">{shownWinner.winners.map((w) => w.name).join(" og ")}</div>
            <div className="mt-1 text-sm text-ink-2">
              {shownWinner.winners[0].points.toFixed(1).replace(".", ",")} point · {shownWinner.winners[0].correct} rigtige af {shownWinner.winners[0].settled}
            </div>
          </section>
        )}

        <section id="stilling" className="scroll-mt-20 overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3.5">
            <h3 className="text-md font-semibold">Stillingen i tipsspillet</h3>
            <span className="text-xs text-muted">{weekLabel(week)}</span>
          </div>
          <Table rows={table} me={me} empty="Ingen har tippet i denne uge endnu." />
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            {week.end <= now ? "Historisk" : "Live"}, {weekLabel(week).toLowerCase()} ({shortDate(week.start)} til {shortDate(week.end - 1)}), {weekTips.length} tips · {source}.
          </p>
        </section>
      </div>

      <div className="space-y-5">
        {stats.length > 0 && (
          <section className="rounded-card border border-line bg-surface">
            <h3 className="border-b border-line px-4 py-3.5 text-md font-semibold">Sjove stats</h3>
            <ul className="divide-y divide-line">
              {stats.map((s) => (
                <li key={s.id} className="space-y-1 px-4 py-3">
                  <div className="eyebrow">{s.title}</div>
                  <div className="text-sm">
                    <span className="font-semibold">{s.name}</span> <span className="text-ink-2">· {s.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">Historisk, alle afgjorte tips siden spillet startede · {source}.</p>
          </section>
        )}

        <section className="overflow-hidden rounded-card border border-line bg-surface">
          <h3 className="border-b border-line px-4 py-3.5 text-md font-semibold">Tipsspillet, hele tiden</h3>
          <Table rows={allTime} me={me} empty="Ingen tips endnu." />
          {winners.length > 0 && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Tidligere vindere: {winners.slice(0, 6).map((w) => `${label(w.week)} ${w.winners.map((x) => x.name).join(" og ")}`).join(", ")}.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
