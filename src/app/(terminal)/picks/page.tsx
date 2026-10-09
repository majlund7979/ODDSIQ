import Link from "next/link";
import { analysedMatches, COUNT_CATEGORIES, countPicks, couponCandidates, GOAL_CATEGORIES, isSharp, marketPicks, PICK_COUNTS, sharpPicks } from "@/lib/picks";
import { requireFriend } from "@/lib/auth/friends";
import { applyLearning, applyLearningToPicks, hitRatePeriod, LEARN_DAYS, learn, RECORD_VERSIONS } from "@/lib/picks-learning";
import { coupons, summarise } from "@/lib/picks-extra";
import { EXTRA, picksHref, tabFor, TABS } from "@/lib/picks-tabs";
import { terminal } from "@/lib/terminal";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { livePicksFor } from "@/lib/live/feed";
import { LiveNow } from "@/components/picks/LiveNow";
import { MyCoupon } from "@/components/picks/MyCoupon";
import { GoodSingles, Overview } from "@/components/picks/Overview";
import { openBetKeys } from "@/lib/real/friend-bets";
import type { SaveTarget } from "@/components/picks/Advice";
import { CouponCard } from "@/components/picks/CouponCard";
import { HitRates } from "@/components/picks/HitRates";
import { LearningNote, SharpBacktestNote } from "@/components/picks/notes";
import { TabBody } from "@/components/picks/TabBody";
import { TabNav } from "@/components/picks/TabNav";
import { DEMO_MODE } from "@/lib/data";
import { demoShotBoard } from "@/lib/demo/player-shots";
import { topShotPicks } from "@/lib/player-shots";
import { realShotBoard } from "@/lib/real/player-shots";
import { SHARP_MAX_ODDS, SHARP_MIN_EV, SHARP_MIN_ODDS, SHARP_VERSION } from "@/lib/sharp";
import { capitalize, clock, dec, signedPct, TZ } from "@/lib/format";
import { lookup, one, type SearchParams } from "@/lib/url";

export const metadata = { title: "Dagens bedste bets · Oddsanalyse" };

const SAVED_FLASH: Record<string, string> = {
  ok: "Bettet er gemt i vennerligaen.",
  fejl: "Bettet blev ikke gemt. Tjek indsats og odds.",
  lukket: "Bettet kan ikke gemmes længere, fordi kampen er gået i gang eller ikke er på listen mere.",
};

