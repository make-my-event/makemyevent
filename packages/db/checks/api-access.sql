-- Fails when anything in public or app is open to Supabase's web API, or a
-- table has no row-level security. Run in CI and after every deploy of the
-- migrations. Reads the catalog only.
DO $$
DECLARE
  problems text;
BEGIN
  WITH api AS (
    SELECT rolname FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  ), ours AS (
    SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, n.nspname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'app')
  ), found AS (
    SELECT format('no row-level security: %s.%s', nspname, relname) AS what
    FROM ours WHERE relkind IN ('r', 'p') AND NOT relrowsecurity
    UNION ALL
    SELECT format('%s can reach %s.%s', rolname, nspname, relname)
    FROM ours, api
    WHERE relkind IN ('r', 'p', 'v', 'm') AND (
      has_table_privilege(rolname, oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(rolname, oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
    UNION ALL
    SELECT format('%s can use sequence %s.%s', rolname, nspname, relname)
    FROM ours, api
    WHERE relkind = 'S' AND has_sequence_privilege(rolname, oid, 'USAGE,SELECT,UPDATE')
    UNION ALL
    SELECT format('%s can run %s.%s', rolname, n.nspname, p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, api
    WHERE n.nspname IN ('public', 'app') AND has_function_privilege(rolname, p.oid, 'EXECUTE')
    UNION ALL
    SELECT format('runs as its owner without a fixed search_path: %s.%s', n.nspname, p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app') AND p.prosecdef
      AND NOT coalesce(p.proconfig::text ~ 'search_path', false)
    UNION ALL
    SELECT format('new %s in public would be granted to %s',
      CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences' ELSE 'functions' END,
      api.rolname)
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace AND n.nspname = 'public'
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles g ON g.oid = a.grantee
    JOIN api ON api.rolname = g.rolname
    -- Supabase's own role keeps a default that only Supabase can change, for
    -- what it makes itself; the migrations make everything here.
    WHERE pg_get_userbyid(d.defaclrole) = current_user
    UNION ALL
    SELECT format('app_user must not be able to %s', what)
    FROM pg_roles, unnest(ARRAY['log in', 'bypass row security', 'be superuser', 'create roles'],
      ARRAY[rolcanlogin, rolbypassrls, rolsuper, rolcreaterole]) AS t(what, yes)
    WHERE rolname = 'app_user' AND yes
  )
  SELECT string_agg(DISTINCT what, E'\n  ') INTO problems FROM found;
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION E'Open access:\n  %', problems;
  END IF;
END
$$;
