-- AlterTable
ALTER TABLE "PlayerSeasonStat" ADD COLUMN "assists" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "foulsCommitted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "foulsDrawn" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerMatchStat" (
    "provider" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "shotsOn" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "foulsCommitted" INTEGER NOT NULL,
    "foulsDrawn" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerMatchStat_pkey" PRIMARY KEY ("provider","fixtureId","playerId")
);

-- CreateIndex
CREATE INDEX "PlayerMatchStat_provider_teamId_kickoff_idx" ON "PlayerMatchStat"("provider", "teamId", "kickoff");
