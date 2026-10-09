// The background facts in a card's analysis: team news, form, top scorers and
// the outside team ratings (API-Football and ClubElo).

import { TOP_SCORER_MODEL, type TopScorer } from "@/lib/top-scorer";
import { AF_PREDICTION_MODEL, COMPARISON_LABELS, type AfPrediction } from "@/lib/stats/af-predictions";
import { CLUBELO_MODEL, clubEloProbs, type ClubEloPair } from "@/lib/stats/clubelo";
import { TeamNews } from "@/components/TeamNews";
import type { FormGame, Pick } from "@/lib/picks";
import { shortDate, TZ } from "@/lib/format";
import { Fact } from "./BetCard";

export function NewsBlock({ home, away }: { home: string; away: string }) {
  return (
    <div className="space-y-2.5 border-t border-line pt-5 md:col-span-2">
      <div className="text-[13px] font-semibold text-ink-2">Nyheder om holdene</div>
      <TeamNews home={home} away={away} />
    </div>
  );
}

export function FormRow({ team, games }: { team: string; games: FormGame[] }) {
  const tone = { V: "bg-good text-white", U: "bg-surface-3 text-ink-2", T: "bg-critical text-white" };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-ink-2">{team}</span>
      <span className="flex shrink-0 gap-1">
        {games.length === 0 && <span className="text-muted">ingen data</span>}
        {[...games].reverse().map((g, i) => (
          <span key={i} title={`${g.home ? "Hjemme" : "Ude"} mod ${g.opponent}: ${g.score}`} className={`num flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${tone[g.result]}`}>
            {g.result}
          </span>
        ))}
      </span>
    </div>
  );
}

const SCORER_STATUS: Record<NonNullable<TopScorer["status"]>, { text: string; tone: string }> = {
  out: { text: "mangler", tone: "text-critical" },
  doubtful: { text: "tvivlsom", tone: "text-warning" },
  bench: { text: "ikke i startopstillingen", tone: "text-warning" },
  starts: { text: "starter", tone: "text-good" },
};

/** Each team's top scorer: season goals, whether he plays, and his last matches against his season. */
export function ScorersFact({ s, home, away, moves }: { s: NonNullable<Pick["insights"]["scorers"]>; home: string; away: string; moves: boolean }) {
  const row = (team: string, t: TopScorer | null) =>
    t && (
      <li key={team} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{t.name}</span>
        <span className="text-xs text-muted">{team}</span>
        <span className="num text-xs text-ink-2">
          {t.goals} mål på {Math.round(t.minutes / 90)} kampes spilletid · {Math.round(t.share * 100)} % af holdets
        </span>
        {t.status && <span className={`text-xs font-semibold ${SCORER_STATUS[t.status].tone}`}>{SCORER_STATUS[t.status].text}</span>}
        {t.recent && (
          <span className={`num text-xs ${t.recent.ratio > 1.1 ? "text-good" : t.recent.ratio < 0.9 ? "text-critical" : "text-ink-2"}`}>
            {t.recent.ratio > 1.1 ? "↑" : t.recent.ratio < 0.9 ? "↓" : "→"} {t.recent.goals} mål i de seneste {t.recent.matches} kampe
          </span>
        )}
      </li>
    );
  return (
    <Fact label="Topscorere">
      <ul className="space-y-1">
        {row(home, s.home)}
        {row(away, s.away)}
      </ul>
      <div className="mt-1 text-xs text-muted">
        {moves ? "Flytter chancen på over/under 1,5 og 2,5 mål: en topscorer der mangler, trækker holdets forventede mål ned, og formen flytter dem lidt" : "Bruges på over/under 1,5 og 2,5 mål"} · skøn, {TOP_SCORER_MODEL} · {s.source ?? "API-Football, alle turneringer"}
      </div>
    </Fact>
  );
}

/** What a market-only pick's probability is built from. */
export function badgeText(p: Pick): string {
  if (p.row.marketType !== "1X2") return "Kun odds";
  return p.insights.afPrediction ? "Odds + API-Football" : p.insights.clubElo ? "Odds + ClubElo" : "Kun odds";
}
export function badgeTitle(p: Pick): string {
  const b = badgeText(p);
  if (b === "Odds + API-Football") return "Ingen kampresultater for ligaen endnu: procenten er bookmakernes, justeret med API-Footballs vurdering af holdene";
  if (b === "Odds + ClubElo") return "Ingen kampresultater for ligaen endnu: procenten er bookmakernes, justeret med ClubElo-holdstyrke";
  return "Ingen kampresultater for ligaen endnu, så procenten er bookmakernes";
}

/** API-Football's percentages and its home-vs-away comparison, one bar per area. */
export function AfPredictionFact({ a, home, away }: { a: AfPrediction; home: string; away: string }) {
  const pc = (x: number) => Math.round(x * 100);
  const day = new Date(a.fetchedAt).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return (
    <Fact label="Holdstyrke (API-Football)">
      <span className="num">
        {home} {pc(a.percent.home)} % · uafgjort {pc(a.percent.draw)} % · {away} {pc(a.percent.away)} %
      </span>
      {a.comparison.length > 0 && (
        <ul className="mt-2 space-y-1">
          {a.comparison.map((c) => (
            <li key={c.key} className="grid grid-cols-[5.5rem_2.5rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="text-ink-2">{COMPARISON_LABELS[c.key]}</span>
              <span className="num text-right">{pc(c.home)} %</span>
              <span className="flex h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className="bg-accent" style={{ width: `${c.home * 100}%` }} />
              </span>
              <span className="num">{pc(c.away)} %</span>
            </li>
          ))}
        </ul>
      )}
      <div className="num mt-1 text-xs text-muted">
        Skøn ud fra holdenes kampe i alle turneringer, {home} til venstre · {AF_PREDICTION_MODEL} · {a.source === "DEMO DATA" ? "DEMO DATA" : `${a.source}, hentet ${day}`}
      </div>
    </Fact>
  );
}

/** Both clubs on ClubElo's cross-league scale, with what the gap means at home advantage. */
export function ClubEloFact({ c, home, away }: { c: ClubEloPair; home: string; away: string }) {
  const gap = Math.round(c.home.elo - c.away.elo);
  const e = clubEloProbs(c.home.elo, c.away.elo);
  const day = shortDate(c.date);
  return (
    <Fact label="Holdstyrke på tværs af ligaer (ClubElo)">
      <span className="num">{Math.round(c.home.elo)}</span> mod <span className="num">{Math.round(c.away.elo)}</span>
      <span className="text-ink-2">
        {" · "}
        {Math.abs(gap) < 25 ? "jævnbyrdige hold" : `${gap > 0 ? home : away} er ${Math.abs(gap)} point stærkere`}
        {c.home.country && c.away.country && c.home.country !== c.away.country ? ` (${c.home.country} mod ${c.away.country})` : ""}
      </span>
      <div className="num mt-1 text-xs text-muted">
        Skøn ud fra ratings og hjemmebane: {Math.round(e.home * 100)} % / {Math.round(e.draw * 100)} % / {Math.round(e.away * 100)} % · {CLUBELO_MODEL} · {c.source === "DEMO DATA" ? "DEMO DATA" : `${c.source}, ${day}`}
      </div>
    </Fact>
  );
}
