import { Badge, PageHeader, Panel } from "@/components/ui";
import { wallClock } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { fmtAgo, fmtOdds, fmtPct, fmtShortDateTime } from "@/lib/format";
import { CLOSE_MAX_AGE_MS } from "@/lib/providers/closing";
import { feedConfig } from "@/lib/providers/config";
import { feedOverview } from "@/lib/providers/overview";
import { API_FOOTBALL } from "@/lib/stats/api-football";
import { statsConfig } from "@/lib/stats/config";

export const metadata = { title: "Data Feed · ODDSIQ" };

function Setup({ keySet, statsKeySet }: { keySet: boolean; statsKeySet: boolean }) {
  return (
    <Panel title="Connect the odds feed">
      <ol className="list-decimal space-y-1.5 px-8 py-3 text-sm text-ink-2">
        <li className={DATABASE_CONFIGURED ? "text-muted line-through" : ""}>Add a Postgres database and set DATABASE_URL, then run the migrations (npm run db:migrate).</li>
        <li className={keySet ? "text-muted line-through" : ""}>Create a free account at the-odds-api.com and set ODDS_API_KEY to the key it emails you.</li>
        <li className={statsKeySet ? "text-muted line-through" : ""}>Optional, for lineups, injuries and xG: create an account at api-football.com and set STATS_API_KEY to the key on its dashboard.</li>
        <li>Set CRON_SECRET and schedule GET /api/cron/ingest (the included vercel.json runs it every six hours).</li>
      </ol>
    </Panel>
  );
}

export default async function DataFeedPage() {
  const now = await wallClock();
  const cfg = feedConfig();
  const stats = statsConfig();
  const ready = DATABASE_CONFIGURED && cfg.apiKey !== null;
  const data = DATABASE_CONFIGURED ? await feedOverview(db(), now) : null;
  const last = data?.runs.find((r) => r.provider !== API_FOOTBALL);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data Feed"
        subtitle="Real bookmaker prices from The Odds API, stored as snapshots, and team news (lineups, injuries, xG) from API-Football."
        right={<Badge tone={!ready ? "neutral" : last?.error ? "critical" : last ? "good" : "warning"}>{!ready ? "Not connected" : last?.error ? "Last run failed" : last ? "Connected" : "Waiting for first run"}</Badge>}
      />

      {(!ready || stats.apiKey === null) && <Setup keySet={cfg.apiKey !== null} statsKeySet={stats.apiKey !== null} />}

      <Panel title="Settings">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-4">
          <dt className="text-muted">Competitions</dt>
          <dd className="num">{cfg.sports.join(", ")}</dd>
          <dt className="text-muted">Regions</dt>
          <dd className="num">{cfg.regions}</dd>
          <dt className="text-muted">Markets</dt>
          <dd className="num">{cfg.markets}</dd>
          <dt className="text-muted">Credits per run</dt>
          <dd className="num">{cfg.creditsPerRun} + results</dd>
          <dt className="text-muted">Team news</dt>
          <dd>{stats.apiKey ? "API-Football" : "Not connected"}</dd>
          <dt className="text-muted">Stats requests per run</dt>
          <dd className="num">up to {stats.budget}</dd>
        </dl>
      </Panel>

      {data && (
        <>
          <Panel title="Feed events" right={<span className="text-xs text-muted">Live · consensus = mean de-vigged probability across bookmakers</span>}>
            {data.events.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No feed events stored yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2 font-normal">Kickoff (UTC)</th>
                      <th className="px-2 py-2 font-normal">Match</th>
                      <th className="px-2 py-2 font-normal">Price basis</th>
                      <th className="px-2 py-2 font-normal">Median odds · fair probability</th>
                      <th className="px-2 py-2 text-right font-normal">Books</th>
                      <th className="px-4 py-2 text-right font-normal">Snapshots</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.events.map((e) => (
                      <tr key={e.id}>
                        <td className="num whitespace-nowrap px-4 py-2 text-ink-2">{fmtShortDateTime(e.kickoff)}</td>
                        <td className="px-2 py-2">
                          <div>
                            {e.home} v {e.away} {e.score && <span className="num text-ink-2">{e.score}</span>}
                          </div>
                          <div className="text-xs text-muted">
                            {e.league} · {e.status}
                            {e.teamNews && (
                              <>
                                {e.teamNews.absences !== null && ` · ${e.teamNews.absences} out or doubtful`}
                                {e.teamNews.lineups && " · lineups confirmed"}
                                {e.teamNews.xg && ` · xG ${e.teamNews.xg}`}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs text-ink-2">{e.line ? (e.line.basis === "closing" ? "Closing line" : "Latest") : "—"}</td>
                        <td className="px-2 py-2">
                          {e.line ? (
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {e.line.selections.map((s, i) => (
                                <span key={s.selectionId} className="whitespace-nowrap">
                                  <span className="text-xs text-muted">{e.line!.names[i]} </span>
                                  <span className="num">{fmtOdds(s.medianOdds)}</span> <span className="num text-xs text-ink-2">{fmtPct(s.fairProbability)}</span>
                                  {e.line!.results[i] === "won" && <Badge className="ml-1">Won</Badge>}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted">No complete prices within {CLOSE_MAX_AGE_MS / 3_600_000} h</span>
                          )}
                        </td>
                        <td className="num px-2 py-2 text-right">{e.line?.books ?? 0}</td>
                        <td className="num px-4 py-2 text-right text-ink-2">{e.snapshots}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              Live data, not a model. The closing line is each bookmaker&apos;s last price at or before kickoff, from runs no more than six hours before it. Prices are only as fresh as the last run.
            </p>
          </Panel>

          <Panel title="Recent runs">
            {data.runs.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No runs yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {data.runs.map((r) => (
                  <li key={r.id.toString()} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
                    <span className="num text-ink-2">
                      {fmtShortDateTime(r.startedAt.getTime())} · {fmtAgo(now - r.startedAt.getTime())}
                    </span>
                    <span className="num text-xs">
                      {r.provider === API_FOOTBALL
                        ? `Team news · ${r.events} matches · ${r.snapshots} updates · ${r.creditsUsed ?? 0} requests${r.creditsRemaining !== null ? ` · ${r.creditsRemaining} left today` : ""}`
                        : `Odds · ${r.events} events · ${r.snapshots} prices · ${r.results} results${r.creditsRemaining !== null ? ` · ${r.creditsRemaining} credits left` : ""}`}
                    </span>
                    {r.error && <span className="w-full text-xs text-critical">{r.error.slice(0, 300)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
