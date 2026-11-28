-- Doors: the switch, the names, who may change them, assignments, and the
-- door each check-in records. Rolled back.
BEGIN;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000401', 'host@doors.local', 'Host'),
  ('aaaaaaaa-0000-4000-8000-000000000402', 'vol@doors.local', 'Vol'),
  ('aaaaaaaa-0000-4000-8000-000000000403', 'org@doors.local', 'Org'),
  ('aaaaaaaa-0000-4000-8000-000000000404', 'stranger@doors.local', 'Stranger');
INSERT INTO events (id, host_user_id, slug, title) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000401', 'aaaaaaaa-0000-4000-8000-000000000401', 'doors-check', 'Doors');
INSERT INTO event_members (id, event_id, user_id, role, display_name, email, joined_at) VALUES
  ('eeeeeeee-0000-4000-8000-000000000402', 'bbbbbbbb-0000-4000-8000-000000000401', 'aaaaaaaa-0000-4000-8000-000000000402', 'volunteer', 'Vol', 'vol@doors.local', now()),
  ('eeeeeeee-0000-4000-8000-000000000403', 'bbbbbbbb-0000-4000-8000-000000000401', 'aaaaaaaa-0000-4000-8000-000000000403', 'organizer', 'Org', 'org@doors.local', now());
INSERT INTO ticket_types (id, event_id, name) VALUES
  ('cccccccc-0000-4000-8000-000000000401', 'bbbbbbbb-0000-4000-8000-000000000401', 'General');
