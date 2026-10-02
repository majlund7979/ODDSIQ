-- CreateTable
CREATE TABLE "MatchStat" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "hc" INTEGER,
    "ac" INTEGER,
    "hcards" INTEGER,
    "acards" INTEGER,
    "hf" INTEGER,
    "af" INTEGER,

    CONSTRAINT "MatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchStat_league_date_idx" ON "MatchStat"("league", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MatchStat_league_date_home_away_key" ON "MatchStat"("league", "date", "home", "away");
