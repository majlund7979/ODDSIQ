import Link from "next/link";
import { analysedMatches, BEDSTE_MIN_ODDS, bestChancePicks, COUNT_CATEGORIES, countPicks, couponCandidates, GOAL_CATEGORIES, marketPicks, PICK_COUNTS } from "@/lib/picks";
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
import { LearningNote } from "@/components/picks/notes";
import { TabBody } from "@/components/picks/TabBody";
import { Notice, PageHeader } from "@/components/ui";
import { PickControls, TabNav } from "@/components/picks/TabNav";
import { DEMO_MODE } from "@/lib/data";
import { demoShotBoard } from "@/lib/demo/player-shots";
import { topShotPicks } from "@/lib/player-shots";
import { realShotBoard } from "@/lib/real/player-shots";
import { BEDSTE_VERSION } from "@/lib/pick-categories";
import { capitalize, clock, dec, TZ } from "@/lib/format";
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
  const picks = applyLearningToPicks(
    tab === "bedste" ? bestChancePicks(rows, t.now, count, t.pickContext) : goalCat ? marketPicks(rows, t.now, count, goalCat.market, t.pickContext) : [],
    learned,
  );
  const first = picks[0];
  // The coupons draw from the same pool as the list, with the model's own chances.
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

  const noBets = tab === "bedste" && picks.length === 0;
  const overview = (className: string) => (
    <Overview
      className={className}
      top={
        first
          ? {
              outcome: first.outcome,
              match: first.row.match,
              league: first.row.league,
              kickoff: first.row.kickoff,
              probability: first.probability,
              odds: first.row.bestOdds,
              note: `Estimeret chance fra modellen og bookmakernes odds${first.row.bestBook ? `, odds hos ${first.row.bestBook}` : ""}. Ikke en garanti.`,
            }
          : null
      }
      topLabel="Højeste chance i dag"
      version={BEDSTE_VERSION}
      matches={scope.matches}
      leagues={scope.leagues}
      nextKickoff={nextKickoff}
      feedTime={t.feedTime}
      live={t.live}
      week={week}
      source={t.dataLabel}
    />
  );

  return (
    <div className="space-y-8 lg:space-y-14">
      <PageHeader
        eyebrow={capitalize(today)}
        title={tab === "bedste" ? "Dagens bedste bets" : tabLabel}
        intro={
          tab === "bedste"
            ? `Det bet med størst chance for at gå hjem i hver kamp de næste 24 timer, ved odds på mindst ${dec(BEDSTE_MIN_ODDS)}. Øverst er det mest sandsynlige.`
            : "De udfald med størst chance for at gå hjem i kampene de næste 24 timer. Øverst er det mest sandsynlige."
        }
      >
        {tab !== "bedste" && (
          <p className="mt-4 text-sm text-ink-2">
            <span className="num font-semibold text-ink">{scope.matches}</span> kampe i <span className="num font-semibold text-ink">{scope.leagues}</span> {scope.leagues === 1 ? "liga" : "ligaer"} analyseret · odds opdateret kl.{" "}
            <span className="num font-semibold text-ink">{clock(t.feedTime)}</span>
          </p>
        )}
        <details className="group mt-5 max-w-3xl">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-field text-sm font-semibold text-accent">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 text-xs transition-transform duration-300 group-open:rotate-45" aria-hidden>
              +
            </span>
            Sådan vælger vi
          </summary>
          <div className="mt-3 space-y-3 border-l-2 border-accent/40 pl-4">
            {tab === "bedste" && (
              <p className="text-sm leading-relaxed text-ink-2">
                For hver kamp de næste 24 timer ser vi på hvem vinder, dobbeltchance, over/under 1,5 og 2,5 mål og begge hold scorer, og vælger det bet, vores model giver størst chance,
                blandt dem med odds på mindst {dec(BEDSTE_MIN_ODDS)}. Ét bet pr. kamp, sorteret efter chance. Høj chance giver lav odds, så et bet her er ikke det samme som værdi.
              </p>
            )}
            <p className="text-sm leading-relaxed text-ink-2">Procenterne bliver mere præcise, når holdopstillingen er meldt, typisk en time før kampstart.</p>
          </div>
        </details>
      </PageHeader>

      {tab === "bedste" && overview("rise hidden lg:grid [--i:1]")}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12">
        <TabNav tab={tab} count={count} hit={hit} hitPeriod={hitPeriod} source={t.dataLabel} />

        <div className="min-w-0 space-y-8">
          {flash && (
            <Notice role="status" tone={gemt === "ok" ? "good" : "warning"}>
              {flash}{" "}
              {gemt === "ok" && (
                <Link href="/picks/liga" className="font-semibold text-accent underline underline-offset-2">
                  Se vennerligaen
                </Link>
              )}
            </Notice>
          )}

          {tab === "bedste" && <LiveNow type={tab} initial={live} source={liveSource} />}

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
              subtitle="Højest chance først"
            />
          )}

          {tab === "bedste" && (
            <CouponCard
              coupons={coupons(couponPool)}
              lead={
                noBets ? (
                  <Notice className="mt-3">
                    <span className="font-semibold text-ink">{scope.matches ? `Ingen bets med odds på mindst ${dec(BEDSTE_MIN_ODDS)} lige nu.` : "Ingen kampe de næste 24 timer."}</span>
                  </Notice>
                ) : null
              }
            />
          )}

          {tab === "bedste" && overview("lg:hidden")}

          <div className="lg:hidden">
            <HitRates learning={allLearning} labels={stripTabs} current={tab} period={stripPeriod} source={t.dataLabel} versions={RECORD_VERSIONS} returns={new Map(TABS.map((x) => [x.id, summarise(history.filter((h) => h.category === x.id))]))} />
          </div>

          {tab !== "bedste" && <LiveNow type={tab} initial={live} source={liveSource} />}

          {tab === "bedste" && picks.length > 0 && (
            <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
              <h2 className="display text-[34px] sm:text-[40px]">{picks.length === 1 ? "1 enkeltbet med analyse" : `Alle ${picks.length} enkeltbets med analyse`}</h2>
              <span className="text-sm text-ink-2">Tryk &quot;Hvorfor?&quot; for begrundelsen</span>
            </div>
          )}

          <PickControls tab={tab} count={count} className="lg:hidden" />

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

          {learned && tab !== "straffe" && <LearningNote l={learned} />}

          <section aria-labelledby="metode" className="rounded-sheet border border-line bg-surface p-6 sm:p-8">
            <h2 id="metode" className="eyebrow mb-6">
              Om tallene
            </h2>
            <div className="grid gap-8 text-sm leading-relaxed text-ink-2 md:grid-cols-3">
              <div>
                <div className="mb-2 text-md font-semibold text-ink">Hvad vi analyserer</div>
                Kampresultater og holdstyrke (Elo), forventede mål, xG-form, skader og karantæner, startopstillinger, form, indbyrdes opgør, bookmakernes odds, hjørnespark, kort og
                frispark for hvert hold, dommerens kortstatistik og målene i 1. halvleg.
              </div>
              <div>
                <div className="mb-2 text-md font-semibold text-ink">Hvad &quot;Værdi&quot; betyder</div>
                Oddsen betaler mere, end vores procent siger den burde. Høj procent giver ofte lav odds, så værdi er ikke det samme som et sikkert bet.
              </div>
              <div>
                <div className="mb-2 text-md font-semibold text-ink">Husk</div>
                Procenterne er skøn, ikke garantier. Selv 80&nbsp;% taber hver femte gang. Spil kun for penge, du har råd til at tabe. 18+.
              </div>
            </div>
            <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-2/80">
              Kilde: {t.dataLabel}. Bookmakernes odds vejer halvdelen, fordi de rummer nyheder og rygter. Skader og xG-form flytter de forventede mål efter en fast tommelfingerregel. Form
              og indbyrdes opgør indgår allerede i resultatmodellen og vises som baggrund. Hjørnespark, kort og frispark: holdenes seneste 20 kampe fra football-data.co.uk sammenlignet med
              ligasnittet; vi tipper over, når kampen ventes over snittet, ellers under, og vælger linjen ét trin fra 50/50-linjen, så tippet oftere går hjem.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
