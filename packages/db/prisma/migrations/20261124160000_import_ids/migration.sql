-- Bulk upload adds many guests and their answers in two statements, not
-- one round trip per guest: the server chooses each new guest's id (a
-- random uuid) so their answers can name it. A taken id fails on the
-- primary key, as any clash would.
GRANT INSERT (id) ON "registrations" TO app_user;
