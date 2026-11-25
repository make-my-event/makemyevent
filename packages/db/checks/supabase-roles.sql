-- Makes a plain Postgres stand in for Supabase before the migrations run: its
-- web API's roles, and the default that grants them everything made in
-- public. Without it, a check that they hold nothing proves nothing.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', api_role);
    END IF;
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO %I', api_role);
  END LOOP;
END
$$;
