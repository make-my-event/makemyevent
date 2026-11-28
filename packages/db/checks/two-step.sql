-- Two-step sign-in, against the policies and functions themselves: what each
-- kind of person can do with it (aal2), without it (aal1), and when the app
-- says nothing. Everything is rolled back. A change here is a change of who
-- needs it.
BEGIN;

INSERT INTO users (id, email, display_name)
  SELECT format('aaaaaaaa-0000-4000-8000-00000000000%s', n)::uuid,
         format('m%s@test.local', n), 'M'
  FROM generate_series(1, 6) n;
INSERT INTO events (id, host_user_id, slug, title) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'two-step-mine', 'Mine');
INSERT INTO ticket_types (id, event_id, name) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'T');
INSERT INTO event_members (event_id, email, display_name, role, user_id, joined_at) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'm2@test.local', 'A', 'admin', 'aaaaaaaa-0000-4000-8000-000000000002', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'm3@test.local', 'O', 'organizer', 'aaaaaaaa-0000-4000-8000-000000000003', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'm4@test.local', 'V', 'volunteer', 'aaaaaaaa-0000-4000-8000-000000000004', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'm6@test.local', 'P', 'organizer', NULL, NULL);
INSERT INTO registrations (id, event_id, ticket_type_id, attendee_name, attendee_email, source, status, user_id) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'G1', 'g1@test.local', 'self', 'confirmed', 'aaaaaaaa-0000-4000-8000-000000000005'),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'G2', 'g2@test.local', 'self', 'confirmed', NULL);
INSERT INTO blocked_contacts (event_id, kind, value) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'email', 'b@test.local');

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
    'SELECT 1 FROM events WHERE id::text LIKE ''bbbbbbbb%''',
    'SELECT 1 FROM registrations WHERE event_id::text LIKE ''bbbbbbbb%''',
    'SELECT 1 FROM blocked_contacts WHERE event_id::text LIKE ''bbbbbbbb%''',
    'UPDATE events SET title = ''X'' WHERE id::text LIKE ''bbbbbbbb%''',
    'UPDATE registrations SET attendee_name = ''X'' WHERE event_id::text LIKE ''bbbbbbbb%''',
    'INSERT INTO check_ins (registration_id, event_id) VALUES (''dddddddd-0000-4000-8000-000000000002'', ''bbbbbbbb-0000-4000-8000-000000000001'')',
    'INSERT INTO ticket_invites (ticket_type_id, event_id, kind, code) VALUES (''cccccccc-0000-4000-8000-000000000001'', ''bbbbbbbb-0000-4000-8000-000000000001'', ''code'', ''TESTCODE'')',
    'UPDATE event_members SET role = ''admin'' WHERE event_id::text LIKE ''bbbbbbbb%'' AND role = ''volunteer''',
    'INSERT INTO audit_log (event_id, action) VALUES (''bbbbbbbb-0000-4000-8000-000000000001'', ''guests.export'')',
    'INSERT INTO events (host_user_id, slug, title) VALUES (app.current_user_id(), ''two-step-new'', ''New'')',
    'DELETE FROM events WHERE id::text LIKE ''bbbbbbbb%'''];
  labels text[] := ARRAY['see the draft', 'see guests', 'see the blocklist',
    'edit the event', 'edit guests', 'check in', 'make an invite', 'change a role',
    'write the audit log', 'create an event', 'delete the event'];
  person record;
  got text;
  wrong text := '';
BEGIN
  FOR person IN
    SELECT * FROM (VALUES
      ('owner',     1, 'aal2', '1 2 1 1 2 1 1 1 1 1 no'),
      ('owner',     1, 'aal1', '0 0 0 0 0 no no 0 no 1 0'),
      ('owner',     1, '',     '0 0 0 0 0 no no 0 no 1 0'),
      ('owner',     1, 'AAL2', '0 0 0 0 0 no no 0 no 1 0'),
      ('admin',     2, 'aal2', '1 2 1 1 2 1 1 1 1 1 0'),
      ('admin',     2, 'aal1', '0 0 0 0 0 no no 0 no 1 0'),
      ('organizer', 3, 'aal2', '1 2 1 1 2 1 1 0 1 1 0'),
      ('organizer', 3, 'aal1', '0 0 0 0 0 no no 0 no 1 0'),
      -- The door works without it; running an event with people does not.
      -- Anyone may start a private draft (see below).
      ('volunteer', 4, 'aal2', '1 2 0 0 0 1 no 0 1 1 0'),
      ('volunteer', 4, 'aal1', '1 2 0 0 0 1 no 0 1 1 0'),
      ('attendee',  5, 'aal2', '0 1 0 0 0 no no 0 no 1 0'),
      ('attendee',  5, 'aal1', '0 1 0 0 0 no no 0 no 1 0')
    ) AS t(name, number, aal, expected)
  LOOP
    PERFORM set_config('app.user_id', format('aaaaaaaa-0000-4000-8000-00000000000%s', person.number), true),
            set_config('app.aal', person.aal, true);
    FOR i IN 1 .. array_length(actions, 1) LOOP
      SET LOCAL ROLE app_user;
      BEGIN
        got := pg_temp.attempt(actions[i]);
      EXCEPTION WHEN foreign_key_violation THEN
        -- Allowed by the policies, kept back by the guests it has.
        got := 'no';
      END;
      RESET ROLE;
      IF got IS DISTINCT FROM (regexp_split_to_array(person.expected, '\s+'))[i] THEN
        wrong := wrong || format(E'\n  %s at "%s", %s: %s, expected %s', person.name, person.aal,
          labels[i], got, (regexp_split_to_array(person.expected, '\s+'))[i]);
      END IF;
    END LOOP;
  END LOOP;
  IF wrong <> '' THEN
    RAISE EXCEPTION 'Two-step rules changed:%', wrong;
  END IF;
  RAISE NOTICE 'two-step: 12 sessions x % actions as expected', array_length(actions, 1);
