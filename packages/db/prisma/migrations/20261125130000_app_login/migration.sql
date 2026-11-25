-- The login the deployed app connects with. Until now that was the role that
-- runs migrations: it owns the tables, bypasses row-level security and can
-- make roles, and only SET LOCAL ROLE stood between it and a request. This
-- login can do one thing, become app_user. A statement run outside asUser, or
-- one that resets its role, holds nothing.
--
-- No password here, so it cannot sign in until one is set by hand in each
-- environment (scripts/login-password.mjs). Migrations keep their own login.
--
-- Roles belong to the server, not the database: another database on the same
-- server, such as the shadow one `migrate dev` builds, may have made it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_login') THEN
    CREATE ROLE app_login LOGIN NOINHERIT
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- May switch to app_user, holds none of its rights until it does, and may not
-- pass the membership on.
GRANT app_user TO app_login WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;

-- Set when the login connects, so they hold through a pooler, and SET ROLE
-- does not change them. Longer than any one statement the app runs, and than
-- the gap between two in one transaction: they end what a server that died
-- left behind, with its locks. See Limits in src/index.ts.
ALTER ROLE app_login SET statement_timeout = '30s';
ALTER ROLE app_login SET idle_in_transaction_session_timeout = '15s';
