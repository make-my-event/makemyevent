-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationExempt" BOOLEAN NOT NULL DEFAULT false;

-- 1. Accounts with a password AND a Google/GitHub sign-in on an email that was
--    never verified. The provider proved who owns the inbox; the password may
--    have been set by someone else before the owner signed up (pre-account
--    takeover). Sign these accounts out everywhere, remove the password and
--    mark the email verified. Owners keep signing in with Google/GitHub and can
--    set a new password ("Forgot password" or their profile).
DELETE FROM "Session"
WHERE "userId" IN (
  SELECT u."id" FROM "User" u
  WHERE u."passwordHash" IS NOT NULL
    AND u."emailVerified" IS NULL
    AND EXISTS (
      SELECT 1 FROM "Account" a
      WHERE a."userId" = u."id" AND a."provider" IN ('google', 'github')
    )
);

UPDATE "User" u
SET "passwordHash" = NULL, "emailVerified" = NOW()
WHERE u."passwordHash" IS NOT NULL
  AND u."emailVerified" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Account" a
    WHERE a."userId" = u."id" AND a."provider" IN ('google', 'github')
  );

-- 2. Google/GitHub-only accounts: the provider verified the email.
UPDATE "User" u
SET "emailVerified" = NOW()
WHERE u."emailVerified" IS NULL
  AND u."passwordHash" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Account" a
    WHERE a."userId" = u."id" AND a."provider" IN ('google', 'github')
  );

-- 3. Remaining password accounts with an unverified email were created before
--    verification existed: they may keep signing in (grandfathered).
UPDATE "User"
SET "emailVerificationExempt" = true
WHERE "passwordHash" IS NOT NULL AND "emailVerified" IS NULL;
