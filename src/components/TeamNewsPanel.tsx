import { Badge, Panel } from "@/components/ui";
import { fmtShortDateTime } from "@/lib/format";
import type { TeamNews, XgForm } from "@/lib/stats/news";

const form = (f: XgForm | null) => (f ? `${f.xgFor.toFixed(2)} for · ${f.xgAgainst.toFixed(2)} against (${f.n} match${f.n === 1 ? "" : "es"})` : "No xG yet");

/** Lineups, absences and xG from the statistics feed (live data only). */
export function TeamNewsPanel({ news, home, away }: { news: TeamNews | null; home: string; away: string }) {
  const sides = [
    { side: "home" as const, name: home },
    { side: "away" as const, name: away },
  ];
  return (
    <Panel title="Team news" right={news ? `API-Football · synced ${fmtShortDateTime(news.syncedAt)} UTC` : "Statistics feed"}>
      {!news ? (
        <p className="px-4 py-3 text-sm text-muted">No team news for this match yet. It appears once the statistics feed (STATS_API_KEY) has matched the fixture.</p>
      ) : (
        <div className="grid gap-px bg-line sm:grid-cols-2">
          {sides.map(({ side, name }) => {
            const lineup = news.lineups.find((l) => l.side === side);
            const out = news.injuries.filter((i) => i.side === side);
            return (
              <div key={side} className="space-y-3 bg-surface px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{name}</span>
                  {news.xg && <span className="num text-ink-2">xG {news.xg[side].toFixed(2)}</span>}
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted">xG form</div>
                  <div className="num text-xs text-ink-2">{form(news.form[side])}</div>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted">Out or doubtful</div>
                  {news.injuriesAt === null ? (
                    <div className="text-xs text-muted">Not checked yet. Lists are checked from two days before kickoff.</div>
                  ) : out.length === 0 ? (
                    <div className="text-xs text-muted">None listed.</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {out.map((i) => (
                        <li key={i.player} className="flex justify-between gap-2 text-xs">
                          <span className="truncate">
                            {i.player} <span className="text-muted">· {i.reason}</span>
                          </span>
                          <Badge tone={i.status === "out" ? "critical" : "warning"}>{i.status === "out" ? "Out" : "Doubtful"}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted">
                    Lineup{lineup?.formation ? ` · ${lineup.formation}` : ""}
                    {lineup?.coach ? ` · ${lineup.coach}` : ""}
                  </div>
                  {lineup ? (
                    <ol className="grid grid-cols-2 gap-x-3 text-xs text-ink-2">
                      {lineup.startXI.map((p, i) => (
                        <li key={i} className="truncate">
                          <span className="num inline-block w-5 text-muted">{p.number ?? ""}</span>
                          {p.name}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-xs text-muted">Not published yet. Lineups usually appear about an hour before kickoff.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Shown for context. The model&apos;s probabilities do not use lineups, absences or xG yet{news?.lineupsAt ? `; lineups confirmed ${fmtShortDateTime(news.lineupsAt)} UTC` : ""}.
      </p>
    </Panel>
  );
}