export default async function PicksPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireFriend();
  const t = await terminal();
  const q = await searchParams;
  const count = PICK_COUNTS.find((n) => String(n) === q.antal) ?? 10;
  const tab = tabFor(one(q.type)).id;
  const gemt = one(q.gemt);
  const flash = lookup(SAVED_FLASH, gemt);
  const rows = t.marketRows();
  const goalCat = GOAL_CATEGORIES.find((c) => c.id === tab);
  const countCat = COUNT_CATEGORIES.find((c) => c.id === tab);
  // These reads do not depend on each other, so they run together.
  const [history, live, savedKeys, shots] = await Promise.all([
    t.recordedPicks(LEARN_DAYS, { close: false }),
    livePicksFor(tab, t.now).catch(() => []),
    user ? openBetKeys(db(), user.id, t.now) : new Set<string>(),
    tab !== "skud" ? null : DEMO_MODE ? demoShotBoard(rows, t.now, t.pickContext) : realShotBoard(db(), rows, t.now, t.pickContext),
  ]);
  const allLearning = learn(history, t.dataLabel);
  const learned = allLearning.get(tab);
  // The price comparison's probability is Pinnacle's price without margin, so the per-type learning is not applied on top.
  const picks = tab === "bedste" ? sharpPicks(rows, t.now, count, t.pickContext, t.sharpBooks) : applyLearningToPicks(goalCat ? marketPicks(rows, t.now, count, goalCat.market, t.pickContext) : [], learned);
  const first = picks[0];
  // The coupons pick the likeliest bets; "bedste"'s record now follows the price comparison, so its learning does not fit them.
  const couponPool = tab === "bedste" ? couponCandidates(rows, t.now, t.pickContext) : [];
  const cPicks = applyLearning(countCat ? countPicks(rows, t.now, count, countCat.stat, t.pickContext) : [], learned);
  const extra = EXTRA[tab];
  const xPicks = extra ? applyLearning(extra(rows, t.now, count, t.pickContext), learned) : null;
  const sPicks = shots ? topShotPicks(shots.picks, count) : [];
  const week = history.filter((p) => p.category === "bedste" && p.kickoff >= t.now - 7 * 86_400_000 && p.kickoff < t.now);
  const upcoming = rows.filter((r) => r.sportId === "football" && r.status === "scheduled" && r.kickoff > t.now).map((r) => r.kickoff);
  const nextKickoff = upcoming.length ? Math.min(...upcoming) : null;
  const scope = analysedMatches(rows, t.now);
  const liveSource = DEMO_MODE ? "DEMO DATA" : "API-Football";
  const back = picksHref(tab, count);
  const saveFor = (eventId: string): SaveTarget | null =>
    tab === "straffe" || tab === "skud" ? null : { category: tab, back, saved: savedKeys.has(`${eventId}|${tab}`), signedIn: !!user, accounts: ACCOUNTS_ENABLED };
  const today = new Date(t.now).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

  const tabLabel = tabFor(tab).label;
  const hit = (id: string) => {
    const l = allLearning.get(id);
    return l && l.hitRate.n > 0 ? l.hitRate : null;
  };
  const hitPeriod = hitRatePeriod(TABS.flatMap((x) => hit(x.id) ?? []));
  // The phone strip leaves Straffespark out, so its period covers the same bet types.
  const stripTabs = TABS.filter((x) => x.id !== "straffe");
  const stripPeriod = hitRatePeriod(stripTabs.flatMap((x) => hit(x.id) ?? []));

  return (
    <div className="space-y-6 lg:space-y-8">
      <header className="rounded-[28px] border border-line bg-gradient-to-br from-accent/15 to-surface px-4 py-5 sm:px-10 sm:py-10">
        <div className="text-sm font-medium text-muted">{capitalize(today)}</div>
        <h1 className="display mt-2 text-[36px] text-ink sm:text-6xl">{tab === "bedste" ? "Dagens bedste bets" : tabLabel}</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-2 sm:mt-4 sm:text-[17px]">
          {tab === "bedste"
            ? `Forsøg: vinder-bets i kampene de næste 24 timer, hvor bet365 eller bwin betaler mindst ${dec(SHARP_MIN_EV * 100, 0)} % mere end Pinnacles odds uden margin (ellers Betfair Exchanges), ved odds ${dec(SHARP_MIN_ODDS)}–${dec(SHARP_MAX_ODDS)}. Vi henter odds hver 5.–6. time, så tjek prisen hos bookmakeren, før du spiller. Øverst er den største forskel.`
            : "De udfald med størst chance for at gå hjem i kampene de næste 24 timer. Øverst er det mest sandsynlige."}
        </p>
        {tab === "bedste" ? (
          <div className="mt-4 sm:mt-6">
            <Overview
              top={
                first && isSharp(first)
                  ? {
                      outcome: first.outcome,
                      match: first.row.match,
                      league: first.row.league,
                      kickoff: first.row.kickoff,
                      probability: first.probability,
                      odds: first.row.bestOdds,
                      headline: { value: signedPct(first.ev), caption: `over ${first.reference}s fair pris · chance ${Math.round(first.probability * 100)} %` },
                      note: `${first.row.bestBook} betaler ${dec(first.ev * 100, 1)} % mere end ${first.reference}s odds uden margin. Spil kun til mindst ${dec(first.minOdds)}. Ingen dokumenteret fordel.`,
                    }
                  : null
              }
              topLabel="Største prisforskel"
              version={SHARP_VERSION}
              empty={scope.matches ? "Ingen bets lige nu." : "Ingen kampe de næste 24 timer."}
              matches={scope.matches}
              leagues={scope.leagues}
              nextKickoff={nextKickoff}
              feedTime={t.feedTime}
              live={t.live}
              week={week}
              source={t.dataLabel}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            <span className="num">{scope.matches}</span> kampe i <span className="num">{scope.leagues}</span> {scope.leagues === 1 ? "liga" : "ligaer"} analyseret · odds opdateret kl.{" "}
            <span className="num">{clock(t.feedTime)}</span>
          </p>
        )}
        {tab === "bedste" && <SharpBacktestNote />}
        <p className="mt-4 text-xs text-muted">Procenterne bliver mere præcise, når holdopstillingen er meldt, typisk en time før kampstart.</p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <TabNav tab={tab} count={count} hit={hit} hitPeriod={hitPeriod} source={t.dataLabel} />

        <div className="min-w-0 space-y-6">
          {flash && (
            <div role="status" className={`rounded-[20px] border px-4 py-3 text-sm ${gemt === "ok" ? "border-good/40 bg-good/10 text-good" : "border-warning/40 bg-warning/10 text-warning"}`}>
              {flash} {gemt === "ok" && <Link href="/picks/liga" className="underline">Se vennerligaen</Link>}
            </div>
          )}

          {tab === "bedste" && <LiveNow type={tab} initial={live} source={liveSource} />}

          {tab === "bedste" && <CouponCard coupons={coupons(couponPool)} />}

          {tab === "bedste" && (
            <GoodSingles
              rows={picks.slice(0, 5).map((p) => ({
                key: p.row.selectionId,
                eventId: p.row.eventId,
                outcome: p.outcome,
                match: p.row.match,
                league: p.row.league,
                kickoff: p.row.kickoff,
                probability: p.probability,
                odds: p.row.bestOdds,
                value: p.value,
              }))}
              subtitle="Største prisforskel først"
            />
          )}

          <div className="lg:hidden">
            <HitRates learning={allLearning} labels={stripTabs} current={tab} period={stripPeriod} source={t.dataLabel} versions={RECORD_VERSIONS} returns={new Map(TABS.map((x) => [x.id, summarise(history.filter((h) => h.category === x.id))]))} />
          </div>

          {tab !== "bedste" && <LiveNow type={tab} initial={live} source={liveSource} />}

          {tab === "bedste" && picks.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
              <h2 className="text-2xl font-extrabold tracking-[-0.02em]">
                {picks.length === 1 ? "1 enkeltbet med analyse" : `Alle ${picks.length} enkeltbets med analyse`}
              </h2>
              <span className="text-sm text-muted">Tryk &quot;Hvorfor?&quot; for begrundelsen</span>
            </div>
          )}

          <TabBody
            tab={tab}
            now={t.now}
            picks={picks}
            extraPicks={xPicks}
            countCat={countCat}
            countPicks={cPicks}
            shots={shots}
            shotPicks={sPicks}
            saveFor={saveFor}
          />

          <MyCoupon canPlay={ACCOUNTS_ENABLED && !!user} />

          {/* Bedste bets' chance is the reference price without margin and is never adjusted. */}
          {learned && tab !== "straffe" && tab !== "bedste" && <LearningNote l={learned} />}

          <section className="grid gap-5 rounded-[28px] bg-surface-2 p-6 text-sm leading-relaxed text-ink-2 md:grid-cols-3">
            <div>
              <div className="mb-1 font-semibold text-ink">Hvad vi analyserer</div>
              Kampresultater og holdstyrke (Elo), forventede mål, xG-form, skader og karantæner, startopstillinger, form, indbyrdes opgør, bookmakernes odds,
              hjørnespark, kort og frispark for hvert hold, dommerens kortstatistik og målene i 1. halvleg.
            </div>
            <div>
              <div className="mb-1 font-semibold text-ink">Hvad &quot;Værdi&quot; betyder</div>
              Oddsen betaler mere, end vores procent siger den burde. Høj procent giver ofte lav odds, så værdi er ikke det samme som et sikkert bet.
            </div>
            <div>
              <div className="mb-1 font-semibold text-ink">Husk</div>
              Procenterne er skøn, ikke garantier. Selv 80 % taber hver femte gang. Spil kun for penge, du har råd til at tabe. 18+.
            </div>
            <p className="text-xs text-muted md:col-span-3">
              Kilde: {t.dataLabel}. Bookmakernes odds vejer halvdelen, fordi de rummer nyheder og rygter. Skader og xG-form flytter de forventede mål efter en fast
              tommelfingerregel. Form og indbyrdes opgør indgår allerede i resultatmodellen og vises som baggrund. Hjørnespark, kort og frispark: holdenes seneste 20 kampe fra
              football-data.co.uk sammenlignet med ligasnittet; vi tipper over, når kampen ventes over snittet, ellers under, og vælger linjen ét trin fra 50/50-linjen, så tippet oftere går hjem.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
