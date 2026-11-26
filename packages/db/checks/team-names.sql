-- A team member's name is the one on their account. Rolled back.
BEGIN;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'host@test.local', 'Host'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'amal@test.local', 'Amal Dev');
INSERT INTO events (id, host_user_id, slug, title) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'team-names', 'Names');
INSERT INTO event_members (event_id, email, display_name, role) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'amal@test.local', 'amal@test.local', 'organizer');

CREATE FUNCTION pg_temp.expect(what text, got text, wanted text) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION '%: got %, wanted %', what, got, wanted;
  END IF;
END
$$;

-- Joining takes the account's name.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000002', true),
       set_config('app.aal', 'aal2', true);
SET LOCAL ROLE app_user;
SELECT pg_temp.expect('joins', app.claim_invites()::text, '1');
RESET ROLE;
SELECT pg_temp.expect('their name on joining', display_name, 'Amal Dev')
  FROM event_members WHERE email = 'amal@test.local';

-- Renaming themselves renames them on the team.
SET LOCAL ROLE app_user;
UPDATE users SET display_name = 'Amal D' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';
RESET ROLE;
SELECT pg_temp.expect('follows a rename', display_name, 'Amal D')
  FROM event_members WHERE email = 'amal@test.local';

-- The host can change their role, not their name.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000001', true);
SET LOCAL ROLE app_user;
UPDATE event_members SET role = 'admin' WHERE email = 'amal@test.local';
DO $$
BEGIN
  UPDATE event_members SET display_name = 'Someone else' WHERE email = 'amal@test.local';
  RAISE EXCEPTION 'a host could rename a member';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$$;
RESET ROLE;
SELECT pg_temp.expect('role changed', role, 'admin') FROM event_members WHERE email = 'amal@test.local';

ROLLBACK;