END
$$;

-- A draft with no guests but a team: deleting it is the owner's, and takes
-- aal2.
DO $$
DECLARE
  aal text;
  got text;
BEGIN
  DELETE FROM registrations WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  PERFORM set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000001', true);
  FOREACH aal IN ARRAY ARRAY['aal1', 'aal2'] LOOP
    PERFORM set_config('app.aal', aal, true);
    SET LOCAL ROLE app_user;
    got := pg_temp.attempt('DELETE FROM events WHERE id = ''bbbbbbbb-0000-4000-8000-000000000001''');
    RESET ROLE;
    ASSERT got = CASE aal WHEN 'aal2' THEN '1' ELSE '0' END, format('delete at %s: %s', aal, got);
  END LOOP;
END
$$;

-- A private draft: its owner works on it without the second step, until
-- they bring someone in, which takes it.
DO $$
DECLARE
  got text;
  steps text[] := '{}';
BEGIN
  INSERT INTO users (id, email, display_name) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000007', 'm7@test.local', 'M');
  INSERT INTO events (id, host_user_id, slug, title) VALUES
    ('bbbbbbbb-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000007', 'two-step-private', 'Private');
  INSERT INTO ticket_types (id, event_id, name) VALUES
    ('cccccccc-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000007', 'T');
  PERFORM set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000007', true),
          set_config('app.aal', 'aal1', true);
  SET LOCAL ROLE app_user;
  steps := steps
    || pg_temp.attempt('SELECT 1 FROM events WHERE id = ''bbbbbbbb-0000-4000-8000-000000000007''')
    || pg_temp.attempt('UPDATE events SET title = ''Y'' WHERE id = ''bbbbbbbb-0000-4000-8000-000000000007''')
    || pg_temp.attempt('UPDATE ticket_types SET name = ''Y'' WHERE event_id = ''bbbbbbbb-0000-4000-8000-000000000007''')
    || pg_temp.attempt('INSERT INTO registrations (event_id, ticket_type_id, attendee_name, attendee_email, source) VALUES (''bbbbbbbb-0000-4000-8000-000000000007'', ''cccccccc-0000-4000-8000-000000000007'', ''G'', ''g7@test.local'', ''invite'')')
    || pg_temp.attempt('INSERT INTO event_members (event_id, email, display_name, role, invited_by_id) VALUES (''bbbbbbbb-0000-4000-8000-000000000007'', ''x@test.local'', ''X'', ''admin'', app.current_user_id())')
    || pg_temp.attempt('UPDATE events SET status = ''published'' WHERE id = ''bbbbbbbb-0000-4000-8000-000000000007''');
  ASSERT NOT app.runs_events(), 'a private draft alone asks for nothing';
  ASSERT steps = ARRAY['1', '1', '1', 'no', 'no', 'no'],
    format('private draft at aal1: %s', steps);

  -- With the second step, a guest comes in, and the draft is private no more.
  PERFORM set_config('app.aal', 'aal2', true);
  got := pg_temp.attempt('SELECT 1 FROM events WHERE id = ''bbbbbbbb-0000-4000-8000-000000000007''');
  ASSERT got = '1', format('private draft at aal2: %s', got);
  INSERT INTO registrations (event_id, ticket_type_id, attendee_name, attendee_email, source)
    VALUES ('bbbbbbbb-0000-4000-8000-000000000007', 'cccccccc-0000-4000-8000-000000000007', 'G', 'g7@test.local', 'invite');
  PERFORM set_config('app.aal', 'aal1', true);
  got := pg_temp.attempt('SELECT 1 FROM events WHERE id = ''bbbbbbbb-0000-4000-8000-000000000007''');
  ASSERT got = '0', format('with a guest, at aal1: %s', got);
  got := pg_temp.attempt('SELECT 1 FROM registrations WHERE event_id = ''bbbbbbbb-0000-4000-8000-000000000007''');
  ASSERT got = '0', format('its guest, at aal1: %s', got);
  ASSERT app.runs_events(), 'and now it is asked for';
  RESET ROLE;
  RAISE NOTICE 'two-step: a private draft as expected';
