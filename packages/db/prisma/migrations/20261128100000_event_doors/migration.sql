-- Doors: an event with more than one way in names its doors, and each
-- check-in records which one let the guest in.
--
--   events.doors_enabled  the organizer's switch; on needs two or more open
--                         doors, and off asks for and records no door
--   event_doors           the doors, named once by those who manage the
--                         event; a door that let anyone in is retired, not
--                         deleted, so its check-ins keep its name
--   door_assignments      a volunteer held to one door; organizers, admins
--                         and the owner walk about and pick for themselves
--   check_ins.door_id     the door, checked and, for an assigned volunteer,
--                         filled in by the database
--
-- The door is what the person at it says (or was assigned): the database
-- holds the rules (a real, open door of this event; an assigned volunteer's
-- own door and no other), it can't see where a phone is.

-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "door_id" UUID;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "doors_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "event_doors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "retired_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_doors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "door_assignments" (
    "member_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "door_id" UUID NOT NULL,

    CONSTRAINT "door_assignments_pkey" PRIMARY KEY ("member_id")
);

-- CreateIndex
CREATE INDEX "event_doors_event_id_position_idx" ON "event_doors"("event_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "event_doors_id_event_id_key" ON "event_doors"("id", "event_id");

-- CreateIndex
CREATE INDEX "door_assignments_door_id_event_id_idx" ON "door_assignments"("door_id", "event_id");

-- CreateIndex
CREATE INDEX "door_assignments_event_id_idx" ON "door_assignments"("event_id");

-- CreateIndex
CREATE INDEX "check_ins_door_id_idx" ON "check_ins"("door_id");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_door_id_fkey" FOREIGN KEY ("door_id") REFERENCES "event_doors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "event_doors" ADD CONSTRAINT "event_doors_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "door_assignments" ADD CONSTRAINT "door_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "event_members"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "door_assignments" ADD CONSTRAINT "door_assignments_door_id_event_id_fkey" FOREIGN KEY ("door_id", "event_id") REFERENCES "event_doors"("id", "event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- A door's name and place
-- ---------------------------------------------------------------------------

ALTER TABLE "event_doors"
  ADD CONSTRAINT "event_doors_name_length"
    CHECK (length(name) BETWEEN 1 AND 40 AND name = btrim(name)),
  ADD CONSTRAINT "event_doors_position"
    CHECK (position BETWEEN 0 AND 99);

-- Open doors: unique names in an event, whatever their case; at most 20;
-- while doors are on, never fewer than two (retiring or deleting the
-- second-last is refused: turn doors off first). The event's row is locked
-- first, so two organizers editing at once are checked one after the other.
CREATE FUNCTION app.event_doors_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  target uuid := coalesce(NEW.event_id, OLD.event_id);
  enabled boolean;
  open_after int;
BEGIN
  SELECT e.doors_enabled INTO enabled FROM public.events e
    WHERE e.id = target FOR NO KEY UPDATE;

  IF TG_OP <> 'DELETE' AND NEW.retired_at IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.event_doors d
      WHERE d.event_id = NEW.event_id AND d.id <> NEW.id
        AND d.retired_at IS NULL AND lower(d.name) = lower(NEW.name)
    ) THEN
      RAISE EXCEPTION 'door name taken' USING ERRCODE = '23505',
        HINT = 'Another door already has that name.';
    END IF;
    IF TG_OP = 'INSERT' AND (
      SELECT count(*) FROM public.event_doors d
      WHERE d.event_id = NEW.event_id AND d.retired_at IS NULL
    ) >= 20 THEN
      RAISE EXCEPTION 'too many doors' USING ERRCODE = '23514',
        HINT = 'An event can have up to 20 doors.';
    END IF;
  END IF;

  -- A door closing (retired or deleted) while doors are on.
  IF enabled AND (
    TG_OP = 'DELETE' AND OLD.retired_at IS NULL
    OR TG_OP = 'UPDATE' AND OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL
  ) THEN
    SELECT count(*) INTO open_after FROM public.event_doors d
      WHERE d.event_id = target AND d.retired_at IS NULL AND d.id <> OLD.id;
    IF open_after < 2 THEN
      RAISE EXCEPTION 'doors below two' USING ERRCODE = '23514',
        HINT = 'Doors are on, so the event needs at least two. Turn doors off first, or add another.';
    END IF;
  END IF;

  -- A retired door can't come back: add it again instead.
  IF TG_OP = 'UPDATE' AND OLD.retired_at IS NOT NULL AND NEW.retired_at IS NULL THEN
    RAISE EXCEPTION 'door retired' USING ERRCODE = '23514',
      HINT = 'That door was removed. Add it again instead.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER event_doors_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "event_doors"
  FOR EACH ROW EXECUTE FUNCTION app.event_doors_guard();

-- A retired door's volunteers go back to any door.
CREATE FUNCTION app.event_door_retired() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  DELETE FROM public.door_assignments a WHERE a.door_id = NEW.id;
  RETURN NULL;
END
$$;

CREATE TRIGGER event_doors_retired
  AFTER UPDATE OF retired_at ON "event_doors"
  FOR EACH ROW
  WHEN (OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL)
  EXECUTE FUNCTION app.event_door_retired();

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------

-- On: at least two open doors. Off: every volunteer back to any door.
CREATE FUNCTION app.events_doors_switch() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.doors_enabled AND NOT OLD.doors_enabled AND (
    SELECT count(*) FROM public.event_doors d
    WHERE d.event_id = NEW.id AND d.retired_at IS NULL
  ) < 2 THEN
    RAISE EXCEPTION 'doors below two' USING ERRCODE = '23514',
      HINT = 'Add at least two doors before turning doors on.';
  END IF;
  IF OLD.doors_enabled AND NOT NEW.doors_enabled THEN
    DELETE FROM public.door_assignments a WHERE a.event_id = NEW.id;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER events_doors_switch
  BEFORE UPDATE OF doors_enabled ON "events"
  FOR EACH ROW
  WHEN (OLD.doors_enabled IS DISTINCT FROM NEW.doors_enabled)
  EXECUTE FUNCTION app.events_doors_switch();

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------

-- Only a volunteer on this event's team, only an open door, only while
-- doors are on.
CREATE FUNCTION app.door_assignments_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  enabled boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event_members m
    WHERE m.id = NEW.member_id AND m.event_id = NEW.event_id
      AND m.role = 'volunteer'
  ) THEN
    RAISE EXCEPTION 'not a volunteer here' USING ERRCODE = '23514',
      HINT = 'Only this event''s volunteers can be held to a door.';
  END IF;
  -- Shared locks on the door, then the event (the order retiring a door
  -- takes them in, so the two never deadlock): an organizer retiring this
  -- door or turning doors off at the same moment finishes first, and this
  -- sees what they left, so no assignment outlives its door or the switch.
  PERFORM 1 FROM public.event_doors d
    WHERE d.id = NEW.door_id AND d.event_id = NEW.event_id
      AND d.retired_at IS NULL
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'door not open' USING ERRCODE = '23514',
      HINT = 'That door isn''t one of this event''s open doors.';
  END IF;
  SELECT e.doors_enabled INTO enabled FROM public.events e
    WHERE e.id = NEW.event_id FOR SHARE;
  IF NOT coalesce(enabled, false) THEN
    RAISE EXCEPTION 'doors off' USING ERRCODE = '23514',
      HINT = 'Turn doors on before assigning them.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER door_assignments_guard
  BEFORE INSERT OR UPDATE ON "door_assignments"
  FOR EACH ROW EXECUTE FUNCTION app.door_assignments_guard();

