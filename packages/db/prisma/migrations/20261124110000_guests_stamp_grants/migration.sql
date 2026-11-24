-- Prisma always sends a value for a column whose default is now(), so the
-- insert grants name those columns too. What it sends is never kept: the
-- stamp triggers set the time (and who) from the database itself.
GRANT INSERT (checked_in_at) ON "check_ins" TO app_user;
GRANT INSERT (created_at) ON "blocked_contacts" TO app_user;
GRANT INSERT (at, details) ON "audit_log" TO app_user;
