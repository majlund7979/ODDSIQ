-- AlterTable
ALTER TABLE "MatchStat" ADD COLUMN "hg" INTEGER,
ADD COLUMN "ag" INTEGER,
ADD COLUMN "hthg" INTEGER,
ADD COLUMN "htag" INTEGER,
ADD COLUMN "referee" TEXT;

-- AlterTable
ALTER TABLE "StatsFixture" ADD COLUMN "referee" TEXT;

-- CreateTable
CREATE TABLE "PickRecord" (
    "id" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "leagueName" TEXT NOT NULL,
    "leagueCode" TEXT,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "odds" DOUBLE PRECISION,

    CONSTRAINT "PickRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickRecord_kickoff_idx" ON "PickRecord"("kickoff");

-- CreateIndex
CREATE UNIQUE INDEX "PickRecord_eventId_category_key" ON "PickRecord"("eventId", "category");
