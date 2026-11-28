-- The rules every ticket is held to, whoever writes it. Rolled back.
BEGIN;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'host@test.local', 'Host');
-- Three days in Kolkata, ending at midnight: the 10th, 11th and 12th.
INSERT INTO events (id, host_user_id, slug, title, time_zone, starts_at, ends_at, capacity) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'tickets-check', 'Tickets', 'Asia/Kolkata',
   '2026-12-10 09:00+05:30', '2026-12-13 00:00+05:30', 100);
INSERT INTO ticket_types (id, event_id, name, multi_day) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Every day', true),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'One entry', false),
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'Day two', true);
INSERT INTO ticket_type_days (ticket_type_id, event_day_id, event_id)
  SELECT 'cccccccc-0000-4000-8000-000000000003', id, event_id FROM event_days
  WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000001' AND day = '2026-12-11';
INSERT INTO registrations (id, event_id, ticket_type_id, attendee_name, attendee_email, source) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'A', 'a@test.local', 'invite'),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'B', 'b@test.local', 'invite'),
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 'C', 'c@test.local', 'invite');

-- The statement's error hint (or its code), or ok.
CREATE FUNCTION pg_temp.try(statement text) RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  hint text;
  state text;
BEGIN
  EXECUTE statement;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, state = RETURNED_SQLSTATE;
  RETURN coalesce(nullif(hint, ''), state);
END
$$;

CREATE FUNCTION pg_temp.expect(what text, got text, wanted text) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM wanted AND NOT (wanted LIKE '%...' AND got LIKE replace(wanted, '...', '%')) THEN
    RAISE EXCEPTION '%: got %, wanted %', what, got, wanted;
  END IF;
END
$$;

CREATE FUNCTION pg_temp.day(d date) RETURNS bigint LANGUAGE sql AS
  $$ SELECT id FROM event_days WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000001' AND day = d $$;

-- The host, at the second step, under the policies.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000001', true),
       set_config('app.aal', 'aal2', true);
SET LOCAL ROLE app_user;

-- Days from the dates.
SELECT pg_temp.expect('three days', string_agg(day::text, ',' ORDER BY day), '2026-12-10,2026-12-11,2026-12-12')
  FROM event_days WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000001';

-- Free until payments; places inside the event's.
SELECT pg_temp.expect('a price', pg_temp.try('UPDATE ticket_types SET price_minor = 100 WHERE id = ''cccccccc-0000-4000-8000-000000000001'''), '23514');
SELECT pg_temp.expect('more than the event', pg_temp.try('UPDATE ticket_types SET capacity = 101 WHERE id = ''cccccccc-0000-4000-8000-000000000001'''), 'A ticket can''t have more places than the whole event (100).');
SELECT pg_temp.expect('as many as the event', pg_temp.try('UPDATE ticket_types SET capacity = 100 WHERE id = ''cccccccc-0000-4000-8000-000000000001'''), 'ok');
SELECT pg_temp.expect('event below a ticket', pg_temp.try('UPDATE events SET capacity = 50 WHERE id = ''bbbbbbbb-0000-4000-8000-000000000001'''), 'A ticket has 100 places...');
SELECT pg_temp.expect('new ticket over', pg_temp.try('INSERT INTO ticket_types (event_id, name, capacity) VALUES (''bbbbbbbb-0000-4000-8000-000000000001'', ''X'', 500)'), 'A ticket can''t have more places than the whole event (100).');
SELECT pg_temp.expect('settings', pg_temp.try('UPDATE ticket_types SET description = ''Lunch included'', transferable = true, multi_day = true, max_per_person = 4, waitlist_enabled = true, invite_only = true WHERE id = ''cccccccc-0000-4000-8000-000000000001'''), 'ok');
SELECT pg_temp.expect('a long description', pg_temp.try(format('UPDATE ticket_types SET description = %L WHERE id = ''cccccccc-0000-4000-8000-000000000001''', repeat('x', 501))), '23514');

-- Check-in follows the ticket.
SELECT pg_temp.expect('every day, day 1', pg_temp.try(format('INSERT INTO check_ins (registration_id, event_id, event_day_id) VALUES (''dddddddd-0000-4000-8000-000000000001'', ''bbbbbbbb-0000-4000-8000-000000000001'', %s)', pg_temp.day('2026-12-10'))), 'ok');
SELECT pg_temp.expect('every day, day 2', pg_temp.try(format('INSERT INTO check_ins (registration_id, event_id, event_day_id) VALUES (''dddddddd-0000-4000-8000-000000000001'', ''bbbbbbbb-0000-4000-8000-000000000001'', %s)', pg_temp.day('2026-12-11'))), 'ok');
SELECT pg_temp.expect('one entry, first', pg_temp.try(format('INSERT INTO check_ins (registration_id, event_id, event_day_id) VALUES (''dddddddd-0000-4000-8000-000000000002'', ''bbbbbbbb-0000-4000-8000-000000000001'', %s)', pg_temp.day('2026-12-10'))), 'ok');
SELECT pg_temp.expect('one entry, again', pg_temp.try(format('INSERT INTO check_ins (registration_id, event_id, event_day_id) VALUES (''dddddddd-0000-4000-8000-000000000002'', ''bbbbbbbb-0000-4000-8000-000000000001'', %s)', pg_temp.day('2026-12-11'))), 'Their ticket lets them in once, and they were checked in on another day.');
SELECT pg_temp.expect('day two only, on day 1', pg_temp.try(format('INSERT INTO check_ins (registration_id, event_id, event_day_id) VALUES (''dddddddd-0000-4000-8000-000000000003'', ''bbbbbbbb-0000-4000-8000-000000000001'', %s)', pg_temp.day('2026-12-10'))), 'Their ticket doesn''t admit them today.');
SELECT pg_temp.expect('day two only, on day 2', pg_temp.try(format('INSERT INTO check_ins (registration_id, event_id, event_day_id) VALUES (''dddddddd-0000-4000-8000-000000000003'', ''bbbbbbbb-0000-4000-8000-000000000001'', %s)', pg_temp.day('2026-12-11'))), 'ok');

-- Dates can't drop a day someone came in on; can drop one no one did.
SELECT pg_temp.expect('drop a used day', pg_temp.try('UPDATE events SET ends_at = ''2026-12-11 00:00+05:30'' WHERE id = ''bbbbbbbb-0000-4000-8000-000000000001'''), 'Guests have checked in on a day these dates leave out. Keep that day in the dates.');
SELECT pg_temp.expect('drop an unused day', pg_temp.try('UPDATE events SET ends_at = ''2026-12-12 00:00+05:30'' WHERE id = ''bbbbbbbb-0000-4000-8000-000000000001'''), 'ok');
SELECT pg_temp.expect('two days now', count(*)::text, '2')
  FROM event_days WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000001';

RESET ROLE;
-- A one-day event has no days of its own, and checks in once without one.
INSERT INTO events (id, host_user_id, slug, title, time_zone, starts_at, ends_at) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
   'tickets-one-day', 'One day', 'Asia/Kolkata', '2026-12-10 09:00+05:30', '2026-12-10 18:00+05:30');
SELECT pg_temp.expect('one day, no rows', count(*)::text, '0')
  FROM event_days WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000002';

ROLLBACK;
