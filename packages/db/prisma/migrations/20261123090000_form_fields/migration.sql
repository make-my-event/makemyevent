-- The registration form: the questions a guest answers when they register,
-- one row each, in order. The rules for a whole form (conditions only look
-- up the form, options exist, and so on) are checked by checkForm in
-- packages/core before every save; the rules for a single row are checked
-- here as well, so no write can store a field that makes no sense.

-- ---------------------------------------------------------------------------
-- form_fields
-- ---------------------------------------------------------------------------

CREATE TABLE "form_fields" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "kind" text NOT NULL,
  -- name or email: every form has one of each, made with the event and
  -- never removed. Stored on the registration itself, not as an answer.
  "core" text,
  "label" text NOT NULL,
  "placeholder" text NOT NULL DEFAULT '',
  "help" text NOT NULL DEFAULT '',
  "required" boolean NOT NULL DEFAULT false,
  -- 0 to 59 while on the form. Empty once archived.
  "position" integer,
  -- Options and validation, shaped by the kind (FieldSettings).
  "settings" jsonb NOT NULL DEFAULT '{}',
  -- "Show if" conditions (ShowIf), or empty: always shown.
  "show_if" jsonb,
  -- Set when a field that guests have answered is deleted: off the form,
  -- its answers kept. A field nobody answered is deleted outright.
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "form_fields_event_id_fkey" FOREIGN KEY ("event_id")
    REFERENCES "events" ("id") ON DELETE CASCADE,
  -- Checked when the save commits, so a reorder can pass through a moment
  -- where two fields share a place. Archived fields have no place, and
  -- empty places never clash.
  CONSTRAINT "form_fields_event_id_position_key" UNIQUE ("event_id", "position")
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "form_fields_event_id_core_key" UNIQUE ("event_id", "core"),

  CONSTRAINT "form_fields_kind" CHECK (kind IN (
    'short_text', 'long_text', 'email', 'phone', 'number', 'select', 'radio',
    'checkboxes', 'yes_no', 'date', 'url', 'consent', 'file', 'heading')),
  CONSTRAINT "form_fields_core" CHECK (
    core IS NULL
    OR (core = 'name' AND kind = 'short_text')
    OR (core = 'email' AND kind = 'email')),
  -- Name and email are asked of everyone, always.
  CONSTRAINT "form_fields_core_fixed" CHECK (
    core IS NULL OR (required AND show_if IS NULL AND archived_at IS NULL)),
  CONSTRAINT "form_fields_heading" CHECK (kind <> 'heading' OR NOT required),
  CONSTRAINT "form_fields_label" CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  CONSTRAINT "form_fields_placeholder" CHECK (length(placeholder) <= 150),
  CONSTRAINT "form_fields_help" CHECK (length(help) <= 300),
  CONSTRAINT "form_fields_position" CHECK (
    (archived_at IS NULL AND position BETWEEN 0 AND 59)
    OR (archived_at IS NOT NULL AND position IS NULL)),
  CONSTRAINT "form_fields_settings" CHECK (
    jsonb_typeof(settings) = 'object' AND pg_column_size(settings) <= 16384),
  CONSTRAINT "form_fields_show_if" CHECK (
    show_if IS NULL
    OR (jsonb_typeof(show_if) = 'object' AND pg_column_size(show_if) <= 8192))
);

-- The unique (event_id, position) key serves "this event's form, in order";
-- no other index is needed.

CREATE TRIGGER form_fields_stamp_insert
  BEFORE INSERT ON "form_fields"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_insert('with_updated_at');

CREATE TRIGGER form_fields_touch_updated_at
  BEFORE UPDATE ON "form_fields"
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- events.form_version: two people editing one form
-- ---------------------------------------------------------------------------

-- Raised by one on every save of the form. A save names the version it was
-- made from; if the form has moved on since, the save is refused instead of
-- overwriting someone else's work.
ALTER TABLE "events"
  ADD COLUMN "form_version" bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT "events_form_version" CHECK (form_version >= 1);

GRANT UPDATE (form_version) ON "events" TO app_user;

-- ---------------------------------------------------------------------------
-- Every event starts with name, email and phone
-- ---------------------------------------------------------------------------

-- In the database, so no way of making an event can leave it without the
-- two fields registration depends on. Runs as the migration's owner: the
-- host's role may not write `core`, which is what keeps those two rows the
-- only core ones.
CREATE FUNCTION app.start_form() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  INSERT INTO public.form_fields
    (event_id, kind, core, label, placeholder, help, required, position)
  VALUES
    (NEW.id, 'short_text', 'name', 'Full name', 'Your full name', '', true, 0),
    (NEW.id, 'email', 'email', 'Email address', 'you@example.com',
      'Your pass is sent here', true, 1),
    (NEW.id, 'phone', NULL, 'Phone number', '+91 98765 43210', '', false, 2);
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.start_form() FROM PUBLIC;

CREATE TRIGGER events_start_form
  AFTER INSERT ON "events"
  FOR EACH ROW EXECUTE FUNCTION app.start_form();

-- The events made before this.
INSERT INTO "form_fields"
  (event_id, kind, core, label, placeholder, help, required, position)
SELECT e.id, f.kind, f.core, f.label, f.placeholder, f.help, f.required, f.position
FROM "events" e
CROSS JOIN (VALUES
  ('short_text', 'name', 'Full name', 'Your full name', '', true, 0),
  ('email', 'email', 'Email address', 'you@example.com',
    'Your pass is sent here', true, 1),
  ('phone', NULL, 'Phone number', '+91 98765 43210', '', false, 2)
) AS f (kind, core, label, placeholder, help, required, position);

-- ---------------------------------------------------------------------------
-- Who can do what
-- ---------------------------------------------------------------------------

-- Read with the event: the team in the dashboard, and guests on a published
-- event's registration page. Written by those who manage the event; a
-- volunteer cannot. `core` is never written by them, and its rows are
-- never deleted.

ALTER TABLE "form_fields" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, DELETE ON "form_fields" TO app_user;
GRANT INSERT (
  id, event_id, kind, label, placeholder, help, required, position, settings,
  show_if, created_at, updated_at
) ON "form_fields" TO app_user;
GRANT UPDATE (
  kind, label, placeholder, help, required, position, settings, show_if,
  archived_at
) ON "form_fields" TO app_user;

CREATE POLICY form_fields_select ON "form_fields"
  FOR SELECT TO app_user
  USING (app.can_see_event(event_id));

CREATE POLICY form_fields_insert ON "form_fields"
  FOR INSERT TO app_user
  WITH CHECK (app.manages_event(event_id));

CREATE POLICY form_fields_update ON "form_fields"
  FOR UPDATE TO app_user
  USING (app.manages_event(event_id))
  WITH CHECK (app.manages_event(event_id));

CREATE POLICY form_fields_delete ON "form_fields"
  FOR DELETE TO app_user
  USING (app.manages_event(event_id) AND core IS NULL);

-- Supabase's API roles get nothing, as with every other table.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.form_fields FROM %I', r);
    END IF;
  END LOOP;
END
$$;
