-- CreateTable
CREATE TABLE "StatsFixture" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "eventId" TEXT,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "homeXg" DOUBLE PRECISION,
    "awayXg" DOUBLE PRECISION,
    "stats" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "lineupsAt" TIMESTAMP(3),
    "injuriesAt" TIMESTAMP(3),
    "statsAt" TIMESTAMP(3),

    CONSTRAINT "StatsFixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamLineup" (
    "fixtureId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "formation" TEXT,
    "coach" TEXT,
    "startXI" JSONB NOT NULL,
    "substitutes" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamLineup_pkey" PRIMARY KEY ("fixtureId","side")
);

-- CreateTable
CREATE TABLE "InjuryReport" (
    "id" BIGSERIAL NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "player" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InjuryReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatsFixture_eventId_idx" ON "StatsFixture"("eventId");

-- CreateIndex
CREATE INDEX "StatsFixture_leagueId_kickoff_idx" ON "StatsFixture"("leagueId", "kickoff");

-- CreateIndex
CREATE INDEX "InjuryReport_fixtureId_idx" ON "InjuryReport"("fixtureId");

-- AddForeignKey
ALTER TABLE "StatsFixture" ADD CONSTRAINT "StatsFixture_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLineup" ADD CONSTRAINT "TeamLineup_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "StatsFixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "StatsFixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

