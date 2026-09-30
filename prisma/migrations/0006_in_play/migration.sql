
-- AlterTable
ALTER TABLE "IngestRun" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'scheduled';

-- CreateTable
CREATE TABLE "InPlayOdds" (
    "id" BIGSERIAL NOT NULL,
    "selectionId" TEXT NOT NULL,
    "bookmakerId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "odds" DECIMAL(8,3) NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "InPlayOdds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreUpdate" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL,

    CONSTRAINT "ScoreUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InPlayOdds_selectionId_observedAt_idx" ON "InPlayOdds"("selectionId", "observedAt");

-- CreateIndex
CREATE INDEX "ScoreUpdate_eventId_observedAt_idx" ON "ScoreUpdate"("eventId", "observedAt");

-- AddForeignKey
ALTER TABLE "InPlayOdds" ADD CONSTRAINT "InPlayOdds_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InPlayOdds" ADD CONSTRAINT "InPlayOdds_bookmakerId_fkey" FOREIGN KEY ("bookmakerId") REFERENCES "Bookmaker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreUpdate" ADD CONSTRAINT "ScoreUpdate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