END
$$;

-- Who is asked to set it up, recovery codes, and the count of tries.
DO $$
DECLARE
  digests text[];
  waits integer[] := '{}';
  who record;
BEGIN
  PERFORM set_config('app.aal', 'aal1', true);
  FOR who IN SELECT * FROM (VALUES (1, true), (2, true), (3, true), (4, false),
      (5, false), (6, true)) AS t(number, runs) LOOP
    PERFORM set_config('app.user_id', format('aaaaaaaa-0000-4000-8000-00000000000%s', who.number), true);
    SET LOCAL ROLE app_user;
    ASSERT app.runs_events() = who.runs, format('runs_events for %s', who.number);
    RESET ROLE;
  END LOOP;
  SELECT array_agg(encode(sha256(convert_to('code' || n, 'UTF8')), 'hex')) INTO digests
    FROM generate_series(1, 10) n;

  PERFORM set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE app_user;

  -- Below aal2 no codes can be made, and the tables are closed at any level.
  ASSERT pg_temp.attempt(format('SELECT app.save_recovery_codes(%L)', digests)) = 'no', 'codes at aal1';
  PERFORM set_config('app.aal', 'aal2', true);
  ASSERT pg_temp.attempt('SELECT 1 FROM recovery_codes') = 'no', 'codes can be read';
  ASSERT pg_temp.attempt('DELETE FROM recovery_codes') = 'no', 'codes can be deleted';
  ASSERT pg_temp.attempt('SELECT 1 FROM two_step_tries') = 'no', 'tries can be read';
  ASSERT pg_temp.attempt('DELETE FROM two_step_tries') = 'no', 'tries can be deleted';
  ASSERT pg_temp.attempt('SELECT app.record_two_step(''guests_export'')') = 'no', 'any audit entry';

  PERFORM app.save_recovery_codes(digests);
  ASSERT app.recovery_codes_left() = 10, 'ten codes';
  PERFORM set_config('app.aal', 'aal1', true);
  ASSERT NOT app.use_recovery_code(encode(sha256('wrong'), 'hex')), 'a wrong code';
  ASSERT NOT app.use_recovery_code('x'), 'not a digest';
  ASSERT app.use_recovery_code(digests[3]), 'a right code';
  ASSERT NOT app.use_recovery_code(digests[3]), 'the same code twice';
  ASSERT app.recovery_codes_left() = 9, 'nine left';

  -- Another person's codes are no use to anyone else.
  PERFORM set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000002', true);
  ASSERT NOT app.use_recovery_code(digests[4]), 'someone else''s code';

  -- A new set retires the old one.
  PERFORM set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000001', true),
          set_config('app.aal', 'aal2', true);
  PERFORM app.save_recovery_codes((SELECT array_agg(encode(sha256(convert_to('next' || n, 'UTF8')), 'hex'))
    FROM generate_series(1, 10) n));
  ASSERT NOT app.use_recovery_code(digests[5]), 'a code from an old set';
  ASSERT app.recovery_codes_left() = 10, 'ten again';

  -- Five tries, then a wait; aal1 cannot clear it, aal2 can, and it ends.
  PERFORM set_config('app.aal', 'aal1', true);
  FOR i IN 1 .. 7 LOOP
    waits := waits || app.count_two_step_try();
    PERFORM app.clear_two_step_tries();
  END LOOP;
  ASSERT waits[1:5] = ARRAY[0, 0, 0, 0, 0], 'five tries';
  ASSERT waits[6] BETWEEN 1 AND 900 AND waits[7] BETWEEN 1 AND 900, 'then a wait';
  RESET ROLE;
  UPDATE two_step_tries SET window_ends_at = now() - interval '1 second';
  SET LOCAL ROLE app_user;
  ASSERT app.count_two_step_try() = 0, 'the wait ends';
  PERFORM set_config('app.aal', 'aal2', true);
  PERFORM app.clear_two_step_tries();
  RESET ROLE;
  ASSERT NOT EXISTS (SELECT 1 FROM two_step_tries), 'cleared by a right code';

  -- Signed out: nothing.
  PERFORM set_config('app.user_id', '', true);
  SET LOCAL ROLE app_user;
  ASSERT pg_temp.attempt('SELECT app.count_two_step_try()') = 'no', 'tries signed out';
  ASSERT NOT app.runs_events(), 'runs_events signed out';
  RESET ROLE;

  ASSERT (SELECT array_agg(action ORDER BY id) FROM audit_log WHERE action LIKE 'two\_step.%'
      AND actor_id = 'aaaaaaaa-0000-4000-8000-000000000001')
    = ARRAY['two_step.new_codes', 'two_step.recovered', 'two_step.new_codes'], 'the audit log';
  RAISE NOTICE 'two-step: codes and tries as expected';
END
$$;

ROLLBACK;
