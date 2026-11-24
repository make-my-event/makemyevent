-- Anyone on the team may add to the audit log, not only those who manage
-- the event: a volunteer who undoes a check-in is recorded too. The actor
-- and time are stamped by the database, so an entry can only ever say what
-- its writer did; and nothing can change or remove one.
DROP POLICY audit_log_insert ON "audit_log";
CREATE POLICY audit_log_insert ON "audit_log"
  FOR INSERT TO app_user WITH CHECK (app.on_team(event_id));
