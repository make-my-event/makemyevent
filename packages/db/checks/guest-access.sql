-- Who may do what to guests, their answers and their check-ins: eight kinds
-- of people, twelve actions, against the policies themselves. Everything is
-- rolled back. Each cell is the number of rows seen or changed, or no for
-- refused. A change here is a change of who can do what.
BEGIN;

INSERT INTO users (id, email, display_name)
  SELECT format('aaaaaaaa-0000-4000-8000-00000000000%s', n)::uuid,
         format('m%s@test.local', n), 'M'
  FROM generate_series(1, 7) n;
INSERT INTO events (id, host_user_id, slug, title) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'access-mine', 'Mine'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000006', 'access-other', 'Other');
INSERT INTO ticket_types (id, event_id, name) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'T'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'T');
INSERT INTO event_members (event_id, email, display_name, role, user_id, joined_at) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'm2@test.local', 'A', 'admin', 'aaaaaaaa-0000-4000-8000-000000000002', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'm3@test.local', 'O', 'organizer', 'aaaaaaaa-0000-4000-8000-000000000003', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'm4@test.local', 'V', 'volunteer', 'aaaaaaaa-0000-4000-8000-000000000004', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'pending@test.local', 'P', 'admin', NULL, NULL);
INSERT INTO registrations (id, event_id, ticket_type_id, attendee_name, attendee_email, source, status, user_id) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'G1', 'g1@test.local', 'self', 'confirmed', 'aaaaaaaa-0000-4000-8000-000000000005'),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'G2', 'g2@test.local', 'self', 'confirmed', NULL),
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'G3', 'g3@test.local', 'self', 'confirmed', NULL);
INSERT INTO registration_answers (registration_id, event_id, field_id, value)
  SELECT 'dddddddd-0000-4000-8000-000000000001', event_id, id, '"x"'
  FROM form_fields WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000001' AND kind = 'select' LIMIT 1;
INSERT INTO check_ins (registration_id, event_id) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001');

-- Runs one statement and undoes it: the rows it touched, or no.
CREATE FUNCTION pg_temp.attempt(statement text) RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  touched bigint;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS touched = ROW_COUNT;
  RAISE EXCEPTION USING ERRCODE = 'ZZ001', MESSAGE = touched::text;
EXCEPTION
  WHEN SQLSTATE 'ZZ001' THEN RETURN SQLERRM;
  WHEN insufficient_privilege THEN RETURN 'no';
END
$$;

DO $$
DECLARE
  actions text[] := ARRAY[
    'SELECT 1 FROM registrations WHERE event_id::text LIKE ''bbbbbbbb%''',
    'SELECT 1 FROM registration_answers WHERE event_id::text LIKE ''bbbbbbbb%''',
    'SELECT 1 FROM check_ins WHERE event_id::text LIKE ''bbbbbbbb%''',
    'INSERT INTO registrations (event_id, ticket_type_id, attendee_name, attendee_email, source, status) VALUES (''bbbbbbbb-0000-4000-8000-000000000001'', ''cccccccc-0000-4000-8000-000000000001'', ''N'', ''n@test.local'', ''invite'', ''confirmed'')',
    'INSERT INTO registrations (event_id, ticket_type_id, attendee_name, attendee_email, source, status) VALUES (''bbbbbbbb-0000-4000-8000-000000000001'', ''cccccccc-0000-4000-8000-000000000001'', ''N'', ''n@test.local'', ''self'', ''confirmed'')',
    'UPDATE registrations SET attendee_name = ''X'' WHERE event_id::text LIKE ''bbbbbbbb%''',
    'UPDATE registration_answers SET value = ''"y"'' WHERE event_id::text LIKE ''bbbbbbbb%''',
    'DELETE FROM registration_answers WHERE event_id::text LIKE ''bbbbbbbb%''',
    'INSERT INTO check_ins (registration_id, event_id) VALUES (''dddddddd-0000-4000-8000-000000000002'', ''bbbbbbbb-0000-4000-8000-000000000001'')',
    'DELETE FROM check_ins WHERE event_id::text LIKE ''bbbbbbbb%''',
    'INSERT INTO check_ins (registration_id, event_id) VALUES (''dddddddd-0000-4000-8000-000000000003'', ''bbbbbbbb-0000-4000-8000-000000000002'')',
    'DELETE FROM registrations WHERE event_id::text LIKE ''bbbbbbbb%'''];
  labels text[] := ARRAY['see guests', 'see answers', 'see check-ins', 'invite',
    'add as if self-registered', 'edit guests', 'edit answers', 'delete answers',
    'check in', 'undo check-in', 'check in at another event', 'delete guests'];
  person record;
  got text;
  wrong text := '';
BEGIN
  FOR person IN
    SELECT * FROM (VALUES
      ('owner',      1, '2 1 1 1  no 2 1 1 1  1 no no'),
      ('admin',      2, '2 1 1 1  no 2 1 1 1  1 no no'),
      ('organizer',  3, '2 1 1 1  no 2 1 1 1  1 no no'),
      ('volunteer',  4, '2 1 1 no no 0 0 0 1  1 no no'),
      ('attendee',   5, '1 0 0 no no 0 0 0 no 0 no no'),
      ('other host', 6, '1 0 0 no no 1 0 0 no 0 1  no'),
      ('stranger',   7, '0 0 0 no no 0 0 0 no 0 no no'),
      ('signed out', 0, '0 0 0 no no 0 0 0 no 0 no no')
    ) AS t(name, number, expected)
  LOOP
    PERFORM set_config('app.user_id', CASE WHEN person.number = 0 THEN ''
      ELSE format('aaaaaaaa-0000-4000-8000-00000000000%s', person.number) END, true);
    FOR i IN 1 .. array_length(actions, 1) LOOP
      SET LOCAL ROLE app_user;
      got := pg_temp.attempt(actions[i]);
      RESET ROLE;
      IF got IS DISTINCT FROM (regexp_split_to_array(person.expected, '\s+'))[i] THEN
        wrong := wrong || format(E'\n  %s, %s: %s, expected %s', person.name, labels[i],
          got, (regexp_split_to_array(person.expected, '\s+'))[i]);
      END IF;
    END LOOP;
  END LOOP;
  IF wrong <> '' THEN
    RAISE EXCEPTION 'Permissions changed:%', wrong;
  END IF;
  RAISE NOTICE 'guest access: % people x % actions as expected', 8, array_length(actions, 1);
END
$$;

ROLLBACK;
