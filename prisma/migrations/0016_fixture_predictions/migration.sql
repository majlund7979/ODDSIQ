-- CreateTable
CREATE TABLE "FixturePrediction" (
    "fixtureId" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "FixturePrediction_pkey" PRIMARY KEY ("fixtureId")
);
