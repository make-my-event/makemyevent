-- AlterTable
ALTER TABLE "CommunityMember" ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT;

-- AlterTable
ALTER TABLE "EventVolunteer" ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT;

-- AlterTable
ALTER TABLE "OrganizerMember" ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMember_inviteTokenHash_key" ON "CommunityMember"("inviteTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EventVolunteer_inviteTokenHash_key" ON "EventVolunteer"("inviteTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerMember_inviteTokenHash_key" ON "OrganizerMember"("inviteTokenHash");


-- Backfill: invitations that are still pending (no linked account) get the
-- same 7-day acceptance window as new invitations, counted from this
-- migration. They have no token (their emails predate tokens), so they can be
-- accepted in-app by a signed-in user with a matching verified email, or the
-- organizer can re-invite to send a link.
UPDATE "OrganizerMember" SET "inviteExpiresAt" = NOW() + INTERVAL '7 days' WHERE "userId" IS NULL;
UPDATE "CommunityMember" SET "inviteExpiresAt" = NOW() + INTERVAL '7 days' WHERE "userId" IS NULL;
UPDATE "EventVolunteer" SET "inviteExpiresAt" = NOW() + INTERVAL '7 days' WHERE "userId" IS NULL;
