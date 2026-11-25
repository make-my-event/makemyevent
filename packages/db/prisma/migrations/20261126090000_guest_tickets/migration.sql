-- A guest's own tickets: an invited email becomes that person's ticket when
-- they sign in with it, and they see it under Attending.

-- CreateIndex
CREATE INDEX "registrations_attendee_email_idx" ON "registrations"("attendee_email");

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

-- Every ticket held in the email on this person's own users row (written
-- once, from the session the server verified) that has no one yet becomes
-- theirs. Like app.claim_invites(): it answers only for
-- app.current_user_id(), and user_id is in no grant, so this is the only way
-- a ticket the team added gets a person.
CREATE FUNCTION app.claim_tickets() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  claimed integer;
BEGIN
  UPDATE public.registrations r
    SET user_id = u.id
    FROM public.users u
    WHERE u.id = app.current_user_id()
      AND r.attendee_email = u.email
      AND r.user_id IS NULL;
  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END
$$;

-- A ticket moved to another email leaves the person who had it: otherwise
-- they would keep a pass that is now someone else's. The new email's owner
-- claims it on their next visit.
CREATE FUNCTION app.release_ticket() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NEW.attendee_email <> OLD.attendee_email THEN
    NEW.user_id := NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER registrations_release_ticket
  BEFORE UPDATE OF attendee_email ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.release_ticket();

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- The tickets this person holds, with what a ticket says of its event. A
-- guest may be invited before the event is published, and must not be able
-- to read the rest of that draft, so this hands over these columns and the
-- events policy stays as it is. The join link only with a place, as the
-- Event Page promises its host.
CREATE FUNCTION app.my_tickets(only_id uuid DEFAULT NULL)
  RETURNS TABLE (
    id uuid,
    event_id uuid,
    event_title text,
    event_status text,
    starts_at timestamptz,
    ends_at timestamptz,
    time_zone text,
    format text,
    venue_name text,
    venue_address text,
    online_url text,
    poster_path text,
    ticket_key_version integer,
    ticket_name text,
    ticket_code text,
    attendee_name text,
    status text
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT r.id, e.id, e.title, e.status, e.starts_at, e.ends_at, e.time_zone,
      e.format, e.venue_name, e.venue_address,
      CASE WHEN r.status = 'confirmed' AND e.status <> 'cancelled'
        THEN e.online_url END,
      e.poster_path, e.ticket_key_version,
      t.name, r.ticket_code, r.attendee_name, r.status
    FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    JOIN public.ticket_types t ON t.id = r.ticket_type_id
    WHERE r.user_id = app.current_user_id()
      AND (only_id IS NULL OR r.id = only_id)
    ORDER BY e.starts_at DESC NULLS FIRST, r.created_at DESC, r.id
    LIMIT 500
  $$;

REVOKE ALL ON FUNCTION app.claim_tickets(), app.release_ticket(),
  app.my_tickets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_tickets(), app.my_tickets(uuid) TO app_user;
