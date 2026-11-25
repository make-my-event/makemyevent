-- The app reads and writes through one path: the server's connection, as
-- app_user, under row-level security. Supabase's web API (PostgREST and
-- GraphQL) is not used for data, and its roles are to hold nothing here.
--
-- Supabase grants every table, sequence and function made in public to anon,
-- authenticated and service_role by default. Each migration has revoked the
-- first two from its own tables; it could be forgotten, sequences were, and
-- _prisma_migrations, which Prisma makes itself, could be written by anyone
-- holding the public key. This takes away the default, and what it gave.
--
-- service_role too: the server's secret key is for Storage alone, so if it
-- ever leaked it would still open no table.

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    -- Absent outside Supabase.
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
  END LOOP;

  -- Prisma's own table: its owner, who runs migrations, is not held by this.
  -- Absent in the shadow database `migrate dev` builds.
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;

-- Functions are executable by everyone unless said otherwise. app's are for
-- app_user, which holds each one it calls by name; the rest are triggers,
-- which need no grant to fire.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
