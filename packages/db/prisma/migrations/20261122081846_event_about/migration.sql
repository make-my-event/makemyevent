-- The About text, as the rich-text editor's document.
--
-- description (plain text, never written by anything) gives way to about:
-- JSONB, so the database itself only takes a well-formed JSON object. What
-- the object may contain is decided on the server before it gets here
-- (packages/core/src/about.ts rebuilds it from an allowlist); this column
-- adds a floor: an object, of bounded size.

-- AlterTable
ALTER TABLE "events" DROP COLUMN "description",
ADD COLUMN     "about" JSONB;

ALTER TABLE "events"
  ADD CONSTRAINT "events_about_shape"
    CHECK (jsonb_typeof(about) = 'object' AND about ->> 'type' = 'doc'),
  -- Far above 5,000 words with formatting; stops a runaway write.
  ADD CONSTRAINT "events_about_size"
    CHECK (pg_column_size(about) <= 512000);

GRANT INSERT (about), UPDATE (about) ON "events" TO app_user;