-- A volunteer made organizer or admin walks about: no longer held.
CREATE FUNCTION app.event_members_door_role() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  DELETE FROM public.door_assignments a WHERE a.member_id = NEW.id;
  RETURN NULL;
END
$$;

CREATE TRIGGER event_members_door_role
  AFTER UPDATE OF role ON "event_members"
  FOR EACH ROW
  WHEN (NEW.role <> 'volunteer')
  EXECUTE FUNCTION app.event_members_door_role();

-- ---------------------------------------------------------------------------
-- The door on a check-in
-- ---------------------------------------------------------------------------

-- Doors off: no door. Doors on: an assigned volunteer's check-in is their
-- door (filled in when none is sent; another is refused); any door given
-- must be one of this event's open doors. None given and none assigned is a
-- check-in from Guests with no door known: allowed.
CREATE FUNCTION app.check_in_door() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  enabled boolean;
  assigned uuid;
BEGIN
  SELECT e.doors_enabled INTO enabled FROM public.events e WHERE e.id = NEW.event_id;
  IF NOT coalesce(enabled, false) THEN
    NEW.door_id := NULL;
    RETURN NEW;
  END IF;

  SELECT a.door_id INTO assigned
    FROM public.door_assignments a
    JOIN public.event_members m ON m.id = a.member_id
    WHERE m.event_id = NEW.event_id
      AND m.user_id = app.current_user_id()
      AND m.role = 'volunteer';

  IF assigned IS NOT NULL THEN
    IF NEW.door_id IS NULL THEN
      NEW.door_id := assigned;
    ELSIF NEW.door_id <> assigned THEN
      RAISE EXCEPTION 'not your door' USING ERRCODE = '42501',
        HINT = 'You''re assigned to another door. Ask an organizer to move you.';
    END IF;
  END IF;

  IF NEW.door_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.event_doors d
    WHERE d.id = NEW.door_id AND d.event_id = NEW.event_id
      AND d.retired_at IS NULL
  ) THEN
    RAISE EXCEPTION 'door not open' USING ERRCODE = '23514',
      HINT = 'That door was removed. Pick your door again.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER check_ins_door
  BEFORE INSERT ON "check_ins"
  FOR EACH ROW EXECUTE FUNCTION app.check_in_door();

