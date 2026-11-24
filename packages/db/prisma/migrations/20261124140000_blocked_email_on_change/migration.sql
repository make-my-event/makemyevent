-- The blocklist guards a place being taken, not one already held: a guest
-- registered before their email was blocked can still be corrected (Edit
-- submission writes their email back unchanged). It refuses a new guest,
-- an email changed to a blocked one, and restoring a cancelled guest whose
-- email is blocked.
CREATE OR REPLACE FUNCTION app.refuse_blocked_email() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.attendee_email = OLD.attendee_email
     AND OLD.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
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
