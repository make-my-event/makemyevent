-- A team member's name is their own: the name on their account, not one the
-- person adding them chose. Until they join, the row holds their email.

-- Joining takes the name on their account.
CREATE OR REPLACE FUNCTION app.claim_invites() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  claimed integer;
BEGIN
  UPDATE public.event_members m
    SET user_id = u.id, joined_at = now(), display_name = u.display_name
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

-- And keeps up when they rename themselves.
CREATE FUNCTION app.follow_member_name() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  UPDATE public.event_members SET display_name = NEW.display_name
    WHERE user_id = NEW.id AND display_name IS DISTINCT FROM NEW.display_name;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app.follow_member_name() FROM PUBLIC;

CREATE TRIGGER users_follow_member_name
  AFTER UPDATE OF display_name ON "users"
  FOR EACH ROW EXECUTE FUNCTION app.follow_member_name();

-- Members who joined before this keep their names in step from now on.
UPDATE "event_members" m SET display_name = u.display_name
  FROM "users" u
  WHERE m.user_id = u.id AND m.display_name <> u.display_name;

-- No one renames a member any more: the name follows their account.
REVOKE UPDATE (display_name) ON "event_members" FROM app_user;
