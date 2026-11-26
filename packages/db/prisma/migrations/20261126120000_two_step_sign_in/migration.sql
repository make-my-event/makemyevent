-- Two-step sign-in (TOTP, through Supabase MFA).
--
-- An event's owner, admins and organizers have their role only in a session
-- that has passed a second step. Until then every rule sees them as someone
-- with no role at all: they read what the public reads, and change nothing.
-- Volunteers, attendees and visitors are as before.
--
-- One exception, so someone can try the product before setting anything up:
-- a private draft. An owner may create, edit and delete a draft that no one
-- else is part of yet (no guests, no team, not even an invitation) without
-- the second step. Bringing anyone in takes it: inviting or importing a
-- guest, adding to the team, publishing. From then on the event is like any
-- other, and its owner needs it too.
--
-- The server says which it is, per transaction, in app.aal, next to
-- app.user_id and on the same trust: 'aal2' only when Supabase has just
-- confirmed the session, its token says aal2, and the account still has a
-- verified authenticator. Unset is not aal2, so code that forgets to say
-- gets nothing.
--
-- Also here: recovery codes, and the count of tries at a code. No one reads
-- or writes those tables directly; the functions below are the only way in.

-- ---------------------------------------------------------------------------
-- The level, and the roles that need it
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.has_two_step() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
  AS $$ SELECT coalesce(current_setting('app.aal', true) = 'aal2', false) $$;

REVOKE ALL ON FUNCTION app.has_two_step() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_two_step() TO app_user;

-- A draft only its owner is part of. Asked only for the owner's own events,
-- and the answer is about the event, not the person, so the definer's
-- rights reveal nothing: whoever asks about someone else's draft has no
-- role on it anyway.
CREATE FUNCTION app.is_private_draft(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = target AND e.status = 'draft'
    )
    AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.event_id = target)
    AND NOT EXISTS (SELECT 1 FROM public.event_members m WHERE m.event_id = target)
  $$;

REVOKE ALL ON FUNCTION app.is_private_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_private_draft(uuid) TO app_user;

-- on_team, manages_team, manages_event and can_see_event all ask this.
CREATE OR REPLACE FUNCTION app.team_role(target uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT r.role FROM (
      SELECT CASE
        WHEN e.host_user_id = app.current_user_id() THEN 'owner'
        ELSE (
          SELECT m.role FROM public.event_members m
          WHERE m.event_id = e.id AND m.user_id = app.current_user_id()
        )
      END AS role
      FROM public.events e
      WHERE e.id = target
    ) r
    WHERE r.role = 'volunteer' OR app.has_two_step()
      OR (r.role = 'owner' AND app.is_private_draft(target))
  $$;

-- The same answer as a list, for the policies on guests (see guest_reads).
CREATE OR REPLACE FUNCTION app.team_events() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(array_agg(id), '{}') FROM (
      SELECT e.id FROM public.events e
        WHERE e.host_user_id = app.current_user_id()
          AND (app.has_two_step() OR app.is_private_draft(e.id))
      UNION
      SELECT m.event_id FROM public.event_members m
        WHERE m.user_id = app.current_user_id()
          AND (m.role = 'volunteer' OR app.has_two_step())
    ) mine
  $$;

CREATE OR REPLACE FUNCTION app.managed_events() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(array_agg(id), '{}') FROM (
      SELECT e.id FROM public.events e
        WHERE e.host_user_id = app.current_user_id()
          AND (app.has_two_step() OR app.is_private_draft(e.id))
      UNION
      SELECT m.event_id FROM public.event_members m
        WHERE m.user_id = app.current_user_id()
          AND m.role IN ('admin', 'organizer') AND app.has_two_step()
    ) mine
  $$;

-- The three rules on events that name the host without asking team_role.
ALTER POLICY events_select ON "events"
  USING (
    status <> 'draft'
    OR (host_user_id = app.current_user_id()
        AND (app.has_two_step() OR app.is_private_draft(id)))
    OR app.on_team(id)
  );
-- A new event is a private draft.
ALTER POLICY events_insert ON "events"
  WITH CHECK (host_user_id = app.current_user_id());
ALTER POLICY events_delete ON "events"
  USING (
    host_user_id = app.current_user_id() AND status = 'draft'
    AND (app.has_two_step() OR app.is_private_draft(id))
  );

-- What brings someone else in, and so ends a private draft, takes the
-- second step whoever does it.
ALTER POLICY events_update ON "events"
  USING (app.manages_event(id))
  WITH CHECK (
    app.manages_event(id) AND (status = 'draft' OR app.has_two_step())
  );
ALTER POLICY registrations_insert ON "registrations"
  WITH CHECK (
    event_id = ANY ((SELECT app.managed_events())::uuid[])
    AND source IN ('invite', 'bulk')
    AND app.has_two_step()
  );
ALTER POLICY event_members_insert ON "event_members"
  WITH CHECK (
    app.manages_team(event_id)
    AND invited_by_id = app.current_user_id()
    AND app.has_two_step()
  );

-- Whether this person must have two-step sign-in: they host an event that is
-- more than a private draft, or are an admin or organizer of one, or are
-- invited to be. Answers for themselves only, whatever their level, so the
-- app knows whom to ask.
CREATE FUNCTION app.runs_events() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.host_user_id = app.current_user_id()
        AND NOT app.is_private_draft(e.id)
    ) OR EXISTS (
      SELECT 1 FROM public.event_members m
      WHERE m.user_id = app.current_user_id()
        AND m.role IN ('admin', 'organizer')
    ) OR EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.event_members m ON m.email = u.email
      WHERE u.id = app.current_user_id() AND m.user_id IS NULL
        AND m.role IN ('admin', 'organizer')
    )
  $$;

