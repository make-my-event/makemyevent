-- A guest's own tickets: whose they become, and who can see them. Rolled back.
BEGIN;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'host@test.local', 'Host'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'guest@test.local', 'Guest'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'other@test.local', 'Other');
INSERT INTO events (id, host_user_id, slug, title, online_url) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'tickets-draft', 'Draft', 'https://meet.test/x');
INSERT INTO ticket_types (id, event_id, name) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Pass');
INSERT INTO registrations (id, event_id, ticket_type_id, attendee_name, attendee_email, source, status) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'G', 'guest@test.local', 'invite', 'confirmed'),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'O', 'other@test.local', 'invite', 'waitlisted');

-- Everyone at aal2, as the host must be to change a guest; what differs
-- without it is in two-step.sql.
CREATE FUNCTION pg_temp.be(person text) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('app.user_id', person, true), set_config('app.aal', 'aal2', true) $$;

CREATE FUNCTION pg_temp.expect(what text, got text, wanted text) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION '%: got %, wanted %', what, got, wanted;
  END IF;
END
$$;

SET LOCAL ROLE app_user;

-- Signed out: nothing to claim, nothing to see.
SELECT pg_temp.be('');
SELECT pg_temp.expect('signed out claims', app.claim_tickets()::text, '0');
SELECT pg_temp.expect('signed out sees', count(*)::text, '0') FROM app.my_tickets();

-- The guest: theirs, and only theirs, once.
SELECT pg_temp.be('aaaaaaaa-0000-4000-8000-000000000002');
SELECT pg_temp.expect('before claiming', count(*)::text, '0') FROM app.my_tickets();
SELECT pg_temp.expect('claims', app.claim_tickets()::text, '1');
SELECT pg_temp.expect('claims again', app.claim_tickets()::text, '0');
SELECT pg_temp.expect('sees', string_agg(id::text, ','), 'dddddddd-0000-4000-8000-000000000001') FROM app.my_tickets();
SELECT pg_temp.expect('join link with a place', online_url, 'https://meet.test/x') FROM app.my_tickets();
SELECT pg_temp.expect('another''s by id', count(*)::text, '0') FROM app.my_tickets('dddddddd-0000-4000-8000-000000000002');
-- The draft itself stays closed to them.
SELECT pg_temp.expect('the draft event', count(*)::text, '0') FROM events;
SELECT pg_temp.expect('its ticket types', count(*)::text, '0') FROM ticket_types;

-- No one sets whose ticket it is by hand, the host included.
SELECT pg_temp.be('aaaaaaaa-0000-4000-8000-000000000001');
DO $$
BEGIN
  UPDATE registrations SET user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'a host could take a ticket';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$$;
-- Correcting a name leaves it; moving it to another email releases it.
UPDATE registrations SET attendee_name = 'G2', attendee_email = 'guest@test.local'
  WHERE id = 'dddddddd-0000-4000-8000-000000000001';
SELECT pg_temp.expect('kept after a correction', user_id::text, 'aaaaaaaa-0000-4000-8000-000000000002')
  FROM registrations WHERE id = 'dddddddd-0000-4000-8000-000000000001';
UPDATE registrations SET attendee_email = 'other@test.local'
  WHERE id = 'dddddddd-0000-4000-8000-000000000001';
SELECT pg_temp.be('aaaaaaaa-0000-4000-8000-000000000002');
SELECT pg_temp.expect('released', count(*)::text, '0') FROM app.my_tickets();
SELECT pg_temp.be('aaaaaaaa-0000-4000-8000-000000000003');
SELECT pg_temp.expect('claimed by the new email', app.claim_tickets()::text, '2');
SELECT pg_temp.expect('no join link while waitlisted', online_url, NULL)
  FROM app.my_tickets('dddddddd-0000-4000-8000-000000000002');

ROLLBACK;
