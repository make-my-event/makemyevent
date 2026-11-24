-- The Guests tab: each guest's answers, a ticket code to show at the door,
-- how they joined, check-ins, a per-event blocklist, and an append-only
-- audit log for the privileged things done to guests.

-- ---------------------------------------------------------------------------
-- Search: trigram indexes, for "contains" on names and emails
-- ---------------------------------------------------------------------------

-- Supabase keeps extensions in their own schema; so does this, everywhere.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- registrations: a code, where they came from, the last ticket email
-- ---------------------------------------------------------------------------

-- A ticket code a person can read out or type: MME- then two groups of four
-- from Crockford's alphabet (no I, L, O or U, so nothing is misread), 40
-- random bits from gen_random_uuid(). Not the pass itself: the QR pass is a
-- signed token. The unique key below catches the rare repeat, and the
-- writer tries again.
CREATE FUNCTION app.new_ticket_code() RETURNS text
  LANGUAGE plpgsql VOLATILE
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  n bigint := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))::bit(40)::bigint;
  code text := '';
BEGIN
  FOR i IN 1..8 LOOP
    code := substr(alphabet, (n % 32)::int + 1, 1) || code;
    n := n / 32;
  END LOOP;
  RETURN 'MME-' || substr(code, 1, 4) || '-' || substr(code, 5, 4);
END
$$;

GRANT EXECUTE ON FUNCTION app.new_ticket_code() TO app_user;

ALTER TABLE "registrations"
  ADD COLUMN "ticket_code" text NOT NULL DEFAULT app.new_ticket_code(),
  -- self: registered on the event page; invite: added by the team; bulk:
  -- from an imported file.
  ADD COLUMN "source" text NOT NULL DEFAULT 'self',
  ADD COLUMN "invited_by_id" uuid,
  -- When the pass was last emailed: Resend is limited by it.
  ADD COLUMN "ticket_sent_at" timestamptz,
  ADD CONSTRAINT "registrations_ticket_code_key" UNIQUE ("ticket_code"),
  -- The target of composite keys that keep a check-in or an answer on a
  -- registration of their own event.
  ADD CONSTRAINT "registrations_id_event_id_key" UNIQUE ("id", "event_id"),
  ADD CONSTRAINT "registrations_ticket_code" CHECK (
    ticket_code ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  ADD CONSTRAINT "registrations_source" CHECK (
    source IN ('self', 'invite', 'bulk')),
  ADD CONSTRAINT "registrations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id")
    REFERENCES "users" ("id") ON DELETE SET NULL;

CREATE INDEX "registrations_invited_by_id_idx" ON "registrations" ("invited_by_id");
-- "Contains" search within an event, on name and email.
CREATE INDEX "registrations_attendee_name_trgm_idx" ON "registrations"
  USING gin ("attendee_name" extensions.gin_trgm_ops);
CREATE INDEX "registrations_attendee_email_trgm_idx" ON "registrations"
  USING gin ("attendee_email" extensions.gin_trgm_ops);
-- The Invites card's count, and the "Invited" filter.
CREATE INDEX "registrations_event_id_source_idx" ON "registrations" ("event_id", "source");

-- ---------------------------------------------------------------------------
-- registration_answers: a guest's answers to the form
-- ---------------------------------------------------------------------------

CREATE TABLE "registration_answers" (
  "registration_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "field_id" uuid NOT NULL,
  -- As packages/core's Answer: text, an option id, option ids, true.
  "value" jsonb NOT NULL,
  -- What they wrote for "Other", when they chose it.
  "other_text" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "registration_answers_pkey" PRIMARY KEY ("registration_id", "field_id"),
  CONSTRAINT "registration_answers_registration_fkey"
    FOREIGN KEY ("registration_id", "event_id")
    REFERENCES "registrations" ("id", "event_id") ON DELETE CASCADE,
  -- A field with answers is archived, never deleted.
  CONSTRAINT "registration_answers_field_id_fkey" FOREIGN KEY ("field_id")
    REFERENCES "form_fields" ("id") ON DELETE RESTRICT,
  CONSTRAINT "registration_answers_value" CHECK (
    jsonb_typeof(value) IN ('string', 'array', 'boolean')
    AND pg_column_size(value) <= 20000),
  CONSTRAINT "registration_answers_other_text" CHECK (
    other_text IS NULL OR length(other_text) <= 300)
);