-- ---------------------------------------------------------------------------
-- Recovery codes: ten at a time, each used once
--
-- A code is 80 random bits, made by the server, which shows it once and sends
-- here only its SHA-256. That is hashed again with a salt of its own, so
-- what is stored is neither the code nor anything the app ever sends.
-- ---------------------------------------------------------------------------

CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "salt" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hash" BYTEA NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes"("user_id");
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_codes"
  ADD CONSTRAINT "recovery_codes_hash" CHECK (length(hash) = 32);

-- Tries at a code, per person: five, then a wait until the window ends.
CREATE TABLE "two_step_tries" (
    "user_id" UUID NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "window_ends_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "two_step_tries_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "two_step_tries" ADD CONSTRAINT "two_step_tries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No policies and no grants: closed to app_user.
ALTER TABLE "recovery_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "two_step_tries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "recovery_codes", "two_step_tries" FROM PUBLIC, app_user;

-- Counts one try before it is made, so tries at once cannot outrun the
-- count. Returns 0 to go ahead, or the seconds to wait.
CREATE FUNCTION app.count_two_step_try() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  entry public.two_step_tries;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'no one is signed in' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.two_step_tries AS t (user_id, tries, window_ends_at)
    VALUES (app.current_user_id(), 1, now() + interval '15 minutes')
  ON CONFLICT (user_id) DO UPDATE SET
    tries = CASE WHEN t.window_ends_at <= now() THEN 1 ELSE least(t.tries + 1, 6) END,
    window_ends_at = CASE WHEN t.window_ends_at <= now()
      THEN now() + interval '15 minutes' ELSE t.window_ends_at END
  RETURNING * INTO entry;
  IF entry.tries <= 5 THEN
    RETURN 0;
  END IF;
  RETURN greatest(1, ceil(extract(epoch FROM entry.window_ends_at - now())))::integer;
END
$$;

-- After a right code.
CREATE FUNCTION app.clear_two_step_tries() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF app.has_two_step() THEN
    DELETE FROM public.two_step_tries WHERE user_id = app.current_user_id();
  END IF;
END
$$;

-- Replaces the person's codes with ten new ones, given as SHA-256 in hex.
CREATE FUNCTION app.save_recovery_codes(digests text[]) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  digest text;
  new_salt uuid;
BEGIN
  IF app.current_user_id() IS NULL OR NOT app.has_two_step() THEN
    RAISE EXCEPTION 'two-step sign-in is required' USING ERRCODE = '42501';
  END IF;
  IF cardinality(digests) IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'ten codes at a time' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.recovery_codes WHERE user_id = app.current_user_id();
  FOREACH digest IN ARRAY digests LOOP
    IF digest !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'not a SHA-256' USING ERRCODE = '22023';
    END IF;
    new_salt := gen_random_uuid();
    INSERT INTO public.recovery_codes (user_id, salt, hash)
      VALUES (app.current_user_id(), new_salt,
        sha256(uuid_send(new_salt) || decode(digest, 'hex')));
  END LOOP;
  INSERT INTO public.audit_log (action) VALUES ('two_step.new_codes');
END
$$;

-- Uses one code up: true once, then false for good.
CREATE FUNCTION app.use_recovery_code(digest text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  used uuid;
BEGIN
  IF digest IS NULL OR digest !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  UPDATE public.recovery_codes SET used_at = now()
    WHERE user_id = app.current_user_id() AND used_at IS NULL
      AND hash = sha256(uuid_send(salt) || decode(digest, 'hex'))
    RETURNING id INTO used;
  IF used IS NULL THEN
    RETURN false;
  END IF;
  -- They are who they say: the setup that follows starts from no tries.
  DELETE FROM public.two_step_tries WHERE user_id = app.current_user_id();
  INSERT INTO public.audit_log (action) VALUES ('two_step.recovered');
  RETURN true;
END
$$;

CREATE FUNCTION app.recovery_codes_left() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT count(*)::integer FROM public.recovery_codes
    WHERE user_id = app.current_user_id() AND used_at IS NULL
  $$;

-- The append-only record of what else happens to a person's second step. A
-- fixed list, so nothing can be written under another name.
CREATE FUNCTION app.record_two_step(what text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF app.current_user_id() IS NULL
     OR what NOT IN ('turned_on', 'moved', 'turned_off', 'reset') THEN
    RAISE EXCEPTION 'not recorded' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.audit_log (action) VALUES ('two_step.' || what);
END
$$;

REVOKE ALL ON FUNCTION app.runs_events(), app.count_two_step_try(),
  app.clear_two_step_tries(), app.save_recovery_codes(text[]),
  app.use_recovery_code(text), app.recovery_codes_left(),
  app.record_two_step(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.runs_events(), app.count_two_step_try(),
  app.clear_two_step_tries(), app.save_recovery_codes(text[]),
  app.use_recovery_code(text), app.recovery_codes_left(),
  app.record_two_step(text) TO app_user;
