import Link from "next/link";
import { removePosition } from "@/app/actions";
import { PageHeader, Panel, Signed, Tip } from "@/components/ui";
import { positionSummary, positionViewOf } from "@/lib/demo/personal";
import { fmtDateTime, fmtInt, fmtOdds, fmtPct, fmtSignedPct } from "@/lib/format";
import { CLV_METHODOLOGY } from "@/lib/metrics/clv";
import { readPositions } from "@/lib/personal-store";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "My Bets · ODDSIQ" };

const th = "px-2.5 py-2 font-medium";

export default async function MyBetsPage() {
  const t = await terminal();
  const ctx = await t.personal();
  const positions = await readPositions();
  const views = positions.map((p, index) => ({ index, v: positionViewOf(p, ctx) })).filter((x) => x.v !== null);
  const s = positionSummary(views.map((x) => x.v!));

  const stat = (label: React.ReactNode, value: React.ReactNode, note: string) => (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="num mt-1 text-xl">{value}</div>
      <div className="text-[11px] text-muted">{note}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Bets"
        subtitle="Prices you chose to track with the “Track price” button on a market page, measured the same way as the model's ledger: closing line value first, results second. Nothing is placed with a bookmaker."
        right={<span className="text-xs text-muted">Saved in this browser until accounts arrive</span>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stat("Tracked", fmtInt(s.n), `${fmtInt(s.settled)} settled`)}
        {stat(<Tip text={CLV_METHODOLOGY}>Average CLV</Tip>, <Signed value={s.avgClv}>{fmtSignedPct(s.avgClv)}</Signed>, `n = ${s.clvN} past kickoff · ${fmtPct(s.positiveClvShare, 0)} positive`)}
        {stat("Won", s.settled ? `${s.wins} of ${s.settled}` : "—", "settled positions")}
        {stat("Simulated result", s.settled ? <Signed value={s.profit}>{`${s.profit >= 0 ? "+" : "−"}${Math.abs(s.profit).toFixed(2)} u`}</Signed> : "—", "1 unit per position, at tracked odds")}
      </div>

      <Panel title="Tracked positions" right="Newest first">
        {views.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Nothing tracked yet. Open any pre-match market, for example from the{" "}
            <Link href="/value-scanner" className="text-accent hover:underline">
              Value Scanner
            </Link>
            , and press &ldquo;+ Track price&rdquo;.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                  <th className={`${th} pl-4 text-left`}>Tracked</th>
                  <th className={`${th} text-left`}>Match · selection</th>
                  <th className={`${th} text-right`}>Odds tracked</th>
                  <th className={`${th} text-right`}>Now / close</th>
                  <th className={`${th} text-right`}>CLV</th>
                  <th className={`${th} text-right`}>Result</th>
                  <th className={`${th} pr-4 text-right`} />
                </tr>
              </thead>
              <tbody>
                {[...views].reverse().map(({ index, v }) => (
                  <tr key={`${v!.selectionId}-${v!.at}`} className="border-b border-line/60">
                    <td className="num px-2.5 py-2 pl-4 whitespace-nowrap text-ink-2">{fmtDateTime(v!.at)}</td>
                    <td className="px-2.5 py-2">
                      <Link href={`/markets/${v!.selectionId}`} className="hover:text-accent">
                        {v!.match}
                      </Link>
                      <div className="text-[11px] text-muted">
                        {v!.market}: {v!.selection}
                      </div>
                    </td>
                    <td className="num px-2.5 py-2 text-right">{fmtOdds(v!.odds)}</td>
                    <td className="num px-2.5 py-2 text-right">
                      {fmtOdds(v!.referenceOdds)} <span className="text-[10.5px] text-muted">{v!.provisional ? "now" : "close"}</span>
                    </td>
                    <td className="num px-2.5 py-2 text-right">
                      <Signed value={v!.clv}>{fmtSignedPct(v!.clv)}</Signed>
                      {v!.provisional && <span className="ml-1 text-[10.5px] text-muted">provisional</span>}
                    </td>
                    <td className={`px-2.5 py-2 text-right text-xs font-semibold uppercase ${v!.result === "won" ? "text-good" : "text-muted"}`}>{v!.result ?? v!.status}</td>
                    <td className="px-2.5 py-2 pr-4 text-right">
                      <form action={removePosition}>
                        <input type="hidden" name="index" value={index} />
                        <button type="submit" className="text-[11px] text-muted hover:text-ink">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-muted">
          CLV before kickoff is provisional and uses the current margin-free price; after kickoff it uses the closing price. {CLV_METHODOLOGY} Your tracked list is personal and can be edited; the model&rsquo;s own prediction ledger cannot.{t.live ? ` Positions on matches that kicked off more than 7 days ago drop out of this list. ${t.dataLabel}.` : " DEMO DATA."}
        </p>
      </Panel>
    </div>
  );
}
