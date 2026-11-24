-- Registrations: one person's place at an event, on one ticket type, with
-- the count each ticket type keeps of its confirmed ones.
--
-- Tables and keys below were generated from schema.prisma; the rules Prisma
-- cannot express (checks, triggers, grants, row-level security) follow them.
--
-- Nothing grants app_user a write to registrations yet. Registering arrives
-- with the public event page and checkout, through its own narrow path.

-- AlterTable
ALTER TABLE "ticket_types" ADD COLUMN     "registered_count" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "user_id" UUID,
    "attendee_name" TEXT NOT NULL,
    "attendee_email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registrations_event_id_created_at_id_idx" ON "registrations"("event_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "registrations_ticket_type_id_event_id_idx" ON "registrations"("ticket_type_id", "event_id");

-- CreateIndex
CREATE INDEX "registrations_user_id_idx" ON "registrations"("user_id");

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_ticket_type_id_event_id_fkey" FOREIGN KEY ("ticket_type_id", "event_id") REFERENCES "ticket_types"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_attendee_name_length"
    CHECK (length(btrim(attendee_name)) BETWEEN 1 AND 120),
  ADD CONSTRAINT "registrations_attendee_email"
    CHECK (attendee_email = lower(attendee_email)
           AND length(attendee_email) BETWEEN 3 AND 320),
  ADD CONSTRAINT "registrations_status"
    CHECK (status IN ('confirmed', 'waitlisted', 'cancelled'));

ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_registered_count"
    CHECK (registered_count >= 0);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER registrations_stamp_insert
  BEFORE INSERT ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_insert('with_updated_at');

CREATE TRIGGER registrations_touch_updated_at
  BEFORE UPDATE ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Keeps ticket_types.registered_count equal to that ticket's confirmed
-- registrations, in the same transaction as the change. Counts are then a
-- read of one row per ticket, never a COUNT(*) over registrations. The row
-- lock the UPDATE takes queues concurrent registrations for the same ticket,
-- so none is lost.
--
-- SECURITY DEFINER: app_user has no grant on registered_count, so nothing but
-- this trigger can change it. search_path is pinned so the definer's rights
-- cannot be borrowed through a planted object.
CREATE FUNCTION app.count_registration() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  held_before boolean := false;
  held_after boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    held_before := OLD.status = 'confirmed';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    held_after := NEW.status = 'confirmed';
  END IF;

  IF TG_OP = 'UPDATE' AND held_before AND held_after
     AND OLD.ticket_type_id = NEW.ticket_type_id THEN
    RETURN NULL;
  END IF;

  IF held_before THEN
    UPDATE public.ticket_types
      SET registered_count = registered_count - 1
      WHERE id = OLD.ticket_type_id;
  END IF;
  IF held_after THEN
    UPDATE public.ticket_types
      SET registered_count = registered_count + 1
      WHERE id = NEW.ticket_type_id;
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION app.count_registration() FROM PUBLIC;

CREATE TRIGGER registrations_count
  AFTER INSERT OR DELETE OR UPDATE OF status, ticket_type_id
  ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.count_registration();

-- updated_at on a ticket type means the host changed it. A registration
-- moving the count is not that, so the touch trigger now watches only the
-- columns a host edits.
DROP TRIGGER ticket_types_touch_updated_at ON "ticket_types";
CREATE TRIGGER ticket_types_touch_updated_at
  BEFORE UPDATE OF name, price_minor, capacity, max_per_person,
    waitlist_enabled, invite_only, closed_at, position
  ON "ticket_types"
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Who may do what
--
-- The host reads every registration for their event. An attendee with an
-- account reads their own. No one writes through app_user yet.
-- ---------------------------------------------------------------------------

ALTER TABLE "registrations" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON "registrations" TO app_user;

CREATE POLICY registrations_select ON "registrations"
  FOR SELECT TO app_user
  USING (
    app.manages_event(event_id)
    OR (user_id IS NOT NULL AND user_id = app.current_user_id())
  );

-- Supabase's API roles get nothing, as with every other table.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.registrations FROM %I', r);
    END IF;
  END LOOP;
END
$$;
