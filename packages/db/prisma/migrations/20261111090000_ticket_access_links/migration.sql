-- AlterTable
ALTER TABLE "IssuedTicket" ADD COLUMN     "accessLinkSentAt" TIMESTAMP(3),
ADD COLUMN     "accessTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IssuedTicket_accessTokenHash_key" ON "IssuedTicket"("accessTokenHash");


-- No backfill: tickets issued before this migration get a link the first time
-- their holder requests one ("Email me my ticket link").
