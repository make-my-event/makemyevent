-- An event's team: people besides its host who help run it, each with a
-- role, and the access rules that now follow those roles.
--
--   owner      the host (events.host_user_id): everything
--   admin      everything, the team included, except deleting the event
--   organizer  the event page, tickets and guests; not the team
--   volunteer  the guest list and check-in only
--
-- Tables and keys below were generated from schema.prisma; the rules Prisma
-- cannot express (checks, triggers, functions, grants, row-level security)
-- follow them.

-- CreateTable
CREATE TABLE "event_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "user_id" UUID,
    "joined_at" TIMESTAMPTZ,
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_members_email_idx" ON "event_members"("email");

-- CreateIndex
CREATE INDEX "event_members_user_id_idx" ON "event_members"("user_id");

-- CreateIndex
CREATE INDEX "event_members_invited_by_id_idx" ON "event_members"("invited_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_members_event_id_email_key" ON "event_members"("event_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "event_members_event_id_user_id_key" ON "event_members"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Checks and triggers
-- ---------------------------------------------------------------------------

ALTER TABLE "event_members"
  ADD CONSTRAINT "event_members_role"
    CHECK (role IN ('admin', 'organizer', 'volunteer')),
  ADD CONSTRAINT "event_members_email"
    CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 320),
  ADD CONSTRAINT "event_members_display_name_length"
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
  -- Joined means both: who, and when.
  ADD CONSTRAINT "event_members_joined"
    CHECK ((user_id IS NULL) = (joined_at IS NULL));

CREATE TRIGGER event_members_stamp_insert
  BEFORE INSERT ON "event_members"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_insert('with_updated_at');

CREATE TRIGGER event_members_touch_updated_at
  BEFORE UPDATE ON "event_members"
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Roles
--
-- app.team_role(event) is the one place that says who someone is to an
-- event; every rule below asks it. It reads events and event_members with
-- the definer's rights: the policies on those very tables call it, and a
-- policy that read them as the caller would call itself without end. It
-- only ever answers for app.current_user_id(), so the rights it borrows
-- cannot be pointed at anyone else; search_path is pinned so they cannot
-- be borrowed through a planted object either.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.team_role(target uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE
      WHEN e.host_user_id = app.current_user_id() THEN 'owner'
      ELSE (
        SELECT m.role FROM public.event_members m
        WHERE m.event_id = e.id AND m.user_id = app.current_user_id()
      )
    END
    FROM public.events e
    WHERE e.id = target
  $$;

-- On the team in any role: sees the event, draft or not, and its guests.
CREATE FUNCTION app.on_team(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT app.team_role(target) IS NOT NULL $$;

-- Manages the team: adds, changes and removes members.
CREATE FUNCTION app.manages_team(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT coalesce(app.team_role(target) IN ('owner', 'admin'), false) $$;

-- Was the host alone; now the roles that run the event. Every policy that
-- already asks it (links, days, tickets, invites) widens with it.
CREATE OR REPLACE FUNCTION app.manages_event(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(app.team_role(target) IN ('owner', 'admin', 'organizer'), false)
  $$;

CREATE OR REPLACE FUNCTION app.can_see_event(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = target AND e.status <> 'draft'
    ) OR app.on_team(target)
  $$;

-- Turns this person's invitations into memberships: every row invited by
-- the email on their own users row (written once, from the session the
-- server verified) that no one has claimed. The only way user_id is set.
-- An event they are already on is skipped, not doubled.
CREATE FUNCTION app.claim_invites() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  claimed integer;
BEGIN
  UPDATE public.event_members m
    SET user_id = u.id, joined_at = now()
    FROM public.users u
    WHERE u.id = app.current_user_id()
      AND m.email = u.email
      AND m.user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.event_members x
        WHERE x.event_id = m.event_id AND x.user_id = u.id
      );
  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END
$$;

REVOKE ALL ON FUNCTION app.team_role(uuid), app.on_team(uuid),
  app.manages_team(uuid), app.claim_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.team_role(uuid), app.on_team(uuid),
  app.manages_team(uuid), app.claim_invites() TO app_user;

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

-- events: the team sees its drafts; owner, admin and organizer edit. Deleting
-- stays the host's alone (events_delete is unchanged), and host_user_id is
-- in no update grant, so no one can take the event over.
DROP POLICY events_select ON "events";
CREATE POLICY events_select ON "events"
  FOR SELECT TO app_user
  USING (status <> 'draft' OR app.on_team(id));

DROP POLICY events_update ON "events";
CREATE POLICY events_update ON "events"
  FOR UPDATE TO app_user
  USING (app.manages_event(id))
  WITH CHECK (app.manages_event(id));

-- registrations: the whole team reads its event's guests (volunteers check
-- them in); an attendee still reads their own.
DROP POLICY registrations_select ON "registrations";
CREATE POLICY registrations_select ON "registrations"
  FOR SELECT TO app_user
  USING (
    app.on_team(event_id)
    OR (user_id IS NOT NULL AND user_id = app.current_user_id())
  );

-- users: besides their own row, a member reads the row of the host of an
-- event they are on, for the owner's name in the Team card.
CREATE POLICY users_select_team_host ON "users"
  FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.host_user_id = users.id AND app.on_team(e.id)
    )
  );

-- event_members: the team reads it; owner and admin write it. user_id and
-- joined_at are in no grant: only app.claim_invites() sets them. Anyone may
-- leave a team they are on.
ALTER TABLE "event_members" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, DELETE ON "event_members" TO app_user;
-- created_at and updated_at only because Prisma always sends them; the
-- stamp trigger overwrites both.
GRANT INSERT (event_id, email, display_name, role, invited_by_id,
  created_at, updated_at) ON "event_members" TO app_user;
GRANT UPDATE (display_name, role) ON "event_members" TO app_user;

CREATE POLICY event_members_select ON "event_members"
  FOR SELECT TO app_user
  USING (app.on_team(event_id) OR user_id = app.current_user_id());

CREATE POLICY event_members_insert ON "event_members"
  FOR INSERT TO app_user
  WITH CHECK (
    app.manages_team(event_id)
    AND invited_by_id = app.current_user_id()
  );

CREATE POLICY event_members_update ON "event_members"
  FOR UPDATE TO app_user
  USING (app.manages_team(event_id))
  WITH CHECK (app.manages_team(event_id));

CREATE POLICY event_members_delete ON "event_members"
  FOR DELETE TO app_user
  USING (app.manages_team(event_id) OR user_id = app.current_user_id());

-- Supabase's API roles get nothing, as with every other table.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.event_members FROM %I', r);
    END IF;
  END LOOP;
END
$$;
