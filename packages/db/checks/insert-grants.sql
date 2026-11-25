-- Fails when app_user may insert into a table but not into every column
-- Prisma names on insert: those with a default Prisma fills in itself (a
-- literal or now()). Such an insert is refused with "permission denied for
-- table", and only when someone first tries it. Run in CI on a database
-- built by the migrations.
--
-- Left out: defaults the database alone fills in (ids from
-- gen_random_uuid(), sequences and app.* functions), which Prisma leaves out.
DO $$
DECLARE
  gaps text;
BEGIN
  SELECT string_agg(format('%s.%s', c.table_name, c.column_name), ', '
                    ORDER BY c.table_name, c.column_name)
  INTO gaps
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_default IS NOT NULL
    AND c.is_identity = 'NO'
    AND c.column_default !~ '(gen_random_uuid|nextval|app\.)'
    AND EXISTS (
      SELECT 1 FROM information_schema.column_privileges p
      WHERE p.grantee = 'app_user' AND p.privilege_type = 'INSERT'
        AND p.table_schema = 'public' AND p.table_name = c.table_name)
    AND NOT has_column_privilege(
      'app_user', format('public.%I', c.table_name), c.column_name, 'INSERT');
  IF gaps IS NOT NULL THEN
    RAISE EXCEPTION 'app_user cannot insert: %', gaps
      USING HINT = 'Grant INSERT on these columns in a migration. If the database owns the value, set it in a BEFORE INSERT trigger too.';
  END IF;
END
$$;
