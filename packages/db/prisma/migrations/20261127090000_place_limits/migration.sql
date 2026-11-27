-- Place limits, held by the database for every way a place is taken.
--
--   The event's limit is the hard total across all its tickets; a ticket's
--   own limit is a smaller one inside it (ticket limits may add up to more
--   than the event's). A confirmed registration takes a place; a waitlisted
--   or cancelled one doesn't.
--
--   A registration that would pass either limit is refused, SQLSTATE 23514,
--   'event full' or 'ticket full', unless an organizer has explicitly chosen
--   to go past it (Guests: "add anyway?"). Each such registration is written
--   to the audit log, by the database, in the same transaction.
--
-- No schema change: the checks read events.capacity, ticket_types.capacity
-- and ticket_types.registered_count, which app.count_registration() keeps.

-- ---------------------------------------------------------------------------
-- One lock per event
--
-- Every confirmation at an event first locks that event's row, so they run
-- one at a time per event, and each sees the counts the one before it left.
-- Two events never wait for each other.
--
-- The lock is taken BEFORE the row is written, and so before
-- app.count_registration() locks the ticket's row: always event, then
-- ticket, in that order, so two confirmations can't deadlock (an import
-- adding to several tickets included).
--
-- FOR NO KEY UPDATE, the row-lock form of FOR UPDATE that leaves the key
-- alone: it conflicts with itself and with FOR UPDATE, which is all the
-- queueing needs, but not with the FOR KEY SHARE that a foreign-key check
-- takes. Rows elsewhere that only point at the event (answers, check-ins,
-- audit entries) are not held up by a confirmation in progress.
--
-- The comparison waits for the AFTER trigger below, once the row is counted:
-- a multi-row insert counts each row before the next is checked, which a
-- BEFORE trigger would not see.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.lock_event_for_place() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM 'confirmed'
    OR OLD.ticket_type_id IS DISTINCT FROM NEW.ticket_type_id
  ) THEN
    PERFORM 1 FROM public.events e WHERE e.id = NEW.event_id
      FOR NO KEY UPDATE;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER registrations_places_lock
  BEFORE INSERT OR UPDATE OF status, ticket_type_id ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.lock_event_for_place();

-- ---------------------------------------------------------------------------
-- The organizer's override
--
-- A transaction-local setting, app.past_limits, naming the one event the
-- organizer chose to go past. Only app.allow_past_limits() is meant to set
-- it, and it refuses anyone who doesn't manage that event.
--
-- app_user can call set_config() itself, so the setting alone proves
-- nothing. What can't be forged is the second half, checked at the moment
-- of the write: the person the transaction runs as (app.user_id, set by the
-- server from a verified session) must manage that event, owner, admin or
-- organizer at the second step (app.manages_event). Guests registering
-- themselves run as themselves or as a visitor, never as the event's team,
-- so no guest path can pass a limit, whatever it sets. And the setting
-- names the event, so it can't carry over to another.
--
-- Transaction-local (set_config(..., true)): it ends with the transaction,
-- and a pooled connection carries nothing to the next request.
--
-- A SECURITY DEFINER function setting it instead would be no stronger:
-- set_config() is open to every role. A column on registrations would be
-- stored forever on rows where it means nothing. The setting plus the
-- check at write time keeps the rule in one place, the trigger.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.allow_past_limits(target uuid) RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT app.manages_event(target) THEN
    RAISE EXCEPTION 'not allowed past limits' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.past_limits', target::text, true);
END
$$;

REVOKE ALL ON FUNCTION app.allow_past_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.allow_past_limits(uuid) TO app_user;

-- ---------------------------------------------------------------------------
-- The check
--
-- AFTER the row, with the event locked and this registration already
-- counted (registrations_count, which fires first: AFTER triggers on a
-- table run in name order, and "count" sorts before "places").
--
-- Moving a confirmed guest to another ticket leaves the event's total as it
-- was, so only the new ticket is checked.
--
-- SECURITY DEFINER: it reads every ticket of the event, and writes the audit
-- entry, whoever the registration is for.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.check_place_limits() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  moving boolean := false;
  event_limit bigint;
  event_held bigint;
  ticket_limit bigint;
  ticket_held bigint;
  event_over boolean;
  ticket_over boolean;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    IF OLD.ticket_type_id = NEW.ticket_type_id THEN
      RETURN NULL;
    END IF;
    moving := true;
  END IF;

  SELECT t.capacity, t.registered_count INTO ticket_limit, ticket_held
    FROM public.ticket_types t WHERE t.id = NEW.ticket_type_id;
  SELECT e.capacity INTO event_limit FROM public.events e WHERE e.id = NEW.event_id;
  SELECT coalesce(sum(t.registered_count), 0) INTO event_held
    FROM public.ticket_types t WHERE t.event_id = NEW.event_id;

  ticket_over := ticket_limit IS NOT NULL AND ticket_held > ticket_limit;
  event_over := NOT moving AND event_limit IS NOT NULL AND event_held > event_limit;
  IF NOT (ticket_over OR event_over) THEN
    RETURN NULL;
  END IF;

  IF current_setting('app.past_limits', true) IS DISTINCT FROM NEW.event_id::text
     OR NOT app.manages_event(NEW.event_id) THEN
    IF event_over THEN
      RAISE EXCEPTION 'event full' USING ERRCODE = '23514',
        HINT = format('The event is full (%s of %s).', event_limit, event_limit);
    END IF;
    RAISE EXCEPTION 'ticket full' USING ERRCODE = '23514',
      HINT = format('This ticket is full (%s of %s).', ticket_limit, ticket_limit);
  END IF;

  -- Who and when are stamped by app.stamp_audit(); the counts include this
  -- registration.
  INSERT INTO public.audit_log (event_id, action, target_id, details)
  VALUES (NEW.event_id, 'guest.past_limit', NEW.id::text, jsonb_build_object(
    'ticket', NEW.ticket_type_id,
    'event_held', event_held,
    'event_limit', event_limit,
    'ticket_held', ticket_held,
    'ticket_limit', ticket_limit,
    'past', CASE
      WHEN event_over AND ticket_over THEN 'both'
      WHEN event_over THEN 'event'
      ELSE 'ticket'
    END));
  RETURN NULL;
END
$$;

CREATE TRIGGER registrations_places_check
  AFTER INSERT OR UPDATE OF status, ticket_type_id ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION app.check_place_limits();

REVOKE ALL ON FUNCTION app.lock_event_for_place(), app.check_place_limits()
  FROM PUBLIC;
