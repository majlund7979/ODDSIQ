// A corners, cards or fouls suggestion: the line, how many the teams are
// expected to get, and the over/under chance at each line.

import { lineLabel, type CountPick } from "@/lib/picks";
import { dec } from "@/lib/format";
import { AdviceRow, type SaveTarget } from "../Advice";
import { CardTop, Fact, Gauge, MatchTitle, MoreToggle, SplitBar, StatBox } from "../BetCard";
import { NewsBlock } from "../facts";

export function CountCard({ p, rank, now, save }: { p: CountPick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  const f = p.forecast;
  const leagueAvg = f.league.homeMean + f.league.awayMean;
  const vs = Math.round(f.suggestion.vsLeague * 100);
  return (
    <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <MatchTitle home={home} away={away} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-lime-soft px-3.5 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
            <span className="text-sm text-ink-2">
              Forventet <span className="num font-semibold text-ink">{dec(f.expected.total, 1)}</span> · {vs === 0 ? "som ligasnittet" : `${Math.abs(vs)} % ${vs > 0 ? "over" : "under"} ligasnittet`} ·
              50/50-linjen {lineLabel(f.fairLine)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <StatBox label="Fair odds" value={dec(p.fairOdds)} sub={`for ${f.suggestion.side} ${lineLabel(f.suggestion.line)}`} />
        </div>
      </div>
      <AdviceRow p={p.probability} odds={null} eventId={p.row.eventId} save={save} leg={{ key: `${p.row.eventId}|count|${p.outcome}`, match: p.row.match, outcome: p.outcome, kickoff: p.row.kickoff }} />
      <details className="group">
        <MoreToggle />
        <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-2">
          <div className="space-y-5">
            <Fact label={`Forventede ${p.unit}`}>
              <SplitBar home={f.expected.home} away={f.expected.away} />
              <div className="mt-1 text-xs text-muted">
                I alt {dec(f.expected.total, 1)} · ligasnit {dec(leagueAvg, 1)} ({f.league.matches} kampe)
              </div>
            </Fact>
            <Fact label="Pr. kamp, seneste kampe">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-1 font-normal">Hold</th>
                    <th className="pb-1 text-right font-normal">For</th>
                    <th className="pb-1 text-right font-normal">Imod</th>
                    <th className="pb-1 text-right font-normal">Kampe</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {[
                    { team: home, r: f.rates.home },
                    { team: away, r: f.rates.away },
                  ].map(({ team, r }) => (
                    <tr key={team} className="border-t border-line">
                      <td className="py-1.5 font-sans text-ink-2">{team}</td>
                      <td className="py-1.5 text-right">{dec(r.forAvg, 1)}</td>
                      <td className="py-1.5 text-right">{dec(r.againstAvg, 1)}</td>
                      <td className="py-1.5 text-right text-muted">{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.stat === "fouls" && <div className="mt-1 text-xs text-muted">&quot;For&quot; er frispark holdet begår, &quot;imod&quot; er frispark det får.</div>}
            </Fact>
            {p.stat === "cards" && (
              <Fact label="Dommer">
                {f.referee ? (
                  <>
                    {f.referee.name}: <span className="num">{dec(f.referee.cardsPerMatch, 1)}</span> kort pr. kamp i {f.referee.n} kampe, ligasnit{" "}
                    <span className="num">{dec(f.referee.leagueCardsPerMatch, 1)}</span>.
                    <div className="text-xs text-muted">
                      {Math.abs(f.referee.factor - 1) < 0.03
                        ? "Dommeren ændrer ikke forventningen."
                        : `Forventede kort er ${f.referee.factor > 1 ? "skruet op" : "skruet ned"} med ${Math.round(Math.abs(f.referee.factor - 1) * 100)} % for dommeren.`}
                    </div>
                  </>
                ) : (
                  <span className="text-ink-2">Dommeren er ikke meldt endnu, eller vi har ikke hans kampe.</span>
                )}
              </Fact>
            )}
          </div>
          <Fact label="Hvor ligger linjen">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1 font-normal">Linje</th>
                  <th className="pb-1 text-right font-normal">Over</th>
                  <th className="pb-1 text-right font-normal">Fair odds</th>
                  <th className="pb-1 text-right font-normal">Under</th>
                  <th className="pb-1 text-right font-normal">Fair odds</th>
                </tr>
              </thead>
              <tbody className="num">
                {f.lines.map((l) => (
                  <tr key={l.line} className={`border-t border-line ${l.line === f.fairLine ? "bg-surface-2 font-semibold" : ""} ${l.line === f.suggestion.line ? "text-accent" : ""}`}>
                    <td className="py-1.5">{lineLabel(l.line)}</td>
                    <td className="py-1.5 text-right">{Math.round(l.over * 100)}%</td>
                    <td className="py-1.5 text-right">{dec(1 / Math.max(l.over, 0.01))}</td>
                    <td className="py-1.5 text-right">{Math.round(l.under * 100)}%</td>
                    <td className="py-1.5 text-right">{dec(1 / Math.max(l.under, 0.01))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-2">
              Den fremhævede række er linjen, hvor over og under er tættest på 50/50. Spil kun, hvis bookmakeren giver en højere odds end fair odds for samme
              linje.
              {p.probability !== f.suggestion.probability && " Tabellen er før justeringen ud fra bet-typens resultater; procenten og fair odds øverst er efter."}
            </p>
          </Fact>
          <NewsBlock home={home} away={away} />
        </div>
      </details>
    </article>
  );
}
