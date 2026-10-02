-- Last time a scheduled run paid for a league's odds, so runs can space out credit spend.
ALTER TABLE "League" ADD COLUMN "oddsFetchedAt" TIMESTAMP(3);
