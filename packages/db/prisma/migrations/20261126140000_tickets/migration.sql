-- The Tickets section: what each ticket says and allows, and the rules the
-- database holds every write to, whoever makes it.

-- AlterTable
ALTER TABLE "ticket_types"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "multi_day" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "transferable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_description_length"
    CHECK (length(description) <= 500),
  -- Every ticket is free until payments exist: nothing can be priced, and so
  -- nothing can be sold for money by mistake. Payments drop this.
  ADD CONSTRAINT "ticket_types_free_until_payments"
    CHECK (price_minor = 0);

-- Prisma names every column with a default on insert.
GRANT INSERT (description, multi_day, transferable) ON "ticket_types" TO app_user;
GRANT UPDATE (description, multi_day, transferable) ON "ticket_types" TO app_user;

-- ---------------------------------------------------------------------------
-- A ticket's places fit inside the event's
--
-- A ticket may have its own limit, or share the event's. Its own can't be
-- more than the whole event holds; nor can the event be cut below a ticket.
-- Both are checked on write, so neither side can get around the other.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.ticket_fits_event() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  limit_ bigint;
BEGIN
  IF NEW.capacity IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.capacity INTO limit_ FROM public.events e WHERE e.id = NEW.event_id;
  IF limit_ IS NOT NULL AND NEW.capacity > limit_ THEN
    RAISE EXCEPTION 'ticket over event capacity' USING ERRCODE = '23514',
      HINT = format('A ticket can''t have more places than the whole event (%s).', limit_);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER ticket_types_fit_event
  BEFORE INSERT OR UPDATE OF capacity ON "ticket_types"
  FOR EACH ROW EXECUTE FUNCTION app.ticket_fits_event();

CREATE FUNCTION app.event_holds_tickets() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  largest bigint;
BEGIN
  IF NEW.capacity IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT max(t.capacity) INTO largest FROM public.ticket_types t
    WHERE t.event_id = NEW.id;
  IF largest IS NOT NULL AND largest > NEW.capacity THEN
    RAISE EXCEPTION 'event under ticket capacity' USING ERRCODE = '23514',
      HINT = format('A ticket has %s places. Lower it on Tickets first, or keep the event at %s or more.', largest, largest);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER events_hold_tickets
  BEFORE UPDATE OF capacity ON "events"
  FOR EACH ROW EXECUTE FUNCTION app.event_holds_tickets();

-- ---------------------------------------------------------------------------
-- The days an event runs
--
-- An event over more than one calendar day (in its own time zone) has a row
-- per day, kept from its dates here: tickets name the days they admit, and
-- check-in is once per day. A one-day event has none, and checks in once.
-- Dates that would drop a day someone has already checked in on are refused.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.sync_event_days() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  first_day date;
  last_day date;
BEGIN
  IF NEW.starts_at IS NOT NULL AND NEW.ends_at IS NOT NULL
     AND NEW.time_zone IS NOT NULL THEN
    first_day := (NEW.starts_at AT TIME ZONE NEW.time_zone)::date;
    -- Ending at midnight ends the day before.
    last_day := ((NEW.ends_at - interval '1 microsecond') AT TIME ZONE NEW.time_zone)::date;
    -- One day, or more than a year: no days of its own.
    IF last_day <= first_day OR last_day - first_day > 366 THEN
      first_day := NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.check_ins c
    JOIN public.event_days d ON d.id = c.event_day_id
    WHERE d.event_id = NEW.id
      AND (first_day IS NULL OR d.day NOT BETWEEN first_day AND last_day)
  ) THEN
    RAISE EXCEPTION 'checked in on a dropped day' USING ERRCODE = 'P0001',
      HINT = 'Guests have checked in on a day these dates leave out. Keep that day in the dates.';
  END IF;

  DELETE FROM public.event_days d
    WHERE d.event_id = NEW.id
      AND (first_day IS NULL OR d.day NOT BETWEEN first_day AND last_day);
  IF first_day IS NOT NULL THEN
    INSERT INTO public.event_days (event_id, day)
      SELECT NEW.id, g::date
      FROM generate_series(first_day, last_day, interval '1 day') g
    ON CONFLICT (event_id, day) DO NOTHING;
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER events_sync_days
  AFTER INSERT OR UPDATE OF starts_at, ends_at, time_zone ON "events"
  FOR EACH ROW EXECUTE FUNCTION app.sync_event_days();

-- Events dated before this get their days now, by the same rule.
INSERT INTO "event_days" (event_id, day)
  SELECT e.id, g::date
  FROM "events" e,
    LATERAL (SELECT (e.starts_at AT TIME ZONE e.time_zone)::date AS f,
      ((e.ends_at - interval '1 microsecond') AT TIME ZONE e.time_zone)::date AS l) d,
    LATERAL generate_series(d.f, d.l, interval '1 day') g
  WHERE e.starts_at IS NOT NULL AND e.ends_at IS NOT NULL
    AND e.time_zone IS NOT NULL AND d.l > d.f AND d.l - d.f <= 366
ON CONFLICT (event_id, day) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Check-in follows the ticket
--
--   multi-day   in once on each day it admits: the days chosen for it, or
--               every day when none are
--   one entry   in once, on any one day
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.check_in_fits_ticket() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  ticket record;
BEGIN
  IF NEW.event_day_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT t.id, t.multi_day INTO ticket
    FROM public.registrations r
    JOIN public.ticket_types t ON t.id = r.ticket_type_id
    WHERE r.id = NEW.registration_id AND r.event_id = NEW.event_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NOT ticket.multi_day THEN
    IF EXISTS (
      SELECT 1 FROM public.check_ins c
      WHERE c.registration_id = NEW.registration_id
    ) THEN
      RAISE EXCEPTION 'one entry used' USING ERRCODE = 'P0001',
        HINT = 'Their ticket lets them in once, and they were checked in on another day.';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.ticket_type_days td WHERE td.ticket_type_id = ticket.id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.ticket_type_days td
    WHERE td.ticket_type_id = ticket.id AND td.event_day_id = NEW.event_day_id
  ) THEN
    RAISE EXCEPTION 'not this day' USING ERRCODE = 'P0001',
      HINT = 'Their ticket doesn''t admit them today.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER check_ins_fit_ticket
  BEFORE INSERT ON "check_ins"
  FOR EACH ROW EXECUTE FUNCTION app.check_in_fits_ticket();

REVOKE ALL ON FUNCTION app.ticket_fits_event(), app.event_holds_tickets(),
  app.sync_event_days(), app.check_in_fits_ticket() FROM PUBLIC;