REVOKE ALL ON FUNCTION app.event_doors_guard(), app.event_door_retired(),
  app.events_doors_switch(), app.door_assignments_guard(),
  app.event_members_door_role(), app.check_in_door() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Who may do what
--
-- The whole team reads the doors and who is held to which (a volunteer's
-- scanner needs both). Those who manage the event (owner, admin, organizer,
-- at the second step) turn doors on and off, name them, and assign them.
-- ---------------------------------------------------------------------------

-- Prisma names every column with a default on insert.
GRANT INSERT (doors_enabled), UPDATE (doors_enabled) ON "events" TO app_user;
GRANT INSERT (door_id) ON "check_ins" TO app_user;

ALTER TABLE "event_doors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "door_assignments" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, DELETE ON "event_doors" TO app_user;
-- Prisma names every column with a default on insert.
GRANT INSERT (id, event_id, name, position, retired_at, created_at)
  ON "event_doors" TO app_user;
GRANT UPDATE (name, position, retired_at) ON "event_doors" TO app_user;

GRANT SELECT, DELETE ON "door_assignments" TO app_user;
GRANT INSERT (member_id, event_id, door_id) ON "door_assignments" TO app_user;
GRANT UPDATE (door_id) ON "door_assignments" TO app_user;

CREATE POLICY event_doors_select ON "event_doors"
  FOR SELECT TO app_user
  USING (event_id = ANY ((SELECT app.team_events())::uuid[]));
CREATE POLICY event_doors_insert ON "event_doors"
  FOR INSERT TO app_user
  WITH CHECK (event_id = ANY ((SELECT app.managed_events())::uuid[]));
CREATE POLICY event_doors_update ON "event_doors"
  FOR UPDATE TO app_user
  USING (event_id = ANY ((SELECT app.managed_events())::uuid[]))
  WITH CHECK (event_id = ANY ((SELECT app.managed_events())::uuid[]));
CREATE POLICY event_doors_delete ON "event_doors"
  FOR DELETE TO app_user
  USING (event_id = ANY ((SELECT app.managed_events())::uuid[]));

CREATE POLICY door_assignments_select ON "door_assignments"
  FOR SELECT TO app_user
  USING (event_id = ANY ((SELECT app.team_events())::uuid[]));
CREATE POLICY door_assignments_insert ON "door_assignments"
  FOR INSERT TO app_user
  WITH CHECK (event_id = ANY ((SELECT app.managed_events())::uuid[]));
CREATE POLICY door_assignments_update ON "door_assignments"
  FOR UPDATE TO app_user
  USING (event_id = ANY ((SELECT app.managed_events())::uuid[]))
  WITH CHECK (event_id = ANY ((SELECT app.managed_events())::uuid[]));
CREATE POLICY door_assignments_delete ON "door_assignments"
  FOR DELETE TO app_user
  USING (event_id = ANY ((SELECT app.managed_events())::uuid[]));

-- Supabase's API roles get nothing, as with every other table.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.event_doors, public.door_assignments FROM %I', r);
    END IF;
  END LOOP;
END
$$;
