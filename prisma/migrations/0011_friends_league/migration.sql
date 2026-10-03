-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "morningEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FriendBet" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "stake" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FriendBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MorningMail" (
    "day" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" INTEGER NOT NULL,

    CONSTRAINT "MorningMail_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "FriendBet_kickoff_idx" ON "FriendBet"("kickoff");

-- CreateIndex
CREATE UNIQUE INDEX "FriendBet_userId_eventId_spec_key" ON "FriendBet"("userId", "eventId", "spec");

-- AddForeignKey
ALTER TABLE "FriendBet" ADD CONSTRAINT "FriendBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

