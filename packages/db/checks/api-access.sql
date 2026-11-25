-- Fails when anything in public or app is open to Supabase's web API, a table
-- has no row-level security, or the app's login can do more than become
-- app_user. Run in CI and after every deploy of the migrations. Reads the
-- catalog only.
DO $$
DECLARE
  problems text;
BEGIN
  WITH api AS (
    -- app_login too: what it can do, it does as app_user.
    SELECT rolname FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role', 'app_login')
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
    SELECT format('%s can make things in %s', rolname, nspname)
    FROM pg_namespace, pg_roles
    WHERE nspname IN ('public', 'app')
      AND rolname IN ('anon', 'authenticated', 'service_role', 'app_login', 'app_user')
      AND has_schema_privilege(rolname, nspname, 'CREATE')
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
    UNION ALL
    SELECT 'there is no app_login for the app to connect as'
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_login')
    UNION ALL
    SELECT format('app_login must not %s', what)
    FROM pg_roles, unnest(
      ARRAY['be without login', 'inherit', 'bypass row security', 'be superuser',
        'create roles', 'create databases', 'replicate'],
      ARRAY[NOT rolcanlogin, rolinherit, rolbypassrls, rolsuper,
        rolcreaterole, rolcreatedb, rolreplication]) AS t(what, yes)
    WHERE rolname = 'app_login' AND yes
    UNION ALL
    SELECT format('app_login must not be a member of %s', pg_get_userbyid(roleid))
    FROM pg_auth_members
    WHERE member = to_regrole('app_login') AND roleid IS DISTINCT FROM to_regrole('app_user')
    UNION ALL
    SELECT format('app_login must not %s app_user', what)
    FROM pg_auth_members, unnest(ARRAY['inherit from', 'be unable to become', 'grant'],
      ARRAY[inherit_option, NOT set_option, admin_option]) AS t(what, yes)
    WHERE member = to_regrole('app_login') AND roleid = to_regrole('app_user') AND yes
    UNION ALL
    SELECT 'app_login is not a member of app_user'
    WHERE to_regrole('app_login') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_auth_members
      WHERE member = to_regrole('app_login') AND roleid = to_regrole('app_user'))
    UNION ALL
    SELECT format('app_user must not be a member of %s', pg_get_userbyid(roleid))
    FROM pg_auth_members WHERE member = to_regrole('app_user')
    UNION ALL
    -- Every owner, grant and policy on the server is recorded here, whatever
    -- the schema or kind of object.
    SELECT format('%s must not %s', r.rolname, CASE d.deptype
      WHEN 'o' THEN 'own anything' ELSE 'be granted anything itself' END)
    FROM pg_shdepend d JOIN pg_roles r ON r.oid = d.refobjid
    WHERE d.refclassid = 'pg_authid'::regclass
      AND (r.rolname = 'app_login' OR r.rolname = 'app_user' AND d.deptype = 'o')
    UNION ALL
    SELECT format('app_login has no %s', setting)
    FROM pg_roles, unnest(ARRAY['statement_timeout',
      'idle_in_transaction_session_timeout']) AS setting
    WHERE rolname = 'app_login' AND NOT EXISTS (
      SELECT 1 FROM unnest(rolconfig) AS c WHERE c ~ ('^' || setting || '=[1-9]'))
  )
  SELECT string_agg(DISTINCT what, E'\n  ') INTO problems FROM found;
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION E'Open access:\n  %', problems;
  END IF;
END
$$;
