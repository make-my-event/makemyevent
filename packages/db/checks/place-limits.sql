-- Place limits, one write at a time: who is refused, who may go past, and
-- what that leaves in the audit log. Rolled back. Concurrent writes are
-- checked by place-limits.concurrency.mjs.
BEGIN;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000011', 'host@test.local', 'Host'),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'guest@test.local', 'Guest');
-- 3 places in all; the small ticket 1 of them, the big one 3.
INSERT INTO events (id, host_user_id, slug, title, capacity) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000011',
   'limits-check', 'Limits', 3);
INSERT INTO ticket_types (id, event_id, name, capacity) VALUES
  ('cccccccc-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000011', 'Small', 1),
  ('cccccccc-0000-4000-8000-000000000012', 'bbbbbbbb-0000-4000-8000-000000000011', 'Big', 3);

-- The statement's error message, hint and code, or ok.
CREATE FUNCTION pg_temp.try(statement text) RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  message text;
  hint text;
  state text;
BEGIN
  EXECUTE statement;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message = MESSAGE_TEXT, hint = PG_EXCEPTION_HINT,
    state = RETURNED_SQLSTATE;
  RETURN state || ' ' || message || coalesce(' / ' || nullif(hint, ''), '');
END
$$;

CREATE FUNCTION pg_temp.expect(what text, got text, wanted text) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION '%: got %, wanted %', what, got, wanted;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.add(n int, ticket text, status text DEFAULT 'confirmed') RETURNS text
  LANGUAGE sql AS $$
  SELECT pg_temp.try(format(
    'INSERT INTO registrations (event_id, ticket_type_id, attendee_name, attendee_email, source, status)
     VALUES (''bbbbbbbb-0000-4000-8000-000000000011'', %L, ''G'', ''g%s@test.local'', ''invite'', %L)',
    ticket, n, status))
$$;

GRANT EXECUTE ON FUNCTION pg_temp.try(text), pg_temp.expect(text, text, text),
  pg_temp.add(int, text, text) TO app_user;

-- The host, at the second step, under the policies.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000011', true),
       set_config('app.aal', 'aal2', true);
SET LOCAL ROLE app_user;

-- The ticket's own limit, inside the event's.
SELECT pg_temp.expect('small, first', pg_temp.add(1, 'cccccccc-0000-4000-8000-000000000011'), 'ok');
SELECT pg_temp.expect('small, second', pg_temp.add(2, 'cccccccc-0000-4000-8000-000000000011'),
  '23514 ticket full / This ticket is full (1 of 1).');
-- Waitlisted takes no place.
SELECT pg_temp.expect('small, waitlisted', pg_temp.add(3, 'cccccccc-0000-4000-8000-000000000011', 'waitlisted'), 'ok');

-- The event's limit across tickets: 1 + 2 fills it; the big ticket still
-- has room of its own, but the event has none.
SELECT pg_temp.expect('big, first', pg_temp.add(4, 'cccccccc-0000-4000-8000-000000000012'), 'ok');
SELECT pg_temp.expect('big, second', pg_temp.add(5, 'cccccccc-0000-4000-8000-000000000012'), 'ok');
SELECT pg_temp.expect('big, past the event', pg_temp.add(6, 'cccccccc-0000-4000-8000-000000000012'),
  '23514 event full / The event is full (3 of 3).');

-- Admitting from the waiting list takes a place, and is held the same way.
SELECT pg_temp.expect('admit', pg_temp.try(
  'UPDATE registrations SET status = ''confirmed'' WHERE attendee_email = ''g3@test.local'''),
  '23514 event full / The event is full (3 of 3).');

-- A multi-row insert counts each row before the next.
SELECT pg_temp.expect('import past', pg_temp.try(
  'UPDATE registrations SET status = ''cancelled'' WHERE attendee_email = ''g5@test.local'''), 'ok');
SELECT pg_temp.expect('import two into one place', pg_temp.try(
  'INSERT INTO registrations (event_id, ticket_type_id, attendee_name, attendee_email, source)
   VALUES (''bbbbbbbb-0000-4000-8000-000000000011'', ''cccccccc-0000-4000-8000-000000000012'', ''G'', ''g7@test.local'', ''bulk''),
          (''bbbbbbbb-0000-4000-8000-000000000011'', ''cccccccc-0000-4000-8000-000000000012'', ''G'', ''g8@test.local'', ''bulk'')'),
  '23514 event full / The event is full (3 of 3).');

-- Moving a confirmed guest keeps the event's total: only the new ticket counts.
SELECT pg_temp.expect('move onto a full ticket', pg_temp.try(
  'UPDATE registrations SET ticket_type_id = ''cccccccc-0000-4000-8000-000000000011'' WHERE attendee_email = ''g4@test.local'''),
  '23514 ticket full / This ticket is full (1 of 1).');

-- The failed import added nothing: the place freed above is still there.
SELECT pg_temp.expect('fill it again', pg_temp.add(11, 'cccccccc-0000-4000-8000-000000000012'), 'ok');

-- The setting alone does nothing: naming another event, or set by hand
-- for someone who doesn't manage this one.
SELECT set_config('app.past_limits', 'bbbbbbbb-0000-4000-8000-000000000099', true);
SELECT pg_temp.expect('override for another event', pg_temp.add(9, 'cccccccc-0000-4000-8000-000000000012'),
  '23514 event full / The event is full (3 of 3).');
SELECT set_config('app.past_limits', '', true);

-- No audit entry yet: nothing went past.
SELECT pg_temp.expect('no entries', count(*)::text, '0')
  FROM audit_log WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000011' AND action = 'guest.past_limit';

-- The organizer chooses to go past: allowed, and recorded.
SELECT app.allow_past_limits('bbbbbbbb-0000-4000-8000-000000000011');
SELECT pg_temp.expect('override', pg_temp.add(10, 'cccccccc-0000-4000-8000-000000000011'), 'ok');
SELECT pg_temp.expect('one entry', count(*)::text, '1')
  FROM audit_log WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000011' AND action = 'guest.past_limit';
SELECT pg_temp.expect('entry says who and what',
  (SELECT format('%s %s %s/%s %s/%s %s',
     actor_id, details->>'ticket', details->>'event_held', details->>'event_limit',
     details->>'ticket_held', details->>'ticket_limit', details->>'past')
   FROM audit_log WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000011' AND action = 'guest.past_limit'),
  'aaaaaaaa-0000-4000-8000-000000000011 cccccccc-0000-4000-8000-000000000011 4/3 2/1 both');

-- A volunteer, or the organizer before the second step, can't ask.
SELECT set_config('app.aal', 'aal1', true);
SELECT pg_temp.expect('override at the first step',
  pg_temp.try('SELECT app.allow_past_limits(''bbbbbbbb-0000-4000-8000-000000000011'')'),
  '42501 not allowed past limits');
SELECT set_config('app.aal', 'aal2', true);

RESET ROLE;

-- A guest's own path, whatever it runs as (here the owner, past the
-- policies, as a SECURITY DEFINER registration function would), with the
-- setting forged: the guest doesn't manage the event, so it's refused.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000012', true),
       set_config('app.past_limits', 'bbbbbbbb-0000-4000-8000-000000000011', true);
SELECT pg_temp.expect('guest with a forged override',
  pg_temp.try(
    'INSERT INTO registrations (event_id, ticket_type_id, attendee_name, attendee_email, source)
     VALUES (''bbbbbbbb-0000-4000-8000-000000000011'', ''cccccccc-0000-4000-8000-000000000012'', ''G'', ''guest@test.local'', ''self'')'),
  '23514 event full / The event is full (3 of 3).');

ROLLBACK;
