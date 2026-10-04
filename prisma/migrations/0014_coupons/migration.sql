-- CreateTable
CREATE TABLE "FriendCoupon" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stake" DOUBLE PRECISION NOT NULL,
    "odds" DOUBLE PRECISION,

    CONSTRAINT "FriendCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendCouponLeg" (
    "id" BIGSERIAL NOT NULL,
    "couponId" BIGINT NOT NULL,
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

    CONSTRAINT "FriendCouponLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FriendCoupon_userId_idx" ON "FriendCoupon"("userId");

-- CreateIndex
CREATE INDEX "FriendCouponLeg_couponId_idx" ON "FriendCouponLeg"("couponId");

-- CreateIndex
CREATE INDEX "FriendCouponLeg_kickoff_idx" ON "FriendCouponLeg"("kickoff");

-- AddForeignKey
ALTER TABLE "FriendCoupon" ADD CONSTRAINT "FriendCoupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendCouponLeg" ADD CONSTRAINT "FriendCouponLeg_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "FriendCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