INSERT INTO registrations (id, event_id, ticket_type_id, attendee_name, attendee_email, source)
  SELECT ('dddddddd-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid,
         'bbbbbbbb-0000-4000-8000-000000000401', 'cccccccc-0000-4000-8000-000000000401',
         'Guest ' || n, 'g' || n || '@doors.local', 'invite'
  FROM generate_series(1, 9) n;

CREATE FUNCTION pg_temp.try(statement text) RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  state text;
BEGIN
  EXECUTE statement;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE;
  RETURN state;
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

CREATE FUNCTION pg_temp.as_person(who text, aal text) RETURNS void
  LANGUAGE sql AS $$
    SELECT set_config('app.user_id', who, true), set_config('app.aal', aal, true);
  $$;

CREATE FUNCTION pg_temp.check_in(guest int, door text) RETURNS text
  LANGUAGE sql AS $$
    SELECT pg_temp.try(format(
      'INSERT INTO check_ins (registration_id, event_id, method, door_id) VALUES (%L, ''bbbbbbbb-0000-4000-8000-000000000401'', ''scan'', %s)',
      'dddddddd-0000-4000-8000-0000000004' || lpad(guest::text, 2, '0'),
      coalesce(quote_literal(door) || '::uuid', 'NULL')))
  $$;

CREATE FUNCTION pg_temp.door_of(guest int) RETURNS text
  LANGUAGE sql AS $$
    SELECT coalesce(d.name, '-') FROM check_ins c LEFT JOIN event_doors d ON d.id = c.door_id
    WHERE c.registration_id = ('dddddddd-0000-4000-8000-0000000004' || lpad(guest::text, 2, '0'))::uuid
  $$;

SET LOCAL ROLE app_user;

-- ---- The host names the doors and turns them on -------------------------

SELECT pg_temp.as_person('aaaaaaaa-0000-4000-8000-000000000401', 'aal2');
SELECT pg_temp.expect('a door', pg_temp.try('INSERT INTO event_doors (id, event_id, name) VALUES (''f0000000-0000-4000-8000-000000000001'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''Main gate'')'), 'ok');
SELECT pg_temp.expect('on with one door', pg_temp.try('UPDATE events SET doors_enabled = true WHERE id = ''bbbbbbbb-0000-4000-8000-000000000401'''), '23514');
SELECT pg_temp.expect('a second door', pg_temp.try('INSERT INTO event_doors (id, event_id, name, position) VALUES (''f0000000-0000-4000-8000-000000000002'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''VIP desk'', 1)'), 'ok');
SELECT pg_temp.expect('same name, other case', pg_temp.try('INSERT INTO event_doors (event_id, name) VALUES (''bbbbbbbb-0000-4000-8000-000000000401'', ''main GATE'')'), '23505');
SELECT pg_temp.expect('a padded name', pg_temp.try('INSERT INTO event_doors (event_id, name) VALUES (''bbbbbbbb-0000-4000-8000-000000000401'', '' Side'')'), '23514');
SELECT pg_temp.expect('a third door', pg_temp.try('INSERT INTO event_doors (id, event_id, name, position) VALUES (''f0000000-0000-4000-8000-000000000003'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''Side door'', 2)'), 'ok');
SELECT pg_temp.expect('on with three', pg_temp.try('UPDATE events SET doors_enabled = true WHERE id = ''bbbbbbbb-0000-4000-8000-000000000401'''), 'ok');

-- ---- Assignments: volunteers only, open doors only --------------------------

SELECT pg_temp.expect('assign the volunteer', pg_temp.try('INSERT INTO door_assignments (member_id, event_id, door_id) VALUES (''eeeeeeee-0000-4000-8000-000000000402'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''f0000000-0000-4000-8000-000000000002'')'), 'ok');
SELECT pg_temp.expect('assign the organizer', pg_temp.try('INSERT INTO door_assignments (member_id, event_id, door_id) VALUES (''eeeeeeee-0000-4000-8000-000000000403'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''f0000000-0000-4000-8000-000000000001'')'), '23514');

-- ---- The volunteer at the door ------------------------------------------------

SELECT pg_temp.as_person('aaaaaaaa-0000-4000-8000-000000000402', 'aal1');
SELECT pg_temp.expect('volunteer sees doors', (SELECT count(*)::text FROM event_doors), '3');
SELECT pg_temp.expect('volunteer names a door', pg_temp.try('INSERT INTO event_doors (event_id, name) VALUES (''bbbbbbbb-0000-4000-8000-000000000401'', ''Back'')'), '42501');
SELECT pg_temp.expect('volunteer moves themselves', pg_temp.try('UPDATE door_assignments SET door_id = ''f0000000-0000-4000-8000-000000000001'''), 'ok');
SELECT pg_temp.expect('but nothing moved', (SELECT door_id::text FROM door_assignments), 'f0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect('no door sent: theirs', pg_temp.check_in(1, NULL), 'ok');
SELECT pg_temp.expect('recorded as theirs', pg_temp.door_of(1), 'VIP desk');
SELECT pg_temp.expect('their own door', pg_temp.check_in(2, 'f0000000-0000-4000-8000-000000000002'), 'ok');
SELECT pg_temp.expect('another door', pg_temp.check_in(3, 'f0000000-0000-4000-8000-000000000001'), '42501');

-- ---- The organizer walks about and picks ----------------------------------

SELECT pg_temp.as_person('aaaaaaaa-0000-4000-8000-000000000403', 'aal2');
SELECT pg_temp.expect('any open door', pg_temp.check_in(3, 'f0000000-0000-4000-8000-000000000001'), 'ok');
SELECT pg_temp.expect('recorded as picked', pg_temp.door_of(3), 'Main gate');
SELECT pg_temp.expect('no door known', pg_temp.check_in(4, NULL), 'ok');
SELECT pg_temp.expect('recorded with none', pg_temp.door_of(4), '-');
SELECT pg_temp.expect('a made-up door', pg_temp.check_in(5, 'f0000000-0000-4000-8000-0000000000ff'), '23514');

-- ---- Retiring doors ---------------------------------------------------------

-- Three open: deleting one that let guests in is refused by its check-ins.
SELECT pg_temp.expect('a used door can''t be deleted', pg_temp.try('DELETE FROM event_doors WHERE id = ''f0000000-0000-4000-8000-000000000001'''), '23503');
SELECT pg_temp.expect('retire VIP desk', pg_temp.try('UPDATE event_doors SET retired_at = now() WHERE id = ''f0000000-0000-4000-8000-000000000002'''), 'ok');
SELECT pg_temp.expect('its volunteer goes free', (SELECT count(*)::text FROM door_assignments), '0');
SELECT pg_temp.expect('past check-ins keep it', pg_temp.door_of(1), 'VIP desk');
SELECT pg_temp.expect('a retired door', pg_temp.check_in(5, 'f0000000-0000-4000-8000-000000000002'), '23514');
SELECT pg_temp.expect('it can''t come back', pg_temp.try('UPDATE event_doors SET retired_at = NULL WHERE id = ''f0000000-0000-4000-8000-000000000002'''), '23514');
SELECT pg_temp.expect('below two while on', pg_temp.try('UPDATE event_doors SET retired_at = now() WHERE id = ''f0000000-0000-4000-8000-000000000003'''), '23514');
SELECT pg_temp.expect('its name is free again', pg_temp.try('INSERT INTO event_doors (event_id, name) VALUES (''bbbbbbbb-0000-4000-8000-000000000401'', ''VIP desk'')'), 'ok');

-- ---- Role change, and turning doors off ---------------------------------------

SELECT pg_temp.expect('assign again', pg_temp.try('INSERT INTO door_assignments (member_id, event_id, door_id) VALUES (''eeeeeeee-0000-4000-8000-000000000402'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''f0000000-0000-4000-8000-000000000003'')'), 'ok');
RESET ROLE;
UPDATE event_members SET role = 'organizer' WHERE id = 'eeeeeeee-0000-4000-8000-000000000402';
SELECT pg_temp.expect('promoted: free', (SELECT count(*)::text FROM door_assignments), '0');
UPDATE event_members SET role = 'volunteer' WHERE id = 'eeeeeeee-0000-4000-8000-000000000402';
SET LOCAL ROLE app_user;
SELECT pg_temp.as_person('aaaaaaaa-0000-4000-8000-000000000401', 'aal2');
SELECT pg_temp.expect('assign once more', pg_temp.try('INSERT INTO door_assignments (member_id, event_id, door_id) VALUES (''eeeeeeee-0000-4000-8000-000000000402'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''f0000000-0000-4000-8000-000000000003'')'), 'ok');
SELECT pg_temp.expect('doors off', pg_temp.try('UPDATE events SET doors_enabled = false WHERE id = ''bbbbbbbb-0000-4000-8000-000000000401'''), 'ok');
SELECT pg_temp.expect('off: all free', (SELECT count(*)::text FROM door_assignments), '0');
SELECT pg_temp.expect('off: a door sent is dropped', pg_temp.check_in(6, 'f0000000-0000-4000-8000-000000000001'), 'ok');
SELECT pg_temp.expect('off: recorded with none', pg_temp.door_of(6), '-');
SELECT pg_temp.expect('off: no one assigned', pg_temp.try('INSERT INTO door_assignments (member_id, event_id, door_id) VALUES (''eeeeeeee-0000-4000-8000-000000000402'', ''bbbbbbbb-0000-4000-8000-000000000401'', ''f0000000-0000-4000-8000-000000000003'')'), '23514');

-- ---- At the first step only, the host changes nothing --------------------------

SELECT pg_temp.as_person('aaaaaaaa-0000-4000-8000-000000000401', 'aal1');
SELECT pg_temp.expect('needs the second step', pg_temp.try('INSERT INTO event_doors (event_id, name) VALUES (''bbbbbbbb-0000-4000-8000-000000000401'', ''Back'')'), '42501');

-- ---- Someone off the team sees nothing --------------------------------------------

SELECT pg_temp.as_person('aaaaaaaa-0000-4000-8000-000000000404', 'aal2');
SELECT pg_temp.expect('stranger reads doors', (SELECT count(*)::text FROM event_doors), '0');
SELECT pg_temp.expect('stranger names a door', pg_temp.try('INSERT INTO event_doors (event_id, name) VALUES (''bbbbbbbb-0000-4000-8000-000000000401'', ''Back'')'), '42501');

ROLLBACK;