-- "Has anyone answered this field?", for the Form Builder.
CREATE INDEX "registration_answers_field_id_idx" ON "registration_answers" ("field_id");
CREATE INDEX "registration_answers_event_id_idx" ON "registration_answers" ("event_id");

CREATE TRIGGER registration_answers_touch_updated_at
  BEFORE UPDATE ON "registration_answers"
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- check_ins: who was let in, on which day, by whom
-- ---------------------------------------------------------------------------

CREATE TABLE "check_ins" (
  "id" bigint GENERATED ALWAYS AS IDENTITY,
  "registration_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  -- The day, for an event with days; empty for one without.
  "event_day_id" bigint,
  "checked_in_at" timestamptz NOT NULL DEFAULT now(),
  "checked_in_by" uuid,
  -- manual: from the Guests tab; scan: from Scan QR.
  "method" text NOT NULL DEFAULT 'manual',

  CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_ins_registration_fkey" FOREIGN KEY ("registration_id", "event_id")
    REFERENCES "registrations" ("id", "event_id") ON DELETE CASCADE,
  CONSTRAINT "check_ins_event_day_fkey" FOREIGN KEY ("event_day_id", "event_id")
    REFERENCES "event_days" ("id", "event_id") ON DELETE CASCADE,
  CONSTRAINT "check_ins_checked_in_by_fkey" FOREIGN KEY ("checked_in_by")
    REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "check_ins_method" CHECK (method IN ('manual', 'scan')),
  -- Once per guest per day; once in all for an event without days.
  CONSTRAINT "check_ins_once" UNIQUE NULLS NOT DISTINCT ("registration_id", "event_day_id")
);

-- The checked-in count and filter for an event.
CREATE INDEX "check_ins_event_id_idx" ON "check_ins" ("event_id");
CREATE INDEX "check_ins_event_day_id_idx" ON "check_ins" ("event_day_id");
CREATE INDEX "check_ins_checked_in_by_idx" ON "check_ins" ("checked_in_by");

-- The database's clock and the person signed in, never what was sent.
CREATE FUNCTION app.stamp_check_in() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.checked_in_at := now();
  NEW.checked_in_by := app.current_user_id();
  RETURN NEW;
END
$$;

CREATE TRIGGER check_ins_stamp
  BEFORE INSERT ON "check_ins"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_check_in();

-- ---------------------------------------------------------------------------
-- blocked_contacts: emails and phone numbers that can't register
-- ---------------------------------------------------------------------------

CREATE TABLE "blocked_contacts" (
  "id" bigint GENERATED ALWAYS AS IDENTITY,
  "event_id" uuid NOT NULL,
  "kind" text NOT NULL,
  -- Email lowercased; phone as +digits (E.164).
  "value" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "blocked_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "blocked_contacts_event_id_fkey" FOREIGN KEY ("event_id")
    REFERENCES "events" ("id") ON DELETE CASCADE,
  CONSTRAINT "blocked_contacts_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "blocked_contacts_once" UNIQUE ("event_id", "kind", "value"),
  CONSTRAINT "blocked_contacts_value" CHECK (
    (kind = 'email' AND value = lower(value) AND value ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
      AND length(value) <= 320)
    OR (kind = 'phone' AND value ~ '^\+[1-9][0-9]{6,14}$'))
);

CREATE INDEX "blocked_contacts_created_by_idx" ON "blocked_contacts" ("created_by");

CREATE FUNCTION app.stamp_blocked_contact() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.created_at := now();
  NEW.created_by := app.current_user_id();
  RETURN NEW;
END
$$;

CREATE TRIGGER blocked_contacts_stamp
  BEFORE INSERT ON "blocked_contacts"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_blocked_contact();

