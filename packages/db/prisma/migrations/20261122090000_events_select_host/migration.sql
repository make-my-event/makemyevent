-- Fixes reading back a just-created event.
--
-- 20261121121125_event_team made events_select ask app.on_team(id). That
-- function reads events itself, and inside the INSERT ... RETURNING that
-- creates an event it cannot yet see the new row, so the policy refused the
-- host their own new event and Create Event failed. The host's own rows are
-- matched directly again, on the row itself; the team keeps app.on_team.

DROP POLICY events_select ON "events";
CREATE POLICY events_select ON "events"
  FOR SELECT TO app_user
  USING (
    status <> 'draft'
    OR host_user_id = app.current_user_id()
    OR app.on_team(id)
  );
