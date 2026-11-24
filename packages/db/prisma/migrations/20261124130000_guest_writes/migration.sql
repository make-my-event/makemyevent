-- The team adds guests (Invite guest), corrects them (Edit submission) and
-- cancels or restores them. Registering on the event page will arrive
-- through its own path; this grants only what the team does.

GRANT INSERT (
  event_id, ticket_type_id, attendee_name, attendee_email, status,
  ticket_code, source, created_at, updated_at
) ON "registrations" TO app_user;
GRANT UPDATE (attendee_name, attendee_email, status, ticket_type_id)
  ON "registrations" TO app_user;

-- Only invites and imports through these grants, by those who manage the
-- event. A guest is never deleted, only cancelled: they may hold a pass.
CREATE POLICY registrations_insert ON "registrations"
  FOR INSERT TO app_user
  WITH CHECK (app.manages_event(event_id) AND source IN ('invite', 'bulk'));

CREATE POLICY registrations_update ON "registrations"
  FOR UPDATE TO app_user
  USING (app.manages_event(event_id))
  WITH CHECK (app.manages_event(event_id));

-- Who invited them comes from the session, never from what was sent.
CREATE FUNCTION app.stamp_inviter() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.source IN ('invite', 'bulk') THEN
    NEW.invited_by_id := app.current_user_id();
  ELSE
    NEW.invited_by_id := NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER registrations_stamp_inviter
  BEFORE INSERT ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_inviter();

-- A blocked email can't hold a place, however it gets in: added, edited to
-- it, or restored. Runs as the owner, since not everyone who may register
-- someone may read the blocklist. Phone numbers are answers, checked by
-- the writer against the same list.
CREATE FUNCTION app.refuse_blocked_email() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.status <> 'cancelled' AND EXISTS (
    SELECT 1 FROM public.blocked_contacts b
    WHERE b.event_id = NEW.event_id AND b.kind = 'email'
      AND b.value = NEW.attendee_email
  ) THEN
    RAISE EXCEPTION 'blocked contact' USING ERRCODE = 'P0001',
      HINT = 'This email is on the event''s blocklist.';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.refuse_blocked_email() FROM PUBLIC;

CREATE TRIGGER registrations_refuse_blocked
  BEFORE INSERT OR UPDATE OF attendee_email, status ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.refuse_blocked_email();
