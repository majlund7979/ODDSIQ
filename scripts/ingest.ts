// Runs one odds ingestion followed by the real model's scheduled work.
//
//   npm run ingest              live, from The Odds API (needs ODDS_API_KEY)
//                               and openfootball results; a manual run without
//                               the odds credit plan that records no picks
//                               (production runs GET /api/cron/ingest)
//   npm run ingest:fixture      offline, from recorded responses and a
//                               committed results snapshot; then checks
//                               snapshots, closing lines, ledger predictions,
//                               settlement and the team news the picks read
//
// Both need DATABASE_URL.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { verifyChain } from "../src/lib/ledger/hash";
import { REAL_MODEL } from "../src/lib/model/ensemble";
import { EPL_RESULTS_CSV } from "../src/lib/model/data/epl-2021-2026";
import { parseResultsCsv } from "../src/lib/model/openfootball";
import { closeAndSettle, runModel, storeResults } from "../src/lib/model/pipeline";
import { closingLine } from "../src/lib/providers/closing";
import { configuredFeed, feedConfig } from "../src/lib/providers/config";
import { FIXTURE_KICKOFF, FixtureFeed } from "../src/lib/providers/fixture-feed";
import { DEFAULT_ODDS_PLAN, inPlayCompetitions, ingest } from "../src/lib/providers/ingest";
import { realSnapshot } from "../src/lib/real/store";
import { configuredStatsFeed, statsConfig } from "../src/lib/stats/config";
import { StatsFixtureFeed } from "../src/lib/stats/fixture-feed";
import { ingestStats } from "../src/lib/stats/ingest";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const HOUR = 3_600_000;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Fixture check failed: ${msg}`);
}

async function fixture() {
  const prefix = `fx${Date.now().toString(36)}`;
  await storeResults(prisma, parseResultsCsv("en.1", EPL_RESULTS_CSV), "fixture: openfootball snapshot");
  const runs = [];
  const models = [];
  const statsRuns = [];
  const liveRuns = [];
  for (const [factor, at, score] of [
    [1.03, FIXTURE_KICKOFF - 5 * HOUR],
    [1, FIXTURE_KICKOFF - 1 * HOUR],
    // In play (live runs): prices go to InPlayOdds and the score to ScoreUpdate.
    [0.9, FIXTURE_KICKOFF + 30 * 60_000, { home: 1, away: 0 }],
    [0.8, FIXTURE_KICKOFF + 85 * 60_000, { home: 2, away: 1 }],
    // After full time: no new pre-match snapshots, the finished game is settled.
    [0.98, FIXTURE_KICKOFF + 3 * HOUR],
  ] as [number, number, { home: number; away: number }?][]) {
    if (score) {
      // What GET /api/cron/live does: only leagues in play, then closing lines and settlement.
      const keys = await inPlayCompetitions(prisma, ["soccer_epl"], at, prefix);
      assert(keys.length === 1, "the league should count as in play during the match");
      liveRuns.push(await ingest(prisma, new FixtureFeed(factor, 0, score), { competitionKeys: keys, now: at, prefix, kind: "live" }));
      await closeAndSettle(prisma, at);
      continue;
    }
    runs.push(await ingest(prisma, new FixtureFeed(factor), { competitionKeys: ["soccer_epl"], now: at, prefix }));
    statsRuns.push(await ingestStats(prisma, new StatsFixtureFeed(at), { oddsKeys: ["soccer_epl"], now: at, budget: 20, prefix }));
    models.push(await runModel(prisma, { oddsKeys: ["soccer_epl"], now: at, skipResultsRefresh: true }));
  }
  for (const r of [...runs, ...liveRuns]) console.log(r);
  assert(liveRuns.every((r) => !r.error && r.inPlay > 0 && r.scores === 1), "each live run should store in-play prices and the score of the match in play");
  for (const m of models) console.log(m);
  for (const r of statsRuns) console.log(r);
  assert(runs.every((r) => !r.error), "a run reported an error");
  assert(statsRuns.some((r) => r.players > 0), "a statistics run before kickoff should store squad statistics");
  const arsenalFixture = await prisma.statsFixture.findFirst({ where: { eventId: `${prefix}-fx0001arsche` } });
  assert(arsenalFixture?.homeTeamId === 42 && arsenalFixture.awayTeamId === 49, `the fixture should carry the provider's team ids, got ${arsenalFixture?.homeTeamId}/${arsenalFixture?.awayTeamId}`);
  const squad = await prisma.playerSeasonStat.findMany({ where: { teamId: 42 } });
  assert(squad.length === 3 && squad.some((p) => p.name === "Striker 42" && p.shotsOn === 9), `expected Arsenal's three made-up players, got ${squad.length}`);
  assert(runs[2].results === 1, "expected one settled event");

  // Scheduled runs on a credit plan: odds once per interval, results once the match is over.
  const planPrefix = `${prefix}p`;
  const plan = { ...DEFAULT_ODDS_PLAN, oddsCost: 1 };
  const planned = [];
  for (const at of [FIXTURE_KICKOFF - 5 * HOUR, FIXTURE_KICKOFF - 1 * HOUR, FIXTURE_KICKOFF + 3 * HOUR]) {
    planned.push(await ingest(prisma, new FixtureFeed(), { competitionKeys: ["soccer_epl"], now: at, prefix: planPrefix, plan }));
  }
  console.log(planned);
  assert(planned.every((r) => !r.error), "a planned run reported an error");
  assert(planned[0].oddsFetched.length === 1 && planned[0].snapshots > 0, "the first planned run should buy odds");
  assert(planned[1].oddsSkipped.length === 1 && planned[1].snapshots === 0, "a second run within the interval should skip odds");
  assert(planned[2].results === 1, "the planned run after full time should settle the match");

  const eventId = `${prefix}-fx0001arsche`;
  const ids = ["home", "draw", "away"].map((s) => `${eventId}-1x2-${s}`);
  const snaps = await prisma.oddsSnapshot.findMany({ where: { selectionId: { in: ids } } });
  assert(snaps.length === 12, `expected 12 1X2 snapshots (2 complete books × 3 × 2 runs, plus the incomplete book skipped), got ${snaps.length}`);
  const close = closingLine(
    snaps.map((s) => ({ bookmakerId: s.bookmakerId, selectionId: s.selectionId, observedAt: s.observedAt.getTime(), odds: Number(s.odds) })),
    ids,
    FIXTURE_KICKOFF,
  );
  assert(close && close.books === 2, "closing line should use two bookmakers");
  assert(Math.abs(close.selections[0].medianOdds - 2.025) < 1e-9, `closing home price should be the last pre-kickoff median 2.025, got ${close.selections[0].medianOdds}`);
  const sels = await prisma.selection.findMany({ where: { eventId }, orderBy: { id: "asc" } });
  const result = Object.fromEntries(sels.map((s) => [s.id.slice(eventId.length + 1), s.result]));
  assert(result["1x2-home"] === "won" && result["1x2-draw"] === "lost" && result["ou25-over"] === "won", `unexpected settlement ${JSON.stringify(result)}`);
  const other = await prisma.event.findUnique({ where: { id: `${prefix}-fx0002liveve` } });
  assert(other?.status === "live", "unfinished game should be live");
  console.log("Closing line:", close);

  const preds = await prisma.prediction.findMany({ where: { eventId: { startsWith: `${prefix}-` }, modelVersionId: REAL_MODEL.ensemble.id }, include: { outcome: true } });
  assert(preds.length === 8, `expected 8 real-model predictions (Arsenal 1X2 + O/U 2.5, Liverpool 1X2), got ${preds.length}`);
  assert(preds.every((p) => p.createdAt.getTime() === FIXTURE_KICKOFF - 5 * HOUR), "predictions must be recorded once, at the first run inside the lead time");
  assert(preds.every((p) => p.outcome), "every prediction should have a closing line after kickoff");
  const ars = preds.filter((p) => p.eventId === eventId);
  assert(ars.every((p) => p.outcome!.result !== null), "the finished game's predictions should be settled");
  const home = ars.find((p) => p.selectionId.endsWith("-1x2-home"))!;
  assert(home.outcome!.result === "won" && home.probability > 0.3 && home.probability < 0.8, `unexpected home prediction ${home.probability}`);
  const chain = await prisma.prediction.findMany({ orderBy: { seq: "asc" } });
  const v = verifyChain(chain.map((p) => ({ ...p, createdAt: p.createdAt.getTime(), odds: Number(p.odds) })));
  assert(v.ok, `ledger chain broken: ${v.reason}`);
  const bt = await prisma.modelBacktest.findFirst({ where: { league: "en.1" }, orderBy: { createdAt: "desc" } });
  assert(bt && bt.n > 300, "a backtest should be stored");

  // Statistics feed: injuries two days out, lineups near kickoff, xG after the match.
  assert(statsRuns.every((r) => !r.error), "a statistics run reported an error");
  assert(statsRuns.map((r) => [r.injuries, r.lineups, r.stats].join("/")).join(" ") === "2/0/0 0/1/0 0/1/1", `unexpected statistics work ${statsRuns.map((r) => [r.injuries, r.lineups, r.stats].join("/")).join(" ")}`);
  const sf = await prisma.statsFixture.findFirst({ where: { eventId }, include: { lineups: true, injuries: true } });
  assert(sf && sf.lineups.length === 2 && sf.injuries.length === 3 && sf.homeXg === 1.84 && sf.awayXg === 0.97, "Arsenal-Chelsea should have both lineups, three absences and xG 1.84-0.97");
  const ev = await prisma.event.findUnique({ where: { id: eventId } });
  assert(ev?.lineupConfirmedAt?.getTime() === FIXTURE_KICKOFF - HOUR, "lineup confirmation should be stamped at the run that found them");

  // The site's read model over the same data: the ledger behind the CSV export, and the team news behind the picks.
  const snap = await realSnapshot(prisma, FIXTURE_KICKOFF + HOUR);
  const mine = snap.ledger.filter((r) => r.event.id.startsWith(`${prefix}-`));
  assert(mine.length === 8, `read model should show the 8 ledger predictions, got ${mine.length}`);
  assert(snap.audit.verification.ok, "read model audit should verify the chain");
  const ledgerHome = mine.find((r) => r.prediction.selectionId === ids[0])!;
  assert(ledgerHome.status === "settled" && ledgerHome.result === "won" && ledgerHome.clv !== undefined, "settled row should carry result and CLV");
  const news = snap.events.find((e) => e.view.id === eventId)?.news;
  assert(news?.lineups.length === 2 && news.injuries.length === 3 && news.xg?.home === 1.84, "the snapshot should carry lineups, absences and xG for Arsenal-Chelsea");

  console.log(`Fixture ingestion OK. ${preds.length} predictions, chain of ${v.checked} verified, backtest n = ${bt.n}.`);
}

async function live() {
  const feed = configuredFeed();
  if (!feed) throw new Error("Set ODDS_API_KEY (and optionally ODDS_SPORTS, ODDS_REGIONS, ODDS_MARKETS).");
  const summary = await ingest(prisma, feed, { competitionKeys: feedConfig().sports });
  console.log(summary);
  const stats = configuredStatsFeed();
  if (stats) {
    const r = await ingestStats(prisma, stats, { oddsKeys: feedConfig().sports, budget: statsConfig().budget });
    console.log(r);
    if (r.error) process.exitCode = 1;
  }
  console.log(await runModel(prisma, { oddsKeys: feedConfig().sports }));
  if (summary.error) process.exitCode = 1;
}

(process.argv.includes("--fixture") ? fixture() : live())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
