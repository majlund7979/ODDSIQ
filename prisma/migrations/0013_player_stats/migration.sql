-- AlterTable
ALTER TABLE "StatsFixture" ADD COLUMN "homeTeamId" INTEGER,
ADD COLUMN "awayTeamId" INTEGER;

-- CreateTable
CREATE TABLE "PlayerSeasonStat" (
    "provider" TEXT NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "appearances" INTEGER NOT NULL,
    "lineups" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "shotsOn" INTEGER NOT NULL,
    "shotsTotal" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "injured" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerSeasonStat_pkey" PRIMARY KEY ("provider","leagueId","season","teamId","playerId")
);

-- CreateTable
CREATE TABLE "PlayerStatsSync" (
    "id" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStatsSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerSeasonStat_provider_teamId_season_idx" ON "PlayerSeasonStat"("provider", "teamId", "season");
