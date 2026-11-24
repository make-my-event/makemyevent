-- Users: one row per Supabase Auth user, plus the database pieces every
-- tenant-scoped table after it relies on: the per-request role, the function
-- that names the signed-in person, and the updated_at trigger.

-- ---------------------------------------------------------------------------
-- Per-request role
--
-- User traffic never runs as the connection's own login, which owns the
-- tables and so bypasses row-level security. Each request's transaction runs
--
--   SET LOCAL ROLE app_user;
--   SELECT set_config('app.user_id', '<verified auth user id>', true);
--
-- so every policy sees who is asking, and the setting ends with the
-- transaction. The login that runs migrations is the one the app connects
-- with, so it is made a member of app_user here.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

GRANT app_user TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- The signed-in person, or NULL when the request set no one. NULL matches no
-- row in any policy, so a request that forgets to set it sees nothing.
CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app.current_user_id() TO app_user;

-- The database's clock, not the client's: an insert's created_at (and
-- updated_at, for tables that have one) is whatever the database says it is,
-- whatever the insert sent. Prisma always sends both.
CREATE FUNCTION app.stamp_insert() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.created_at := now();
  IF TG_ARGV[0] = 'with_updated_at' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

-- Keeps updated_at true for every write, not only those made through Prisma.
CREATE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Stored lowercase, so the plain unique index above is case-insensitive and
-- guest orders can be matched by email with an ordinary equality.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK (email = lower(email)),
  ADD CONSTRAINT "users_email_length" CHECK (length(email) BETWEEN 3 AND 320),
  ADD CONSTRAINT "users_display_name_length"
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 100);

CREATE TRIGGER users_stamp_insert
  BEFORE INSERT ON "users"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_insert('with_updated_at');

CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Row-level security: a person reads, creates and renames only their own
-- row. The email is written once, from the verified session, and app_user
-- has no grant to change it or to delete the row; account deletion runs as
-- the owner, in server code.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- created_at and updated_at are in the insert grant only because Prisma
-- always sends them; the stamp trigger overwrites both.
GRANT SELECT,
  INSERT (id, email, display_name, created_at, updated_at),
  UPDATE (display_name)
  ON "users" TO app_user;

CREATE POLICY users_select_own ON "users"
  FOR SELECT TO app_user
  USING (id = app.current_user_id());

CREATE POLICY users_insert_own ON "users"
  FOR INSERT TO app_user
  WITH CHECK (id = app.current_user_id());

CREATE POLICY users_update_own ON "users"
  FOR UPDATE TO app_user
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());

-- On Supabase, its API roles get privileges on every new public table by
-- default. We do not use its data API, so they get nothing here. The roles
-- do not exist in local Postgres, hence the check.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.users FROM %I', r);
    END IF;
  END LOOP;
END
$$;
