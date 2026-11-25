-- Creating an event was refused ("permission denied for table events", and
-- behind it "... for table ticket_types").
--
-- Prisma names every column that has a default when it inserts, so an insert
-- grant must cover those columns too, as it does created_at and updated_at.
-- Three columns were added with defaults after their tables' insert grants
-- were written, and were not added to them:
--   events.form_version        (20261123090000_form_fields)
--   events.ticket_key_version  (20261124150000_passes)
--   ticket_types.registered_count (20261121113744_registrations)
--
-- All three belong to the database: a form's version counts its saves, a key
-- version its retired passes, and registered_count decides when a ticket is
-- sold out. So the grant comes with a trigger that sets each on insert,
-- whatever the insert sent. None becomes updatable here.

CREATE FUNCTION app.start_event_versions() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  NEW.form_version := 1;
  NEW.ticket_key_version := 1;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.start_event_versions() FROM PUBLIC;

CREATE TRIGGER events_start_versions
  BEFORE INSERT ON "events"
  FOR EACH ROW EXECUTE FUNCTION app.start_event_versions();

CREATE FUNCTION app.start_registered_count() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  NEW.registered_count := 0;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.start_registered_count() FROM PUBLIC;

CREATE TRIGGER ticket_types_start_registered_count
  BEFORE INSERT ON "ticket_types"
  FOR EACH ROW EXECUTE FUNCTION app.start_registered_count();

GRANT INSERT (form_version, ticket_key_version) ON "events" TO app_user;
GRANT INSERT (registered_count) ON "ticket_types" TO app_user;
