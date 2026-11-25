-- Signed in as app_login: it can become app_user and do nothing else. Run in
-- CI over the app's own connection string. Everything is rolled back.
BEGIN;

DO $$
DECLARE
  attempt text;
  refused boolean;
  open_to text := '';
BEGIN
  IF session_user <> 'app_login' THEN
    RAISE EXCEPTION 'DATABASE_URL signs in as %, not app_login', session_user;
  END IF;
  IF current_setting('statement_timeout') = '0'
    OR current_setting('idle_in_transaction_session_timeout') = '0' THEN
    RAISE EXCEPTION 'app_login is connected without its time limits';
  END IF;

  -- As itself, before any SET ROLE.
  FOREACH attempt IN ARRAY ARRAY[
    'SELECT 1 FROM users',
    'SELECT 1 FROM registrations',
    'SELECT 1 FROM _prisma_migrations',
    'DELETE FROM audit_log',
    'SELECT app.current_user_id()',
    'CREATE TABLE public.stray ()',
    'CREATE ROLE stray',
    'CREATE SCHEMA stray',
    'ALTER ROLE app_user LOGIN',
    'ALTER TABLE users DISABLE ROW LEVEL SECURITY',
    format('SET LOCAL ROLE %I', (SELECT tableowner FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'users'))]
  LOOP
    BEGIN
      EXECUTE attempt;
      refused := false;
    EXCEPTION WHEN insufficient_privilege THEN
      refused := true;
    END;
    IF NOT refused THEN
      open_to := open_to || E'\n  ' || attempt;
    END IF;
  END LOOP;
  IF open_to <> '' THEN
    RAISE EXCEPTION 'app_login can run:%', open_to;
  END IF;

  -- As asUser does it. An error here fails the check.
  SET LOCAL ROLE app_user;
  PERFORM set_config('app.user_id', 'aaaaaaaa-0000-4000-8000-000000000001', true);
  INSERT INTO users (id, email, display_name)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'app-login@test.local', 'M');
  IF (SELECT count(*) FROM users) <> 1 THEN
    RAISE EXCEPTION 'app_user sees rows that are not its own';
  END IF;

  -- Leaving the role leaves nothing.
  RESET ROLE;
  BEGIN
    PERFORM 1 FROM users;
    RAISE EXCEPTION 'app_login can read users after RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

ROLLBACK;
