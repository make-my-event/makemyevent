-- A guest's ticket page reads one ticket through app.ticket_view, as a
-- visitor, and nothing else. Rolled back.
BEGIN;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000201', 'host@view.local', 'Host');
INSERT INTO events (id, host_user_id, slug, title, venue_name) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000201', 'aaaaaaaa-0000-4000-8000-000000000201', 'view-check', 'View', 'Hall A'),
  ('bbbbbbbb-0000-4000-8000-000000000202', 'aaaaaaaa-0000-4000-8000-000000000201', 'view-other', 'Other', NULL);
INSERT INTO ticket_types (id, event_id, name) VALUES
  ('cccccccc-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000201', 'General');
INSERT INTO form_fields (id, event_id, kind, label, position) VALUES
  ('eeeeeeee-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000201', 'short_text', 'Team name', 10),
  ('eeeeeeee-0000-4000-8000-000000000202', 'bbbbbbbb-0000-4000-8000-000000000201', 'short_text', 'Allergies', 11);
INSERT INTO registrations (id, event_id, ticket_type_id, attendee_name, attendee_email, source) VALUES
  ('dddddddd-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000201', 'cccccccc-0000-4000-8000-000000000201', 'Asha', 'asha@view.local', 'invite');
INSERT INTO registration_answers (registration_id, event_id, field_id, value) VALUES
  ('dddddddd-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000201', 'eeeeeeee-0000-4000-8000-000000000201', '"Rockets"'),
  ('dddddddd-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000201', 'eeeeeeee-0000-4000-8000-000000000202', '"Peanuts"');
-- The design prints Team name, not Allergies.
INSERT INTO ticket_designs (ticket_type_id, event_id, base, layers) VALUES
  ('cccccccc-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000201', 'swiss-grid',
   '[{"id":"qr","kind":"qr","x":584,"y":84,"size":112},{"id":"t1","kind":"text","source":{"type":"question","fieldId":"eeeeeeee-0000-4000-8000-000000000201"},"x":40,"y":40,"width":300,"size":"s","weight":"regular","colour":"ink"}]');

CREATE FUNCTION pg_temp.expect(what text, got text, wanted text) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION '%: got %, wanted %', what, got, wanted;
  END IF;
END
$$;

-- A visitor: no one signed in.
SELECT set_config('app.user_id', '', true), set_config('app.aal', '', true);
SET LOCAL ROLE app_user;

SELECT pg_temp.expect('no registrations directly',
  (SELECT count(*)::text FROM registrations), '0');

CREATE TEMP TABLE seen AS
  SELECT app.ticket_view('dddddddd-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000201') AS v;

SELECT pg_temp.expect('name', (SELECT v ->> 'attendeeName' FROM seen), 'Asha');
SELECT pg_temp.expect('ticket', (SELECT v ->> 'ticketName' FROM seen), 'General');
SELECT pg_temp.expect('design', (SELECT v -> 'design' ->> 'base' FROM seen), 'swiss-grid');
SELECT pg_temp.expect('venue', (SELECT v -> 'event' ->> 'venueName' FROM seen), 'Hall A');
SELECT pg_temp.expect('the printed answer', (SELECT v -> 'answers' -> 'eeeeeeee-0000-4000-8000-000000000201' ->> 'value' FROM seen), 'Rockets');
SELECT pg_temp.expect('no unprinted answer', (SELECT (v -> 'answers' ? 'eeeeeeee-0000-4000-8000-000000000202')::text FROM seen), 'false');
SELECT pg_temp.expect('one question', (SELECT jsonb_array_length(v -> 'questions')::text FROM seen), '1');
SELECT pg_temp.expect('no email', (SELECT (v::text LIKE '%asha@view.local%')::text FROM seen), 'false');
SELECT pg_temp.expect('the wrong event', (SELECT app.ticket_view('dddddddd-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000202') IS NULL)::text, 'true');
SELECT pg_temp.expect('no such guest', (SELECT app.ticket_view('dddddddd-0000-4000-8000-000000000299', 'bbbbbbbb-0000-4000-8000-000000000201') IS NULL)::text, 'true');

ROLLBACK;
