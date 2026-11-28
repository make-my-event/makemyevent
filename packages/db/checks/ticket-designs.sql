-- The rules every pass design is held to, whoever writes it. Rolled back.
BEGIN;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000101', 'host@designs.local', 'Host'),
  ('aaaaaaaa-0000-4000-8000-000000000102', 'helper@designs.local', 'Helper'),
  ('aaaaaaaa-0000-4000-8000-000000000103', 'stranger@designs.local', 'Stranger');
INSERT INTO events (id, host_user_id, slug, title) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000101', 'designs-check', 'Designs'),
  ('bbbbbbbb-0000-4000-8000-000000000102', 'aaaaaaaa-0000-4000-8000-000000000103', 'designs-other', 'Other');
INSERT INTO event_members (event_id, user_id, role, display_name, email, joined_at) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000102', 'volunteer', 'Helper', 'helper@designs.local', now());
INSERT INTO ticket_types (id, event_id, name) VALUES
  ('cccccccc-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000101', 'General'),
  ('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', 'VIP'),
  ('cccccccc-0000-4000-8000-000000000103', 'bbbbbbbb-0000-4000-8000-000000000102', 'Theirs');

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
  IF got IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION '%: got %, wanted %', what, got, wanted;
  END IF;
END
$$;

-- A save of `layers` for a ticket, as the editor sends it.
CREATE FUNCTION pg_temp.save(ticket text, event text, layers text, base text DEFAULT 'classic', accent text DEFAULT NULL) RETURNS text
  LANGUAGE sql AS $$
    SELECT pg_temp.try(format(
      'INSERT INTO ticket_designs (ticket_type_id, event_id, base, accent, layers) VALUES (%L, %L, %L, %L, %L)
       ON CONFLICT (ticket_type_id) DO UPDATE SET base = excluded.base, accent = excluded.accent, layers = excluded.layers',
      ticket, event, base, accent, layers))
  $$;

CREATE TEMP TABLE good (layers text);
INSERT INTO good VALUES ('[{"id":"qr","kind":"qr","x":584,"y":84,"size":112},{"id":"t1","kind":"text","source":{"type":"own","text":"Guest"},"x":40,"y":150,"width":300,"size":"s","weight":"regular","colour":"soft"}]');
GRANT SELECT ON good TO app_user;

-- The host, at the second step, under the policies.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000101', true),
       set_config('app.aal', 'aal2', true);
SET LOCAL ROLE app_user;

SELECT pg_temp.expect('a design', pg_temp.save('cccccccc-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000101', (SELECT layers FROM good), 'bauhaus-sun', 'blue'), 'ok');
SELECT pg_temp.expect('saved again', pg_temp.save('cccccccc-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000101', (SELECT layers FROM good), 'swiss-grid'), 'ok');
SELECT pg_temp.expect('one row, stamped', (SELECT string_agg(base || ' ' || coalesce(updated_by_id::text, '-'), ',') FROM ticket_designs), 'swiss-grid aaaaaaaa-0000-4000-8000-000000000101');
SELECT pg_temp.expect('no such design', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', (SELECT layers FROM good), 'mystery'), '23514');
SELECT pg_temp.expect('no such accent', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', (SELECT layers FROM good), 'classic', '#ff0000'), '23514');
SELECT pg_temp.expect('no code', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', '[{"id":"t1","kind":"text","source":{"type":"own","text":"Hi"},"x":40,"y":40,"width":100,"size":"s","weight":"regular","colour":"ink"}]'), '23514');
SELECT pg_temp.expect('two codes', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', '[{"id":"qr","kind":"qr","x":40,"y":40,"size":100},{"id":"qr","kind":"qr","x":300,"y":40,"size":100}]'), '23514');
SELECT pg_temp.expect('code off the edge', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', '[{"id":"qr","kind":"qr","x":650,"y":40,"size":100}]'), '23514');
SELECT pg_temp.expect('code too small', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', '[{"id":"qr","kind":"qr","x":40,"y":40,"size":40}]'), '23514');
SELECT pg_temp.expect('a position as text', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', '[{"id":"qr","kind":"qr","x":"40","y":40,"size":100}]'), '23514');
SELECT pg_temp.expect('not a list', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', '{"kind":"qr"}'), '23514');
SELECT pg_temp.expect('long words', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', format('[{"id":"qr","kind":"qr","x":584,"y":84,"size":112},{"id":"t1","kind":"text","source":{"type":"own","text":"%s"},"x":40,"y":40,"width":300,"size":"s","weight":"regular","colour":"ink"}]', repeat('x', 61))), '23514');
SELECT pg_temp.expect('another event''s ticket', pg_temp.save('cccccccc-0000-4000-8000-000000000103', 'bbbbbbbb-0000-4000-8000-000000000101', (SELECT layers FROM good)), '23503');
SELECT pg_temp.expect('another event', pg_temp.save('cccccccc-0000-4000-8000-000000000103', 'bbbbbbbb-0000-4000-8000-000000000102', (SELECT layers FROM good)), '42501');
SELECT pg_temp.expect('who changed it, not sent', pg_temp.try('UPDATE ticket_designs SET updated_by_id = NULL'), '42501');

-- At the first step only, the host's published-or-shared event is closed.
SELECT set_config('app.aal', 'aal1', true);
SELECT pg_temp.expect('needs the second step', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', (SELECT layers FROM good)), '42501');

-- A volunteer reads, and can't change.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000102', true);
SELECT pg_temp.expect('volunteer reads', (SELECT count(*)::text FROM ticket_designs), '1');
SELECT pg_temp.expect('volunteer changes', pg_temp.save('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000101', (SELECT layers FROM good)), '42501');
SELECT pg_temp.expect('volunteer deletes', pg_temp.try('DELETE FROM ticket_designs'), 'ok');
SELECT pg_temp.expect('nothing deleted', (SELECT count(*)::text FROM ticket_designs), '1');

-- Someone off the team sees nothing.
SELECT set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000103', true),
       set_config('app.aal', 'aal2', true);
SELECT pg_temp.expect('stranger reads', (SELECT count(*)::text FROM ticket_designs WHERE event_id = 'bbbbbbbb-0000-4000-8000-000000000101'), '0');

-- Deleting the ticket takes its design.
RESET ROLE;
DELETE FROM ticket_types WHERE id = 'cccccccc-0000-4000-8000-000000000101';
SELECT pg_temp.expect('design gone with its ticket', (SELECT count(*)::text FROM ticket_designs), '0');

ROLLBACK;
