// A pick on Dagens bedste bets or a goal market: the bet, the chance, the
// odds and, behind "Hvorfor?", how the percentage was worked out.

import { BTTS_FORM_GAMES, isNationalTeams, isSharp, NATIONAL_OVER_MIN_SCORED, signedPp, type Pick } from "@/lib/picks";
import { explainPick } from "@/lib/picks-explain";
import { compareBooks, oddsMove } from "@/lib/picks-advice";
import { clock, dec } from "@/lib/format";
import { AdviceRow, OddsMoveTag, type SaveTarget } from "../Advice";
import { CardTop, Fact, Gauge, MatchTitle, MoreToggle, SplitBar, StatBox } from "../BetCard";
import { AfPredictionFact, badgeText, badgeTitle, ClubEloFact, FormRow, NewsBlock, ScorersFact } from "../facts";

/** With a reference (Dagens bedste bets), fairOdds is that book's price without margin and no "Værdi" is claimed. */
function BookTable({ quotes, fairOdds, marketOnly, reference }: { quotes: Pick["row"]["quotes"]; fairOdds: number; marketOnly: boolean; reference?: string }) {
  const c = compareBooks(quotes, fairOdds);
  if (!c) return null;
  const pctDiff = Math.round(c.bestOverMedian * 1000) / 10;
  return (
    <Fact label="Odds hos bookmakerne">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {c.rows.map((r) => (
          <li key={r.book} className={`flex items-center justify-between gap-3 px-3 py-1.5 ${r.best ? "bg-lime-soft" : ""}`}>
            <span className="truncate">{r.book}</span>
            <span className="flex shrink-0 items-center gap-2">
              {r.best && <span className="text-[11px] font-semibold text-accent">Bedst</span>}
              {r.value && !marketOnly && !reference && <span className="rounded-full border border-good/40 bg-good/10 px-1.5 text-[10px] font-semibold text-good">Værdi</span>}
              <span className={`num ${r.best ? "font-semibold" : ""}`}>{dec(r.odds)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="text-xs text-muted">
        Den bedste odds er {String(pctDiff).replace(".", ",")} % over snittet ({dec(c.median)}). Over mange bets betyder den forskel meget.
        {reference ? ` ${reference}s fair odds uden margin: ${dec(fairOdds)}.` : marketOnly ? "" : ` Værdi: oddsen er højere end vores fair odds ${dec(fairOdds)}.`}
      </div>
    </Fact>
  );
}

/** Over 1,5, over 2,5 and begge hold scorer side by side, and whether begge hold scorer passes the scoring rule. */
function GoalBets({ p, home, away }: { p: Pick; home: string; away: string }) {
  const goals = p.goals ?? [];
  if (!goals.length && !p.scoring) return null;
  const top = goals.reduce<(typeof goals)[number] | null>((b, g) => (!b || g.probability > b.probability ? g : b), null);
  const s = p.scoring;
  return (
    <Fact label="Mål-bets i kampen">
      {goals.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-normal">Bet</th>
              <th className="py-1 text-right font-normal">Chance</th>
              <th className="py-1 text-right font-normal">Odds</th>
              <th className="py-1 text-right font-normal" title="Chance gange odds: hvad 100 kr giver tilbage i snit (skøn)">Tilbage pr. 100 kr</th>
            </tr>
          </thead>
          <tbody className="num">
            {goals.map((g) => (
              <tr key={g.outcome} className={`border-t border-line ${g === top && !p.marketOnly ? "text-accent" : ""}`}>
                <td className="py-1.5 font-sans">{g.outcome}</td>
                <td className="py-1.5 text-right">{Math.round(g.probability * 100)} %</td>
                <td className="py-1.5 text-right">{dec(g.odds)}</td>
                <td className="py-1.5 text-right">{Math.round(g.ret * 100)} kr</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-2 text-xs text-ink-2">
        {s
          ? `Scoret i de seneste ${s.n} kampe: ${home} ${s.home} gange, ${away} ${s.away} gange. `
          : "Vi har ikke holdenes seneste kampe for ligaen. "}
        {s?.every ? "Begge hold har scoret i hver kamp, så begge hold scorer kan foreslås." : `Begge hold scorer foreslås kun, når begge hold har scoret i hver af deres seneste ${BTTS_FORM_GAMES} kampe.`}
        {isNationalTeams(p.row.leagueId) && ` I landskampe foreslås over 1,5 og 2,5 mål kun, når begge hold har scoret i mindst ${NATIONAL_OVER_MIN_SCORED} af de seneste ${BTTS_FORM_GAMES} kampe.`}
      </div>
      <div className="mt-1 text-xs text-muted">
        Tilbage pr. 100 kr er chance gange odds, et skøn.{" "}
        {isSharp(p) ? "Dagens bedste bets sammenligner kun vinder-oddsene med Pinnacles fair pris; mål-bets er ikke med i sammenligningen." : "Vi foreslår altid det bet, der oftest går hjem."}
      </div>
    </Fact>
  );
}

function Analysis({ p, home, away }: { p: Pick; home: string; away: string }) {
  const move = oddsMove(p.insights.movement, p.row.openingOdds, p.row.currentOdds);
  const i = p.insights;
  const maxPp = Math.max(4, ...p.factors.map((f) => Math.abs(f.pp ?? 0)));
  return (
    <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <div className="text-[13px] font-semibold text-ink-2">Hvorfor dette bet</div>
        {explainPick(p).map((s, k) => (
          <p key={k} className="text-[15px] leading-relaxed text-ink-2">
            {s}
          </p>
        ))}
      </div>
      <div className="space-y-3">
        <div className="text-[13px] font-semibold text-ink-2">Sådan er procenten regnet ud</div>
        <ul className="space-y-3">
          {p.factors.map((f) => (
            <li key={f.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{f.label}</span>
                {f.pp !== null && <span className={`num text-xs ${Math.abs(f.pp) < 0.05 ? "text-muted" : f.pp > 0 ? "text-good" : "text-serious"}`}>{signedPp(f.pp)}</span>}
              </div>
              {f.pp !== null && (
                <div className="relative h-1.5 rounded bg-surface-3">
                  <span className="absolute top-0 left-1/2 h-1.5 w-px bg-line-strong" />
                  <span
                    className={`absolute top-0 h-1.5 rounded ${f.pp >= 0 ? "bg-good" : "bg-serious"}`}
                    style={f.pp >= 0 ? { left: "50%", width: `${(f.pp / maxPp) * 50}%` } : { right: "50%", width: `${(-f.pp / maxPp) * 50}%` }}
                  />
                </div>
              )}
              <div className="text-xs text-ink-2">{f.detail}</div>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-sm">
          <span className="font-semibold">Samlet chance</span>
          <span className="num font-semibold text-accent">{Math.round(p.probability * 100)}%</span>
        </div>
      </div>

      <div className="space-y-5">
        {i.expectedGoals && (
          <Fact label="Forventede mål">
            <SplitBar home={i.expectedGoals.home} away={i.expectedGoals.away} />
          </Fact>
        )}
        {i.elo && (
          <Fact label="Holdstyrke (Elo)">
            <span className="num">{i.elo.home}</span> mod <span className="num">{i.elo.away}</span>
            <span className="text-ink-2">
              {" · "}
              {Math.abs(i.elo.home - i.elo.away) < 25 ? "jævnbyrdige hold" : `${i.elo.home > i.elo.away ? home : away} er ${Math.abs(i.elo.home - i.elo.away)} point stærkere`}
            </span>
          </Fact>
        )}
        {i.scorers && <ScorersFact s={i.scorers} home={home} away={away} moves={!p.marketOnly && (p.row.marketType === "OU15" || p.row.marketType === "OU25")} />}
        {i.afPrediction && <AfPredictionFact a={i.afPrediction} home={home} away={away} />}
        {i.clubElo && <ClubEloFact c={i.clubElo} home={home} away={away} />}
        {i.form && (
          <Fact label="Form, seneste 5 kampe">
            <div className="space-y-1.5">
              <FormRow team={home} games={i.form.home} />
              <FormRow team={away} games={i.form.away} />
            </div>
          </Fact>
        )}
        {i.h2h && (
          <Fact label={`Indbyrdes, seneste ${i.h2h.games.length}`}>
            {home}: <span className="text-good">{i.h2h.home} sejre</span>, {i.h2h.draw} uafgjort, <span className="text-serious">{i.h2h.away} nederlag</span>
            <div className="num mt-1 text-xs text-muted">{i.h2h.games.map((g) => g.score).join(" · ")}</div>
          </Fact>
        )}
        <Fact label="Oddsen">
          {move ? (
            <>
              {move.fact}
              <div className="text-xs text-ink-2">{move.maybe}</div>
            </>
          ) : (
            "Stort set uændret siden markedet åbnede."
          )}
          <div className="text-xs text-muted">
            {p.row.booksQuoting} bookmakere · {p.reference ? `fair odds fra ${p.reference} uden margin` : "fair odds efter vores procent"}: {dec(p.fairOdds)}
          </div>
        </Fact>
        <BookTable quotes={p.row.quotes} fairOdds={p.fairOdds} marketOnly={p.marketOnly} reference={p.reference} />
        <GoalBets p={p} home={home} away={away} />
        <Fact label="Startopstilling">{i.lineupsConfirmed ? "Bekræftet for begge hold." : "Ikke meldt endnu. Den kommer typisk en time før kampstart, og så bliver procenten mere præcis."}</Fact>
      </div>
      <NewsBlock home={home} away={away} />
    </div>
  );
}

export function PickCard({ p, rank, now, save }: { p: Pick; rank: number; now: number; save: SaveTarget | null }) {
  const [home, away] = p.row.match.split(" vs ");
  return (
    <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <CardTop rank={rank} league={p.row.league} kickoff={p.row.kickoff} probability={p.probability} now={now} />
          <MatchTitle home={home} away={away} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Vores bud</span>
            <span className="rounded-full bg-lime-soft px-3.5 py-1.5 text-[15px] font-semibold text-accent">{p.outcome}</span>
            {p.value && <span className="rounded-full border border-good/40 bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">Værdi</span>}
            <OddsMoveTag row={p.row} />
            {p.lineupsConfirmed ? (
              <span className="rounded-full border border-good/40 bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">Opstilling bekræftet</span>
            ) : (
              <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2" title="Procenten bliver mere præcis, når holdopstillingerne er meldt, typisk en time før kampstart">
                Afventer opstilling
              </span>
            )}
            {p.marketOnly && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2" title={badgeTitle(p)}>{badgeText(p)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Gauge p={p.probability} />
          <StatBox label={isSharp(p) ? "Odds hos" : "Bedste odds"} value={dec(p.row.bestOdds)} sub={p.row.bestBook} truncate />
        </div>
      </div>
      {isSharp(p) && (
        <div className="border-t border-line bg-surface-2 px-5 py-2.5 text-sm text-ink-2">
          {p.reference}s fair pris {dec(p.fairOdds)} · {p.row.bestBook} {dec(p.row.bestOdds)} ({p.ev >= 0 ? "+" : ""}
          {dec(p.ev * 100, 1)} %) · <span className="font-semibold text-ink">spil kun til mindst {dec(p.minOdds)}</span> · odds hentet kl. {clock(p.pricedAt)}
        </div>
      )}
      {p.instead && (
        <div className="border-t border-line bg-surface-2 px-5 py-2.5 text-sm text-ink-2">
          Går oftere hjem til næsten samme odds: <span className="font-semibold text-ink">{p.instead.outcome}</span> · {Math.round(p.instead.probability * 100)} % · odds {dec(p.instead.odds)}
        </div>
      )}
      <AdviceRow p={p.probability} odds={p.row.bestOdds} eventId={p.row.eventId} save={save} leg={{ key: `${p.row.eventId}|${p.row.selectionId}`, match: p.row.match, outcome: p.outcome, kickoff: p.row.kickoff }} />
      <details className="group">
        <MoreToggle />
        <Analysis p={p} home={home} away={away} />
      </details>
    </article>
  );
}
