-- Public addresses that keep working after a rename, the poster's alt
-- text, and a default of 250 places for a new event.
--
-- Tables and keys below were generated from schema.prisma; the rules Prisma
-- cannot express (checks, triggers, functions, grants, row-level security)
-- follow them.

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "poster_alt" TEXT,
ALTER COLUMN "capacity" SET DEFAULT 250;

-- CreateTable
CREATE TABLE "event_addresses" (
    "slug" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_addresses_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "event_addresses_event_id_idx" ON "event_addresses"("event_id");

-- AddForeignKey
ALTER TABLE "event_addresses" ADD CONSTRAINT "event_addresses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Checks and grants for the new column
-- ---------------------------------------------------------------------------

ALTER TABLE "events"
  ADD CONSTRAINT "events_poster_alt_length"
    CHECK (length(poster_alt) <= 250);

GRANT INSERT (poster_alt), UPDATE (poster_alt) ON "events" TO app_user;

-- ---------------------------------------------------------------------------
-- Addresses
--
-- event_addresses holds every address an event has held, the current one
-- too, keyed by the address. So an address is unique across the site and
-- across time: a new event, or a rename, that wants one already held by
-- another event fails on the primary key, as a unique violation the app
-- already treats as "taken".
--
-- Triggers keep it, with the definer's rights, since app_user has no grant
-- on it. search_path is pinned so those rights cannot be borrowed.
-- ---------------------------------------------------------------------------

INSERT INTO "event_addresses" (slug, event_id, created_at)
  SELECT slug, id, created_at FROM "events";

CREATE FUNCTION app.record_address() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.event_addresses (slug, event_id) VALUES (NEW.slug, NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.slug IS NOT DISTINCT FROM OLD.slug THEN
    RETURN NEW;
  END IF;

  -- Another event holds, or once held, the new address.
  IF EXISTS (
    SELECT 1 FROM public.event_addresses a
    WHERE a.slug = NEW.slug AND a.event_id <> NEW.id
  ) THEN
    RAISE unique_violation
      USING MESSAGE = format('the address %s is taken', NEW.slug),
            CONSTRAINT = 'event_addresses_pkey';
  END IF;

  -- Its own earlier address comes back to it; a new one is recorded.
  INSERT INTO public.event_addresses (slug, event_id)
    VALUES (NEW.slug, NEW.id)
    ON CONFLICT (slug) DO NOTHING;

  -- A draft has not been shared, so its old address is let go. Anything
  -- that has been public keeps it, and the old link keeps working.
  IF OLD.status = 'draft' THEN
    DELETE FROM public.event_addresses
      WHERE slug = OLD.slug AND event_id = NEW.id;
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.record_address() FROM PUBLIC;

CREATE TRIGGER events_record_address_insert
  AFTER INSERT ON "events"
  FOR EACH ROW EXECUTE FUNCTION app.record_address();

CREATE TRIGGER events_record_address_update
  BEFORE UPDATE OF slug ON "events"
  FOR EACH ROW EXECUTE FUNCTION app.record_address();

-- Whether an address is free for this event: well formed, not a word the
-- dashboard uses, and held by no other event, ever. Says yes or no and
-- nothing else, so it cannot be used to read another host's drafts.
CREATE FUNCTION app.address_available(candidate text, for_event uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT candidate ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      AND length(candidate) <= 80
      AND candidate NOT IN ('organized', 'attending')
      AND NOT EXISTS (
        SELECT 1 FROM public.event_addresses a
        WHERE a.slug = candidate AND a.event_id IS DISTINCT FROM for_event
      )
  $$;

REVOKE ALL ON FUNCTION app.address_available(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.address_available(text, uuid) TO app_user;

-- Read with the event: anyone who can see an event can follow its old
-- addresses to it. No one writes here but the trigger.
ALTER TABLE "event_addresses" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON "event_addresses" TO app_user;

CREATE POLICY event_addresses_select ON "event_addresses"
  FOR SELECT TO app_user
  USING (app.can_see_event(event_id));

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.event_addresses FROM %I', r);
    END IF;
  END LOOP;
END
$$;
