// Loads the DEMO_MODE universe into Postgres, as of the current time.
//
//   DATABASE_URL=postgres://... npm run db:seed
//
// The ledger is append-only, so seeding needs an empty database
// (`npx prisma migrate reset` recreates one). Odds snapshots are written for
// events from the last SEED_SNAPSHOT_DAYS days (default 14) and all open
// markets, to keep the seed quick; the full history is available in-app.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { BOOKMAKERS, LEAGUES, SPORTS, TEAMS } from "../src/lib/demo/catalog";
import { MODEL_VERSIONS } from "../src/lib/demo/models";
import { dataSources, eventView, outcomeFor, statusAt, visibleLedger } from "../src/lib/demo/store";
import { bookPrice, DAY, DEMO_GENESIS, eventsForDay, HOUR, MIN } from "../src/lib/demo/universe";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const SNAPSHOT_HOURS_BEFORE_KICKOFF = [168, 72, 48, 24, 12, 6, 3, 1, 0.5, 0.25, 0];

async function batched<T>(label: string, rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 2000) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
  console.log(`  ${label}: ${rows.length}`);
}

async function main() {
  const now = Date.now();
  const snapshotDays = Number(process.env.SEED_SNAPSHOT_DAYS ?? 14);
  if ((await prisma.prediction.count()) > 0) {
    throw new Error("The prediction ledger is not empty. It is append-only, so seed a fresh database (npx prisma migrate reset).");
  }

  console.log("Seeding ODDSIQ demo data (DEMO DATA) as of", new Date(now).toISOString());
  await prisma.sport.createMany({ data: SPORTS });
  await prisma.league.createMany({ data: LEAGUES });
  await prisma.team.createMany({ data: TEAMS.map((t) => ({ id: t.id, leagueId: t.leagueId, name: t.name, shortName: t.shortName })) });
  await prisma.bookmaker.createMany({ data: BOOKMAKERS });
  await prisma.modelVersion.createMany({
    data: MODEL_VERSIONS.map((m) => ({
      id: m.id,
      family: m.familyId,
      version: m.version,
      releasedAt: new Date(m.releasedAt),
      trainingFrom: new Date(m.trainingFrom),
      trainingTo: new Date(m.trainingTo),
      features: m.features,
      notes: m.notes,
    })),
  });
  await prisma.dataSource.createMany({
    data: dataSources(now).map((s) => ({ id: s.id, name: s.name, kind: s.kind, provider: s.provider, status: s.status, lastSyncAt: new Date(s.lastSyncAt) })),
  });

  const events = [];
  for (let day = DEMO_GENESIS; day <= Math.floor(now / DAY) * DAY + 8 * DAY; day += DAY) events.push(...eventsForDay(day));
  const visible = events.filter((e) => e.openAt <= now);

  await batched("events", visible, (chunk) =>
    prisma.event.createMany({
      data: chunk.map((e) => {
        const v = eventView(e, now);
        return {
          id: e.event.id,
          sportId: e.event.sportId,
          leagueId: e.event.leagueId,
          homeTeamId: e.event.homeTeamId,
          awayTeamId: e.event.awayTeamId,
          kickoff: new Date(e.event.kickoff),
          status: v.status,
          homeScore: v.score?.home ?? null,
          awayScore: v.score?.away ?? null,
          lineupConfirmedAt: e.event.lineupConfirmedAt && e.event.lineupConfirmedAt <= now ? new Date(e.event.lineupConfirmedAt) : null,
        };
      }),
    }),
  );
  await batched("markets", visible.flatMap((e) => e.markets.map((m) => m.market)), (chunk) => prisma.market.createMany({ data: chunk }));
  await batched(
    "selections",
    visible.flatMap((e) =>
      e.markets.flatMap((m) =>
        m.selections.map((s) => ({ ...s.selection, result: statusAt(e, now) === "finished" ? (s.selection.result ?? null) : null })),
      ),
    ),
    (chunk) => prisma.selection.createMany({ data: chunk }),
  );
  await batched(
    "news",
    visible.flatMap((e) => e.news.filter((n) => n.at <= now).map((n) => ({ eventId: e.event.id, at: new Date(n.at), kind: n.kind, text: n.text, sourceId: "demo-injuries" }))),
    (chunk) => prisma.marketNews.createMany({ data: chunk }),
  );
  await batched(
    "live events",
    visible
      .filter((e) => e.match && statusAt(e, now) !== "scheduled" && e.event.kickoff >= now - snapshotDays * DAY)
      .flatMap((e) => e.match!.timeline.filter((x) => x.kind !== "corner").map((x) => ({ ...x, modelBefore: x.modelBefore ?? null, modelAfter: x.modelAfter ?? null }))),
    (chunk) => prisma.liveEvent.createMany({ data: chunk }),
  );

  const snapshots: { selectionId: string; bookmakerId: string; observedAt: Date; odds: number; sourceId: string }[] = [];
  for (const e of visible) {
    if (e.event.kickoff < now - snapshotDays * DAY) continue;
    const times = SNAPSHOT_HOURS_BEFORE_KICKOFF.map((h) => e.event.kickoff - h * HOUR).filter((t) => t <= now);
    if (e.event.kickoff > now) times.push(Math.floor(now / MIN) * MIN);
    for (const m of e.markets) {
      m.selections.forEach((s, si) => {
        BOOKMAKERS.forEach((b, bi) => {
          for (const t of times) {
            const odds = bookPrice(e, m, si, bi, t);
            if (!Number.isNaN(odds)) snapshots.push({ selectionId: s.selection.id, bookmakerId: b.id, observedAt: new Date(t), odds, sourceId: "demo-odds" });
          }
        });
      });
    }
  }
  await batched("odds snapshots", snapshots, (chunk) => prisma.oddsSnapshot.createMany({ data: chunk }), 5000);

  // The ledger must be inserted in sequence order: the database checks every row extends the chain.
  const ledger = visibleLedger(now);
  await batched("predictions", ledger, (chunk) =>
    prisma.prediction.createMany({ data: chunk.map((p) => ({ ...p, createdAt: new Date(p.createdAt) })) }),
  );
  const outcomes = ledger
    .map((p) => outcomeFor(p, now))
    .filter((o) => o.status !== "pending")
    .map((o) => ({
      predictionId: o.predictionId!,
      closingOdds: o.closingOdds!,
      closingFairProbability: o.closingFairProbability!,
      result: o.result ?? null,
      settledAt: o.settledAt ? new Date(o.settledAt) : null,
    }));
  await batched("prediction outcomes", outcomes, (chunk) => prisma.predictionOutcome.createMany({ data: chunk }));
  await batched(
    "missing predictions",
    visible.filter((e) => e.predictionAt <= now).flatMap((e) => e.missing.map((m) => ({ marketId: m.marketId, eventId: e.event.id, reason: m.reason, kickoff: new Date(e.event.kickoff) }))),
    (chunk) => prisma.missingPrediction.createMany({ data: chunk }),
  );
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
