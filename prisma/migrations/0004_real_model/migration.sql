-- CreateTable
CREATE TABLE "HistoricalMatch" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "hg" INTEGER NOT NULL,
    "ag" INTEGER NOT NULL,

    CONSTRAINT "HistoricalMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelBacktest" (
    "id" BIGSERIAL NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "testFrom" TIMESTAMP(3) NOT NULL,
    "testTo" TIMESTAMP(3) NOT NULL,
    "n" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,

    CONSTRAINT "ModelBacktest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricalMatch_league_date_idx" ON "HistoricalMatch"("league", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalMatch_league_date_home_away_key" ON "HistoricalMatch"("league", "date", "home", "away");

-- CreateIndex
CREATE INDEX "ModelBacktest_league_createdAt_idx" ON "ModelBacktest"("league", "createdAt");

