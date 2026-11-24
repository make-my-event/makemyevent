-- Profession joins the starting form: a required dropdown, removable like
-- phone. New events get it from app.start_form(); events made before get it
-- at the end of their form, if they have room and no profession question.

CREATE OR REPLACE FUNCTION app.profession_settings() RETURNS jsonb
  LANGUAGE sql VOLATILE
  SET search_path = pg_catalog, public
  AS $$
    -- Option ids: eight lowercase hex characters, as packages/core expects
    -- (/^[a-z0-9]{1,16}$/), different for every form.
    SELECT jsonb_build_object(
      'options', jsonb_build_array(
        jsonb_build_object('id', substr(md5(random()::text), 1, 8), 'label', 'Student'),
        jsonb_build_object('id', substr(md5(random()::text), 1, 8), 'label', 'Working professional'),
        jsonb_build_object('id', substr(md5(random()::text), 1, 8), 'label', 'Freelancer / Self-employed')),
      'allowOther', true)
  $$;

REVOKE ALL ON FUNCTION app.profession_settings() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.start_form() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  INSERT INTO public.form_fields
    (event_id, kind, core, label, placeholder, help, required, position, settings)
  VALUES
    (NEW.id, 'short_text', 'name', 'Full name', 'Your full name', '', true, 0, '{}'),
    (NEW.id, 'email', 'email', 'Email address', 'you@example.com',
      'Your pass is sent here', true, 1, '{}'),
    (NEW.id, 'phone', NULL, 'Phone number', '+91 98765 43210', '', false, 2, '{}'),
    (NEW.id, 'select', NULL, 'Profession', 'Choose one', '', true, 3,
      app.profession_settings());
  RETURN NEW;
END
$$;

-- Events made before: Profession at the end of the form, unless the form is
-- full or already asks it. Their version goes up, so a builder left open
-- on the old form can't save over this.
WITH targets AS (
  SELECT e.id, coalesce(max(f.position), -1) + 1 AS next
  FROM events e
  LEFT JOIN form_fields f ON f.event_id = e.id AND f.archived_at IS NULL
  GROUP BY e.id
  HAVING coalesce(max(f.position), -1) + 1 <= 59
    AND NOT bool_or(coalesce(lower(btrim(f.label)) = 'profession', false))
), added AS (
  INSERT INTO form_fields
    (event_id, kind, label, placeholder, help, required, position, settings)
  SELECT id, 'select', 'Profession', 'Choose one', '', true, next,
    app.profession_settings()
  FROM targets
  RETURNING event_id
)
UPDATE events SET form_version = form_version + 1
WHERE id IN (SELECT event_id FROM added);
