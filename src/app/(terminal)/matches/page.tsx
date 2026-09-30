import Link from "next/link";
import { LinkTabs, PageHeader, Panel, Signed } from "@/components/ui";
import { SPORTS } from "@/lib/demo/catalog";
import { fmtDateTime, fmtOdds, fmtSignedPct } from "@/lib/format";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Matches · ODDSIQ" };

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live" },
  { id: "results", label: "Results (7 days)" },
] as const;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ tab?: string; sport?: string }> }) {
  const t = await terminal();
  const now = t.now;
  const q = await searchParams;
  const tab = TABS.find((x) => x.id === q.tab)?.id ?? "upcoming";
  const sport = SPORTS.find((s) => s.id === q.sport)?.id ?? "all";

  const ids =
    tab === "results"
      ? t.finishedEvents()
          .filter((e) => e.kickoff > now - 7 * 86_400_000)
          .map((e) => e.id)
      : [...new Set(t.marketRows().filter((r) => r.status === (tab === "live" ? "live" : "scheduled")).sort((a, b) => a.kickoff - b.kickoff).map((r) => r.eventId))];
  const views = ids
    .map((id) => t.matchView(id))
    .filter((v) => v !== undefined)
    .filter((v) => sport === "all" || v.event.sportId === sport);
  const shown = views.slice(0, 120);
  const href = (p: { tab?: string; sport?: string }) => `/matches?tab=${p.tab ?? tab}${(p.sport ?? sport) !== "all" ? `&sport=${p.sport ?? sport}` : ""}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Matches" subtitle="Fixtures, live matches and results across every tracked league. Each row sums up what changed in the main market since it opened; open it for the full timeline." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LinkTabs label="Status" active={tab} items={TABS.map((x) => ({ id: x.id, label: x.label, href: href({ tab: x.id }) }))} />
        <LinkTabs label="Sport" active={sport} items={[{ id: "all", label: "All sports", href: href({ sport: "all" }) }, ...SPORTS.map((s) => ({ id: s.id, label: s.name, href: href({ sport: s.id }) }))]} />
      </div>
      <Panel right={`${views.length} matches${views.length > shown.length ? `, first ${shown.length} shown` : ""}`} title={TABS.find((x) => x.id === tab)!.label}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-2.5 py-2 pl-4 text-left font-medium">Kickoff</th>
                <th className="px-2.5 py-2 text-left font-medium">Match</th>
                <th className="px-2.5 py-2 text-left font-medium">Main market: opening → {tab === "upcoming" ? "now" : "close"}</th>
                <th className="px-2.5 py-2 text-left font-medium">What changed</th>
                <th className="px-2.5 py-2 pr-4 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => {
                const moves = v.selections.map((s, i) => ({ name: s.name, from: v.openingOdds[i], to: v.closingOdds[i], chg: v.closingOdds[i] / v.openingOdds[i] - 1 }));
                const biggest = [...moves].sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))[0];
                const latest = v.minutes.at(-1);
                return (
                  <tr key={v.event.id} className="border-b border-line/60 align-top">
                    <td className="num px-2.5 py-2 pl-4 whitespace-nowrap text-ink-2">{fmtDateTime(v.event.kickoff)}</td>
                    <td className="px-2.5 py-2">
                      <div>
                        {v.event.homeName} <span className="num font-semibold">{v.event.status === "scheduled" ? "vs" : `${v.event.score?.home ?? 0}–${v.event.score?.away ?? 0}`}</span> {v.event.awayName}
                        {v.event.status === "live" && latest && <span className="num ml-2 text-good">{latest.minute}′</span>}
                      </div>
                      <div className="text-[11px] text-muted">
                        {v.event.sportName} · {v.event.leagueName}
                      </div>
                    </td>
                    <td className="num px-2.5 py-2">
                      {moves.map((m, i) => (
                        <div key={m.name} className="whitespace-nowrap">
                          <span className="inline-block w-32 truncate align-bottom text-ink-2">{m.name}</span> {fmtOdds(m.from)} → {fmtOdds(m.to)}
                          {v.results[i] === "won" && <span className="ml-1.5 text-[10px] font-semibold text-good">WON</span>}
                        </div>
                      ))}
                    </td>
                    <td className="px-2.5 py-2 text-ink-2">
                      <div>
                        Largest move {biggest.name} <Signed value={biggest.chg}>{fmtSignedPct(biggest.chg)}</Signed>
                      </div>
                      <div className="text-[11px] text-muted">
                        {v.news.length} news item{v.news.length === 1 ? "" : "s"}
                        {v.lineupConfirmedAt ? " · lineups confirmed" : ""}
                        {v.xg ? ` · xG ${v.xg.home.toFixed(2)}–${v.xg.away.toFixed(2)}` : ""}
                        {v.preMatchModel.some((p) => p !== null) ? " · prediction ledgered" : ""}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 pr-4 text-right text-xs whitespace-nowrap">
                      <Link href={v.event.status === "finished" && !t.live ? `/market-replay?event=${v.event.id}` : `/markets/${v.selections[0].id}#what-changed`} className="text-accent hover:underline">
                        What changed?
                      </Link>
                      {v.event.status === "live" && (
                        <Link href={`/live?event=${v.event.id}`} className="ml-3 text-accent hover:underline">
                          Live terminal
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Consensus odds across tracked bookmakers. Changes are listed as facts; causes are not inferred. Times are UTC. {t.dataLabel}.</p>
      </Panel>
    </div>
  );
}
