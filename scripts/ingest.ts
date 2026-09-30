// Runs one odds ingestion.
//
//   npm run ingest              live, from The Odds API (needs ODDS_API_KEY)
//   npm run ingest:fixture      offline, from recorded responses; then checks
//                               snapshots, the closing line and settlement
//
// Both need DATABASE_URL.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { closingLine } from "../src/lib/providers/closing";
import { configuredFeed, feedConfig } from "../src/lib/providers/config";
import { FIXTURE_KICKOFF, FixtureFeed } from "../src/lib/providers/fixture-feed";
import { ingest } from "../src/lib/providers/ingest";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const HOUR = 3_600_000;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Fixture check failed: ${msg}`);
}

async function fixture() {
  const prefix = `fx${Date.now().toString(36)}`;
  const runs = [
    await ingest(prisma, new FixtureFeed(1.03), { competitionKeys: ["soccer_epl"], now: FIXTURE_KICKOFF - 5 * HOUR, prefix }),
    await ingest(prisma, new FixtureFeed(1), { competitionKeys: ["soccer_epl"], now: FIXTURE_KICKOFF - 1 * HOUR, prefix }),
    // After kickoff: no new pre-match snapshots, the finished game is settled.
    await ingest(prisma, new FixtureFeed(0.98), { competitionKeys: ["soccer_epl"], now: FIXTURE_KICKOFF + 3 * HOUR, prefix }),
  ];
  for (const r of runs) console.log(r);
  assert(runs.every((r) => !r.error), "a run reported an error");
  assert(runs[2].results === 1, "expected one settled event");

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
  console.log("Fixture ingestion OK. Closing line:", close);
}

async function live() {
  const feed = configuredFeed();
  if (!feed) throw new Error("Set ODDS_API_KEY (and optionally ODDS_SPORTS, ODDS_REGIONS, ODDS_MARKETS).");
  const summary = await ingest(prisma, feed, { competitionKeys: feedConfig().sports });
  console.log(summary);
  if (summary.error) process.exitCode = 1;
}

(process.argv.includes("--fixture") ? fixture() : live())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
