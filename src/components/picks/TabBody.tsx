// The list under the bet-type menu: one card per bet, or a note on why there
// is nothing to show right now.

import { DEMO_MODE } from "@/lib/data";
import type { COUNT_CATEGORIES, CountPick, Pick } from "@/lib/picks";
import type { ExtraPick } from "@/lib/picks-extra";
import { SHOTS_MODEL_VERSION, type ShotPick } from "@/lib/player-shots";
import type { ShotBoard } from "@/lib/real/player-shots";
import { SHARP_MAX_AGE_MS, SHARP_MAX_ODDS, SHARP_MIN_EV, SHARP_MIN_ODDS } from "@/lib/sharp";
import { dec } from "@/lib/format";
import type { TabId } from "@/lib/picks-tabs";
import type { SaveTarget } from "./Advice";
import { kickoffLabel } from "./BetCard";
import { CountCard } from "./cards/CountCard";
import { ExtraCard } from "./cards/ExtraCard";
import { PickCard } from "./cards/PickCard";
import { ShotCard } from "./cards/ShotCard";

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[20px] bg-surface-2 px-6 py-12 text-center">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{text}</p>
    </div>
  );
}

export function TabBody({
  tab,
  now,
  picks,
  extraPicks,
  countCat,
  countPicks,
  shots,
  shotPicks,
  saveFor,
}: {
  tab: TabId;
  now: number;
  /** Bedste bets or a goal market's picks; empty on the other tabs. */
  picks: Pick[];
  /** Null on the tabs without an EXTRA generator. */
  extraPicks: ExtraPick[] | null;
  countCat: (typeof COUNT_CATEGORIES)[number] | undefined;
  countPicks: CountPick[];
  /** Only loaded on the shots tab. */
  shots: ShotBoard | null;
  shotPicks: ShotPick[];
  saveFor: (eventId: string) => SaveTarget | null;
}) {
  if (extraPicks) {
    if (extraPicks.length === 0) return <Empty title="Ingen kampe at vise lige nu" text="Der er ingen fodboldkampe med en analyse de næste 24 timer. Kig forbi igen senere." />;
    return (
      <ol className="space-y-4">
        {extraPicks.map((p, i) => (
          <li key={p.row.eventId}>
            <ExtraCard p={p} rank={i + 1} now={now} save={saveFor(p.row.eventId)} />
          </li>
        ))}
      </ol>
    );
  }

  if (shots) {
    if (shotPicks.length === 0) {
      return (
        <Empty
          title="Ingen spillere at vise lige nu"
          text={
            shots.matches === 0
              ? "Der er ingen fodboldkampe de næste 24 timer. Kig forbi igen senere."
              : "Spillerstatistikken hentes automatisk fra API-Football op til to dage før kampstart. Kig forbi igen om lidt."
          }
        />
      );
    }
    return (
      <>
        <ol className="space-y-4">
          {shotPicks.map((p, i) => (
            <li key={`${p.eventId}|${p.player}`}>
              <ShotCard p={p} rank={i + 1} now={now} />
            </li>
          ))}
        </ol>
        <p className="px-1 text-xs text-muted">
          Estimeret, model {SHOTS_MODEL_VERSION}: spillerens skud på mål pr. 90 minutter i sæsonen {shots.season}/{String((shots.season + 1) % 100).padStart(2, "0")}, trukket mod det
          typiske for positionen, gange forventede minutter og holdets forventede mål i kampen. Højst tre spillere pr. hold. {shots.covered} af {shots.matches} kampe de næste 24 timer har
          spillerdata · kilde: {DEMO_MODE ? "DEMO DATA" : `API-Football${shots.fetchedAt ? `, hentet ${kickoffLabel(shots.fetchedAt, now).toLowerCase()}` : ""}`}. Bookmakerne har ikke
          odds på spillere i vores feed, så sammenlign selv med fair odds.
        </p>
      </>
    );
  }

  if (tab === "straffe") {
    return (
      <Empty
        title="Straffespark kommer senere"
        text="Vores kampdata har ikke straffespark med. Det kræver kamphændelser fra statistik-feedet (API-Football), som skal sættes op med STATS_API_KEY først."
      />
    );
  }

  if (countCat) {
    if (countPicks.length === 0) {
      return (
        <Empty
          title={`Ingen ${countCat.unit}-analyser lige nu`}
          text={`Der er ingen kampe de næste 24 timer, hvor vi har nok ${countCat.unit}-historik for begge hold. Data hentes automatisk fra football-data.co.uk.`}
        />
      );
    }
    return (
      <ol className="space-y-4">
        {countPicks.map((p, i) => (
          <li key={p.row.eventId}>
            <CountCard p={p} rank={i + 1} now={now} save={saveFor(p.row.eventId)} />
          </li>
        ))}
      </ol>
    );
  }

  if (picks.length === 0 && tab === "bedste") {
    return (
      <Empty
        title="Ingen bets lige nu"
        text={`I kampene de næste 24 timer betaler hverken bet365 eller bwin mindst ${dec(SHARP_MIN_EV * 100, 0)} % over Pinnacles (ellers Betfair Exchanges) fair pris ved odds ${dec(SHARP_MIN_ODDS)}–${dec(SHARP_MAX_ODDS)}, eller vi mangler deres odds fra samme opdatering inden for ${SHARP_MAX_AGE_MS / 3_600_000} timer. Se de andre faner for de mest sandsynlige bets.`}
      />
    );
  }
  if (picks.length === 0) {
    return (
      <Empty
        title="Ingen kampe at vise lige nu"
        text="Der er ingen fodboldkampe med en analyse de næste 24 timer. Vi analyserer en kamp, når der er under et døgn til kampstart. Kig forbi igen senere."
      />
    );
  }
  return (
    <ol className="space-y-4">
      {picks.map((p, i) => (
        <li key={p.row.selectionId}>
          <PickCard p={p} rank={i + 1} now={now} save={saveFor(p.row.eventId)} />
        </li>
      ))}
    </ol>
  );
}
