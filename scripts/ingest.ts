// Runs one odds ingestion followed by the real model's scheduled work.
//
//   npm run ingest              live, from The Odds API (needs ODDS_API_KEY)
//                               and openfootball results
//   npm run ingest:fixture      offline, from recorded responses and a
//                               committed results snapshot; then checks
//                               snapshots, closing lines, ledger predictions
//                               and settlement
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
import { realLiveBoard, realLiveView, realReplayData } from "../src/lib/real/live";
import { findByNameOf, positionViewOf, teamRecordOf } from "../src/lib/demo/personal";
import { realAlerts } from "../src/lib/real/alerts";
import { realPersonal } from "../src/lib/real/personal";
import { realSettledSelections } from "../src/lib/real/settled";
import { realMarketDetail, realMatchView, realSnapshot } from "../src/lib/real/store";
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
      if (score.away === 1) {
        // The read model while the match is still in play.
        const arsenal = `${prefix}-fx0001arsche`;
        const liveSnap = await realSnapshot(prisma, at + 5 * 60_000);
        const board = realLiveBoard(liveSnap).find((r) => r.eventId === arsenal);
        assert(board && board.minute === 75 && board.score?.home === 2 && board.score.away === 1, `live board should show Arsenal 2–1 at about 75′, got ${JSON.stringify(board)}`);
        const lv = realLiveView(liveSnap, arsenal);
        const frames = (lv?.minutes ?? []).map((f) => `${f.minute}:${f.score.home}-${f.score.away}`).join(" ");
        assert(frames === "0:0-0 30:1-0 70:2-1", `unexpected in-play frames ${frames}`);
        const home = lv!.minutes.map((f) => f.model[0]);
        assert(home[1] > home[0] && home[2] > home[1], "the in-play model should favour the leading home side more as the match goes on");
        assert(lv!.timeline.filter((t) => t.kind === "goal").length === 3 && lv!.timeline[0].team === "home", "three goals should be inferred from the score changes");
      }
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

  // The terminal's live read model over the same data.
  const snap = await realSnapshot(prisma, FIXTURE_KICKOFF + HOUR);
  const mine = snap.ledger.filter((r) => r.event.id.startsWith(`${prefix}-`));
  assert(mine.length === 8, `read model should show the 8 ledger predictions, got ${mine.length}`);
  assert(snap.audit.verification.ok, "read model audit should verify the chain");
  const ledgerHome = mine.find((r) => r.prediction.selectionId === ids[0])!;
  assert(ledgerHome.status === "settled" && ledgerHome.result === "won" && ledgerHome.clv !== undefined, "settled row should carry result and CLV");
  const mv = realMatchView(snap, eventId);
  assert(mv && mv.results[0] === "won" && mv.preMatchModel[0] === home.probability, "match view should show result and ledgered model");
  assert(Math.abs(mv.closingOdds[0] - 2.025) < 1e-9, `match view closing price should be 2.025, got ${mv?.closingOdds[0]}`);
  const d = realMarketDetail(snap, ids[0]);
  assert(d?.teamNews?.lineups.length === 2 && d.teamNews.injuries.length === 3 && d.teamNews.xg?.home === 1.84, "market detail should carry lineups, absences and xG");
  assert(d && d.chart.length === 2 && d.prediction?.id === home.id && d.analysis.ensemble.probability === home.probability, "market detail should chart both runs and show the ledgered prediction");

  // Alerts, efficiency data and the personal pages over the same snapshot.
  const alerts = realAlerts(snap).filter((x) => x.eventId.startsWith(`${prefix}-`));
  const alertCount = (type: string) => alerts.filter((x) => x.type === type).length;
  assert(alertCount("LINEUP_CHANGE") === 1 && alertCount("INJURY_UPDATE") === 2, `expected one lineup and two injury alerts, got ${alertCount("LINEUP_CHANGE")} and ${alertCount("INJURY_UPDATE")}`);
  const settledRows = (await realSettledSelections(prisma, FIXTURE_KICKOFF + 4 * HOUR)).rows.filter((x) => x.selectionId.startsWith(`${eventId}-`));
  const settledHome = settledRows.find((x) => x.selectionId === ids[0]);
  assert(settledHome && settledHome.won === 1 && Math.abs(settledHome.closingOdds - 2.025) < 1e-9 && settledHome.horizons.length === 6 && settledHome.books.length === 2, "settled Arsenal home win should carry the closing price, six horizons and two books");
  const ctx = await realPersonal(prisma, snap);
  const arsenal = findByNameOf("arsenal", ctx);
  assert(arsenal?.kind === "team" && teamRecordOf(arsenal.id, ctx)?.n === 1, "Arsenal should resolve by name with one settled prediction on them winning");
  const pos = positionViewOf({ selectionId: ids[0], odds: 2.1, at: FIXTURE_KICKOFF - 2 * HOUR }, ctx);
  assert(pos?.status === "settled" && pos.result === "won" && Math.abs(pos.profit! - 1.1) < 1e-9, "a tracked Arsenal price should settle as won");

  // Market Replay once the match is over.
  const replay = await realReplayData(prisma, await realSnapshot(prisma, FIXTURE_KICKOFF + 4 * HOUR), eventId);
  assert(replay && replay.kickoffIndex === 1 && replay.frames.length === 5 && replay.frames[4].score?.home === 2, `replay should have 2 pre-match and 3 in-play frames, got ${replay?.frames.length}`);
  assert(replay.frames[2].model[0] !== null && replay.clv[0] !== null && replay.events.some((x) => x.kind === "goal"), "replay should carry the in-play model, CLV and goals");

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
