-- CreateTable
CREATE TABLE "Friend" (
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("email")
);
