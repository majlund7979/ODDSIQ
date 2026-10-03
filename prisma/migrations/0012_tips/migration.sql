-- CreateTable
CREATE TABLE "TipPick" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "leagueCode" TEXT,
    "pick" TEXT NOT NULL,
    "odds" DOUBLE PRECISION,
    "modelPick" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipPick_userId_eventId_key" ON "TipPick"("userId", "eventId");

-- CreateIndex
CREATE INDEX "TipPick_week_idx" ON "TipPick"("week");

-- CreateIndex
CREATE INDEX "TipPick_eventId_idx" ON "TipPick"("eventId");

-- AddForeignKey
ALTER TABLE "TipPick" ADD CONSTRAINT "TipPick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
