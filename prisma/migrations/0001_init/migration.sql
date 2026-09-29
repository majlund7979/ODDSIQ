-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmaker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "margin" DOUBLE PRECISION NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Bookmaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "lineupConfirmedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "result" TEXT,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OddsSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "selectionId" TEXT NOT NULL,
    "bookmakerId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "odds" DECIMAL(8,3) NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "OddsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketNews" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "MarketNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEvent" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "minute" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "modelBefore" DOUBLE PRECISION,
    "modelAfter" DOUBLE PRECISION,

    CONSTRAINT "LiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "trainingFrom" TIMESTAMP(3) NOT NULL,
    "trainingTo" TIMESTAMP(3) NOT NULL,
    "features" TEXT[],
    "notes" TEXT NOT NULL,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "ciLow" DOUBLE PRECISION NOT NULL,
    "ciHigh" DOUBLE PRECISION NOT NULL,
    "confidence" INTEGER NOT NULL,
    "odds" DECIMAL(8,3) NOT NULL,
    "bookmakerId" TEXT NOT NULL,
    "prevHash" CHAR(64) NOT NULL,
    "hash" CHAR(64) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionOutcome" (
    "predictionId" TEXT NOT NULL,
    "closingOdds" DECIMAL(8,3) NOT NULL,
    "closingFairProbability" DOUBLE PRECISION NOT NULL,
    "result" TEXT,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "PredictionOutcome_pkey" PRIMARY KEY ("predictionId")
);

-- CreateTable
CREATE TABLE "MissingPrediction" (
    "marketId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissingPrediction_pkey" PRIMARY KEY ("marketId")
);

-- CreateIndex
CREATE INDEX "Event_kickoff_idx" ON "Event"("kickoff");

-- CreateIndex
CREATE INDEX "Event_leagueId_kickoff_idx" ON "Event"("leagueId", "kickoff");

-- CreateIndex
CREATE INDEX "OddsSnapshot_selectionId_observedAt_idx" ON "OddsSnapshot"("selectionId", "observedAt");

-- CreateIndex
CREATE INDEX "OddsSnapshot_bookmakerId_observedAt_idx" ON "OddsSnapshot"("bookmakerId", "observedAt");

-- CreateIndex
CREATE INDEX "MarketNews_eventId_at_idx" ON "MarketNews"("eventId", "at");

-- CreateIndex
CREATE INDEX "LiveEvent_eventId_minute_idx" ON "LiveEvent"("eventId", "minute");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_seq_key" ON "Prediction"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_hash_key" ON "Prediction"("hash");

-- CreateIndex
CREATE INDEX "Prediction_createdAt_idx" ON "Prediction"("createdAt");

-- CreateIndex
CREATE INDEX "Prediction_selectionId_idx" ON "Prediction"("selectionId");

-- CreateIndex
CREATE INDEX "Prediction_modelVersionId_createdAt_idx" ON "Prediction"("modelVersionId", "createdAt");

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsSnapshot" ADD CONSTRAINT "OddsSnapshot_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsSnapshot" ADD CONSTRAINT "OddsSnapshot_bookmakerId_fkey" FOREIGN KEY ("bookmakerId") REFERENCES "Bookmaker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketNews" ADD CONSTRAINT "MarketNews_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_bookmakerId_fkey" FOREIGN KEY ("bookmakerId") REFERENCES "Bookmaker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionOutcome" ADD CONSTRAINT "PredictionOutcome_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