-- ---------------------------------------------------------------------------
-- audit_log: append-only record of privileged actions
-- ---------------------------------------------------------------------------

CREATE TABLE "audit_log" (
  "id" bigint GENERATED ALWAYS AS IDENTITY,
  -- Kept when the event goes: the record outlives what it records.
  "event_id" uuid,
  "actor_id" uuid,
  -- e.g. guests.export, guest.edit, guest.cancel, check_in.undo
  "action" text NOT NULL,
  "target_id" text,
  "details" jsonb NOT NULL DEFAULT '{}',
  "at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_log_event_id_fkey" FOREIGN KEY ("event_id")
    REFERENCES "events" ("id") ON DELETE SET NULL,
  CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id")
    REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "audit_log_action" CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  CONSTRAINT "audit_log_details" CHECK (
    jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 8192)
);

CREATE INDEX "audit_log_event_id_at_idx" ON "audit_log" ("event_id", "at" DESC);
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" ("actor_id");

CREATE FUNCTION app.stamp_audit() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.at := now();
  NEW.actor_id := app.current_user_id();
  RETURN NEW;
END
$$;

CREATE TRIGGER audit_log_stamp
  BEFORE INSERT ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_audit();

-- Append-only for everyone, the table's owner included: no grant gives
-- UPDATE or DELETE, and this stops any role that has them anyway.
CREATE FUNCTION app.audit_is_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION app.audit_is_append_only();

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

ALTER TABLE "registration_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "check_ins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

-- Answers: the team reads them with the guest; those who manage the event
-- write them (Invite guest, Edit submission).
GRANT SELECT, INSERT, UPDATE, DELETE ON "registration_answers" TO app_user;
CREATE POLICY registration_answers_select ON "registration_answers"
  FOR SELECT TO app_user USING (app.on_team(event_id));
CREATE POLICY registration_answers_write ON "registration_answers"
  FOR ALL TO app_user
  USING (app.manages_event(event_id))
  WITH CHECK (app.manages_event(event_id));

-- Check-ins: anyone on the team lets people in (volunteers run the door)
-- and can undo it; the row says who.
GRANT SELECT, DELETE ON "check_ins" TO app_user;
GRANT INSERT (registration_id, event_id, event_day_id, method) ON "check_ins" TO app_user;
CREATE POLICY check_ins_select ON "check_ins"
  FOR SELECT TO app_user USING (app.on_team(event_id));
-- Only a confirmed guest: a cancelled or waitlisted one is not let in.
CREATE POLICY check_ins_insert ON "check_ins"
  FOR INSERT TO app_user WITH CHECK (
    app.on_team(event_id)
    AND EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.id = registration_id AND r.event_id = check_ins.event_id
        AND r.status = 'confirmed'
    ));
CREATE POLICY check_ins_delete ON "check_ins"
  FOR DELETE TO app_user USING (app.on_team(event_id));

-- Blocklist: those who manage the event.
GRANT SELECT, DELETE ON "blocked_contacts" TO app_user;
GRANT INSERT (event_id, kind, value) ON "blocked_contacts" TO app_user;
CREATE POLICY blocked_contacts_all ON "blocked_contacts"
  FOR ALL TO app_user
  USING (app.manages_event(event_id))
  WITH CHECK (app.manages_event(event_id));

-- Audit log: written by those who manage the event, read by its owner and
-- admins. Never changed.
GRANT SELECT ON "audit_log" TO app_user;
GRANT INSERT (event_id, action, target_id, details) ON "audit_log" TO app_user;
CREATE POLICY audit_log_insert ON "audit_log"
  FOR INSERT TO app_user WITH CHECK (app.manages_event(event_id));
CREATE POLICY audit_log_select ON "audit_log"
  FOR SELECT TO app_user USING (app.manages_team(event_id));

-- Supabase's API roles get nothing, as with every other table.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.registration_answers, public.check_ins,
           public.blocked_contacts, public.audit_log FROM %I', r);
    END IF;
  END LOOP;
END
$$;
