-- Two faults that only a bigger guest list shows.

-- ---------------------------------------------------------------------------
-- 1. Created times to the millisecond
--
-- Guests are paged by (created_at, id), and the last row's created_at goes to
-- the app and back. JavaScript keeps milliseconds and the database kept
-- microseconds, so the time came back slightly earlier than it left, and
-- every guest sharing it (an import gives all of them one time) was skipped:
-- an export of 2,003 guests held 1,003.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.stamp_insert() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.created_at := date_trunc('milliseconds', now());
  IF TG_ARGV[0] = 'with_updated_at' THEN
    NEW.updated_at := NEW.created_at;
  END IF;
  RETURN NEW;
END
$$;

UPDATE "registrations"
  SET created_at = date_trunc('milliseconds', created_at)
  WHERE created_at <> date_trunc('milliseconds', created_at);

-- ---------------------------------------------------------------------------
-- 2. Row-level security, asked once per query
--
-- The policies on guests, their answers and their check-ins called
-- app.on_team(event_id) or app.manages_event(event_id) for every row read:
-- 0.2 ms each, so 3.6 s to count 20,000 guests. The same people see the same
-- rows here, but the events they work on are looked up once, as a sub-select
-- the planner runs before the scan, and each row is compared with the list.
--
-- These say exactly what the per-row functions say:
--   app.team_events()    = the events app.on_team() is true for
--   app.managed_events() = the events app.manages_event() is true for
-- No one signed in gives an empty list, which matches no row.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.team_events() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(array_agg(id), '{}') FROM (
      SELECT e.id FROM public.events e
        WHERE e.host_user_id = app.current_user_id()
      UNION
      SELECT m.event_id FROM public.event_members m
        WHERE m.user_id = app.current_user_id()
    ) mine
  $$;

CREATE FUNCTION app.managed_events() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(array_agg(id), '{}') FROM (
      SELECT e.id FROM public.events e
        WHERE e.host_user_id = app.current_user_id()
      UNION
      SELECT m.event_id FROM public.event_members m
        WHERE m.user_id = app.current_user_id()
          AND m.role IN ('admin', 'organizer')
    ) mine
  $$;

REVOKE ALL ON FUNCTION app.team_events(), app.managed_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.team_events(), app.managed_events() TO app_user;

ALTER POLICY registrations_select ON "registrations"
  USING (
    event_id = ANY ((SELECT app.team_events())::uuid[])
    OR (user_id IS NOT NULL AND user_id = (SELECT app.current_user_id()))
  );
ALTER POLICY registrations_insert ON "registrations"
  WITH CHECK (
    event_id = ANY ((SELECT app.managed_events())::uuid[])
    AND source IN ('invite', 'bulk')
  );
ALTER POLICY registrations_update ON "registrations"
  USING (event_id = ANY ((SELECT app.managed_events())::uuid[]))
  WITH CHECK (event_id = ANY ((SELECT app.managed_events())::uuid[]));

ALTER POLICY registration_answers_select ON "registration_answers"
  USING (event_id = ANY ((SELECT app.team_events())::uuid[]));
ALTER POLICY registration_answers_write ON "registration_answers"
  USING (event_id = ANY ((SELECT app.managed_events())::uuid[]))
  WITH CHECK (event_id = ANY ((SELECT app.managed_events())::uuid[]));

ALTER POLICY check_ins_select ON "check_ins"
  USING (event_id = ANY ((SELECT app.team_events())::uuid[]));
ALTER POLICY check_ins_delete ON "check_ins"
  USING (event_id = ANY ((SELECT app.team_events())::uuid[]));
ALTER POLICY check_ins_insert ON "check_ins"
  WITH CHECK (
    event_id = ANY ((SELECT app.team_events())::uuid[])
    AND EXISTS (
      SELECT 1 FROM "registrations" r
      WHERE r.id = check_ins.registration_id
        AND r.event_id = check_ins.event_id
        AND r.status = 'confirmed'
    )
  );
