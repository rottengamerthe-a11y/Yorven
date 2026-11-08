-- ============================================================================
-- YORVEN SEO DASHBOARD — STEP 2.1 EXECUTABLE VERIFICATION SUITE
-- Script: verify_step2_1.sql
-- Description: Self-contained, executable assertion suite for Step 2.1.
--              Verifies:
--              1. Schemas & effective schema privileges (including direct PUBLIC ACL inspection)
--              2. All 9 tables, expected migration owner & RLS status
--              3. Required columns (presence, NOT NULL, clock_timestamp() on updated_at)
--              4. Table constraints & performance indexes
--              5. Exactly 10 functions in auth_util (detects missing & unexpected),
--                 expected migration owner, volatility, SECURITY DEFINER & search_path
--              6. Function execution privileges:
--                 - Direct pg_proc.proacl inspection (aclexplode, acldefault('f', proowner)) for PUBLIC (grantee = 0)
--                 - has_function_privilege checks for anon, authenticated, service_role
--              7. Table privileges:
--                 - Direct pg_class.relacl inspection (aclexplode, acldefault('r', relowner)) for PUBLIC (grantee = 0)
--                 - Comprehensive has_table_privilege checks across all 7 supported privileges:
--                   * anon has zero privileges on all 9 tables
--                   * authenticated has intended CRUD on SEO domain tables, SELECT-only on sync/role tables, zero on private tables
--                   * service_role has full table privileges on all 9 tables
--              8. All 9 public route seeds
--
-- Exits with exception and clear diagnostic message if any verification fails.
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
    v_missing_tables TEXT[];
    v_missing_funcs TEXT[];
    v_unexpected_funcs TEXT[];
    v_fn RECORD;
    v_roles_exist BOOLEAN;
    v_tbl RECORD;
    v_priv TEXT;
    v_expected_owner_oid OID;
    v_expected_owner_name TEXT;
    v_supports_maintain BOOLEAN;
    v_all_privs TEXT[];
    v_seo_forbidden_privs TEXT[];
    v_sync_forbidden_privs TEXT[];
BEGIN
    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'STARTING YORVEN STEP 2.1 EXECUTABLE VERIFICATION SUITE';
    RAISE NOTICE '=======================================================';

    -- ------------------------------------------------------------------------
    -- 1. SCHEMAS & PRIVILEGES
    -- ------------------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth_util') THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Schema "auth_util" does not exist.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public') THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Schema "public" does not exist.';
    END IF;

    -- Direct ACL inspection for PUBLIC on schema auth_util
    SELECT count(*) INTO v_count
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) pe
    WHERE n.nspname = 'auth_util'
      AND pe.grantee = 0;

    IF v_count > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Direct ACL inspection detected PUBLIC (grantee=0) with privileges on schema "auth_util".';
    END IF;

    -- Verify schema privileges if Supabase roles exist
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') INTO v_roles_exist;
    IF v_roles_exist THEN
        IF has_schema_privilege('anon', 'auth_util', 'USAGE') THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: "anon" has USAGE privilege on schema "auth_util".';
        END IF;

        IF NOT has_schema_privilege('authenticated', 'auth_util', 'USAGE') THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" lacks USAGE privilege on schema "auth_util".';
        END IF;

        IF NOT has_schema_privilege('service_role', 'auth_util', 'USAGE') THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: "service_role" lacks USAGE privilege on schema "auth_util".';
        END IF;
    END IF;
    -- Establish expected migration owner from schema auth_util (created by baseline migration Step 1)
    SELECT nspowner INTO v_expected_owner_oid FROM pg_namespace WHERE nspname = 'auth_util';
    SELECT nspowner::regrole::text INTO v_expected_owner_name FROM pg_namespace WHERE nspname = 'auth_util';

    IF v_expected_owner_oid IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Unable to establish expected migration owner from schema "auth_util".';
    END IF;

    IF v_expected_owner_name IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected migration owner cannot be unprivileged role "%".', v_expected_owner_name;
    END IF;

    RAISE NOTICE '✓ 1. Schemas and schema privileges verified (including direct PUBLIC ACL inspection; expected owner: "%").', v_expected_owner_name;

    -- ------------------------------------------------------------------------
    -- 2. TABLES, OWNERSHIP & ROW LEVEL SECURITY (RLS)
    -- ------------------------------------------------------------------------
    SELECT ARRAY(
        SELECT tablename FROM (
            VALUES
                ('user_roles'),
                ('active_dashboard_sessions'),
                ('dashboard_token_hashes'),
                ('mfa_challenge_consumptions'),
                ('seo_pages'),
                ('seo_search_console_metrics'),
                ('seo_ga4_metrics'),
                ('seo_sync_jobs'),
                ('seo_sync_logs')
        ) AS expected(tablename)
        EXCEPT
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    ) INTO v_missing_tables;

    IF array_length(v_missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Missing expected tables: %', v_missing_tables;
    END IF;

    -- Verify all 9 tables are owned by the expected migration owner
    FOR v_tbl IN
        SELECT c.relname, c.relowner::regrole::text AS current_owner
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND c.relname IN (
            'user_roles', 'active_dashboard_sessions', 'dashboard_token_hashes',
            'mfa_challenge_consumptions', 'seo_pages', 'seo_search_console_metrics',
            'seo_ga4_metrics', 'seo_sync_jobs', 'seo_sync_logs'
          )
    LOOP
        IF v_tbl.current_owner <> v_expected_owner_name THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: Table "public.%" is owned by "%", expected migration owner "%".', v_tbl.relname, v_tbl.current_owner, v_expected_owner_name;
        END IF;
    END LOOP;

    -- Verify RLS is enabled on all 9 tables
    SELECT count(*) INTO v_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'user_roles', 'active_dashboard_sessions', 'dashboard_token_hashes',
        'mfa_challenge_consumptions', 'seo_pages', 'seo_search_console_metrics',
        'seo_ga4_metrics', 'seo_sync_jobs', 'seo_sync_logs'
      )
      AND rowsecurity = true;

    IF v_count <> 9 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected 9 tables with rowsecurity=true, found %', v_count;
    END IF;
    RAISE NOTICE '✓ 2. All 9 tables exist, have Row Level Security enabled, and are owned by "%".', v_expected_owner_name;

    -- ------------------------------------------------------------------------
    -- 3. REQUIRED COLUMNS & CONSTRAINTS & INDEXES
    -- ------------------------------------------------------------------------
    -- Verify updated_at column on dashboard_token_hashes (presence, NOT NULL, and clock_timestamp() default)
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dashboard_token_hashes'
      AND column_name = 'updated_at'
      AND is_nullable = 'NO'
      AND column_default LIKE '%clock_timestamp()%';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Column "updated_at" on "dashboard_token_hashes" is missing, nullable, or lacks clock_timestamp() default.';
    END IF;

    -- Verify state consistency and lease constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'seo_sync_jobs' AND constraint_name = 'chk_sync_job_state_consistency'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint "chk_sync_job_state_consistency" missing on seo_sync_jobs.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'active_dashboard_sessions' AND constraint_name = 'chk_session_lease_fields'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint "chk_session_lease_fields" missing on active_dashboard_sessions.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'dashboard_token_hashes' AND constraint_name = 'uq_session_token_type'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint "uq_session_token_type" missing on dashboard_token_hashes.';
    END IF;

    -- Verify actual unique constraint names defined in migration
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'seo_search_console_metrics' AND constraint_name = 'uq_gsc_page_date_query'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint "uq_gsc_page_date_query" missing on seo_search_console_metrics.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'seo_ga4_metrics' AND constraint_name = 'uq_ga4_page_date'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint "uq_ga4_page_date" missing on seo_ga4_metrics.';
    END IF;

    -- Check required performance indexes
    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_active_sessions_user',
        'idx_token_hashes_lookup',
        'idx_token_hashes_session',
        'idx_sync_jobs_queue',
        'idx_sync_logs_job'
      );
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected 5 performance indexes, found %', v_count;
    END IF;
    RAISE NOTICE '✓ 3. Required columns (including dashboard_token_hashes.updated_at), constraints, and performance indexes verified.';

    -- ------------------------------------------------------------------------
    -- 4. FUNCTION SPECIFICATIONS: EXACTLY 10 FUNCTIONS, OWNERSHIP, SECDEF, VOLATILE, SEARCH_PATH
    -- ------------------------------------------------------------------------
    -- A. Check for missing functions
    SELECT ARRAY(
        SELECT proname FROM (
            VALUES
                ('is_dashboard_owner'),
                ('acquire_refresh_lease'),
                ('commit_refresh_success'),
                ('renew_refresh_lease'),
                ('release_refresh_lease'),
                ('get_active_session_token'),
                ('revoke_dashboard_session'),
                ('create_sync_job'),
                ('claim_sync_job'),
                ('complete_sync_job')
        ) AS expected(proname)
        EXCEPT
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'auth_util'
    ) INTO v_missing_funcs;

    IF array_length(v_missing_funcs, 1) > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Missing expected functions in auth_util: %', v_missing_funcs;
    END IF;

    -- B. Check for unexpected functions in auth_util
    SELECT ARRAY(
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'auth_util'
        EXCEPT
        SELECT proname FROM (
            VALUES
                ('is_dashboard_owner'),
                ('acquire_refresh_lease'),
                ('commit_refresh_success'),
                ('renew_refresh_lease'),
                ('release_refresh_lease'),
                ('get_active_session_token'),
                ('revoke_dashboard_session'),
                ('create_sync_job'),
                ('claim_sync_job'),
                ('complete_sync_job')
        ) AS expected(proname)
    ) INTO v_unexpected_funcs;

    IF array_length(v_unexpected_funcs, 1) > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Unexpected functions detected in auth_util: %', v_unexpected_funcs;
    END IF;

    -- C. Exact count check (must be exactly 10 functions)
    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth_util';

    IF v_count <> 10 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected exactly 10 functions in schema "auth_util", found %', v_count;
    END IF;

    -- D. Verify all 10 auth_util functions are owned by expected migration owner
    FOR v_fn IN
        SELECT p.proname, p.proowner::regrole::text AS current_owner
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'auth_util'
    LOOP
        IF v_fn.current_owner <> v_expected_owner_name THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: Function "auth_util.%" is owned by "%", expected migration owner "%".', v_fn.proname, v_fn.current_owner, v_expected_owner_name;
        END IF;
    END LOOP;

    -- E. Verify all 10 functions are VOLATILE ('v'), SECURITY DEFINER, with fixed search_path
    FOR v_fn IN
        SELECT p.proname, p.provolatile, p.prosecdef, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'auth_util'
    LOOP
        IF v_fn.provolatile <> 'v' THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: Function auth_util.% is not VOLATILE (provolatile=%).', v_fn.proname, v_fn.provolatile;
        END IF;

        IF NOT v_fn.prosecdef THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: Function auth_util.% is not SECURITY DEFINER.', v_fn.proname;
        END IF;

        IF v_fn.proconfig IS NULL OR NOT (v_fn.proconfig::text LIKE '%search_path=pg_catalog, public, auth_util, pg_temp%') THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: Function auth_util.% does not have safe search_path configured.', v_fn.proname;
        END IF;
    END LOOP;
    RAISE NOTICE '✓ 4. All 10 functions verified (exactly 10 functions, owned by "%", VOLATILE, SECURITY DEFINER, search_path).', v_expected_owner_name;

    -- ------------------------------------------------------------------------
    -- 5. FUNCTION EXECUTION PRIVILEGES (RBAC PERIMETER)
    -- ------------------------------------------------------------------------
    -- Direct ACL inspection: Verify PUBLIC (grantee = 0) has NO EXECUTE privilege on any of the 10 auth_util functions.
    -- Uses COALESCE(p.proacl, acldefault('f', p.proowner)) to inspect explicit or default function ACLs.
    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) pe
    WHERE n.nspname = 'auth_util'
      AND pe.grantee = 0
      AND pe.privilege_type = 'EXECUTE';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Direct ACL inspection detected PUBLIC (grantee=0) with EXECUTE privilege on % auth_util function(s).', v_count;
    END IF;

    -- Verify role-specific execution privileges if Supabase roles exist
    IF v_roles_exist THEN
        -- is_dashboard_owner must be executable by authenticated, but NOT anon
        IF NOT has_function_privilege('authenticated', 'auth_util.is_dashboard_owner()', 'EXECUTE') THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" cannot execute auth_util.is_dashboard_owner().';
        END IF;

        IF has_function_privilege('anon', 'auth_util.is_dashboard_owner()', 'EXECUTE') THEN
            RAISE EXCEPTION 'VERIFICATION FAILED: "anon" has execute privilege on auth_util.is_dashboard_owner().';
        END IF;

        -- Verify all 9 administrative RPCs cannot be executed by anon or authenticated
        FOR v_fn IN
            SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'auth_util' AND p.proname <> 'is_dashboard_owner'
        LOOP
            IF has_function_privilege('anon', v_fn.oid, 'EXECUTE') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Administrative RPC auth_util.%(%) is executable by "anon"!', v_fn.proname, v_fn.args;
            END IF;

            IF has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Administrative RPC auth_util.%(%) is executable by "authenticated"!', v_fn.proname, v_fn.args;
            END IF;

            IF NOT has_function_privilege('service_role', v_fn.oid, 'EXECUTE') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Administrative RPC auth_util.%(%) is NOT executable by "service_role"!', v_fn.proname, v_fn.args;
            END IF;
        END LOOP;
    END IF;
    RAISE NOTICE '✓ 5. Effective function RBAC perimeter verified (PUBLIC grantee=0 and anon/authenticated blocked on administrative RPCs).';

    -- ------------------------------------------------------------------------
    -- 6. TABLE PRIVILEGES (LEAST PRIVILEGE)
    -- ------------------------------------------------------------------------
    -- Direct ACL inspection: Verify PUBLIC (grantee = 0) has NO table privileges on any of the 9 Step 2.1 tables.
    -- Uses COALESCE(c.relacl, acldefault('r', c.relowner)) to inspect explicit or default relation ACLs.
    SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) pe
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'user_roles', 'active_dashboard_sessions', 'dashboard_token_hashes',
        'mfa_challenge_consumptions', 'seo_pages', 'seo_search_console_metrics',
        'seo_ga4_metrics', 'seo_sync_jobs', 'seo_sync_logs'
      )
      AND pe.grantee = 0;

    IF v_count > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Direct ACL inspection detected PUBLIC (grantee=0) with table privileges on protected tables (found % granted privileges).', v_count;
    END IF;

    -- Verify role-specific table privileges if Supabase roles exist
    IF v_roles_exist THEN
        -- Detect if host PostgreSQL supports MAINTAIN table privilege (PostgreSQL 17+)
        -- Minimum supported version: PostgreSQL 15+. MAINTAIN was introduced in PostgreSQL 17 (server_version_num >= 170000).
        v_supports_maintain := (current_setting('server_version_num')::integer >= 170000);

        IF v_supports_maintain THEN
            v_all_privs := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
            v_seo_forbidden_privs := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
            v_sync_forbidden_privs := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
        ELSE
            v_all_privs := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
            v_seo_forbidden_privs := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'];
            v_sync_forbidden_privs := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
        END IF;

        -- A. Anon must have ZERO privileges on ALL 9 Step 2.1 tables
        FOR v_tbl IN
            SELECT tablename FROM (
                VALUES
                    ('user_roles'),
                    ('active_dashboard_sessions'),
                    ('dashboard_token_hashes'),
                    ('mfa_challenge_consumptions'),
                    ('seo_pages'),
                    ('seo_search_console_metrics'),
                    ('seo_ga4_metrics'),
                    ('seo_sync_jobs'),
                    ('seo_sync_logs')
            ) AS t(tablename)
        LOOP
            FOREACH v_priv IN ARRAY v_all_privs
            LOOP
                IF has_table_privilege('anon', 'public.' || v_tbl.tablename, v_priv) THEN
                    RAISE EXCEPTION 'VERIFICATION FAILED: "anon" has unauthorized % privilege on table "public.%".', v_priv, v_tbl.tablename;
                END IF;
            END LOOP;
        END LOOP;

        -- B. Authenticated on private tables: ZERO privileges
        FOR v_tbl IN
            SELECT tablename FROM (
                VALUES
                    ('active_dashboard_sessions'),
                    ('dashboard_token_hashes'),
                    ('mfa_challenge_consumptions')
            ) AS t(tablename)
        LOOP
            FOREACH v_priv IN ARRAY v_all_privs
            LOOP
                IF has_table_privilege('authenticated', 'public.' || v_tbl.tablename, v_priv) THEN
                    RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" has unauthorized % privilege on private table "public.%".', v_priv, v_tbl.tablename;
                END IF;
            END LOOP;
        END LOOP;

        -- C. Authenticated on SEO domain tables (seo_pages, seo_search_console_metrics, seo_ga4_metrics):
        -- Baseline migration grants: SELECT, INSERT, UPDATE, DELETE
        -- Forbidden: TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN (on PG 17+)
        FOR v_tbl IN
            SELECT tablename FROM (
                VALUES
                    ('seo_pages'),
                    ('seo_search_console_metrics'),
                    ('seo_ga4_metrics')
            ) AS t(tablename)
        LOOP
            FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
            LOOP
                IF NOT has_table_privilege('authenticated', 'public.' || v_tbl.tablename, v_priv) THEN
                    RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" lacks expected % privilege on SEO domain table "public.%".', v_priv, v_tbl.tablename;
                END IF;
            END LOOP;
            FOREACH v_priv IN ARRAY v_seo_forbidden_privs
            LOOP
                IF has_table_privilege('authenticated', 'public.' || v_tbl.tablename, v_priv) THEN
                    RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" has excessive % privilege on SEO domain table "public.%".', v_priv, v_tbl.tablename;
                END IF;
            END LOOP;
        END LOOP;

        -- D. Authenticated on sync coordination tables (seo_sync_jobs, seo_sync_logs) and user_roles:
        -- Baseline migration grants: SELECT only
        -- Forbidden: INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN (on PG 17+)
        FOR v_tbl IN
            SELECT tablename FROM (
                VALUES
                    ('seo_sync_jobs'),
                    ('seo_sync_logs'),
                    ('user_roles')
            ) AS t(tablename)
        LOOP
            IF NOT has_table_privilege('authenticated', 'public.' || v_tbl.tablename, 'SELECT') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" lacks expected SELECT privilege on table "public.%".', v_tbl.tablename;
            END IF;
            FOREACH v_priv IN ARRAY v_sync_forbidden_privs
            LOOP
                IF has_table_privilege('authenticated', 'public.' || v_tbl.tablename, v_priv) THEN
                    RAISE EXCEPTION 'VERIFICATION FAILED: "authenticated" has excessive % privilege on table "public.%". Must be SELECT-only.', v_priv, v_tbl.tablename;
                END IF;
            END LOOP;
        END LOOP;

        -- E. service_role must have full table access across all 9 Step 2.1 tables
        -- PostgreSQL has_table_privilege accepts individual privilege names (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN on PG 17+), not "ALL".
        FOR v_tbl IN
            SELECT tablename FROM (
                VALUES
                    ('user_roles'),
                    ('active_dashboard_sessions'),
                    ('dashboard_token_hashes'),
                    ('mfa_challenge_consumptions'),
                    ('seo_pages'),
                    ('seo_search_console_metrics'),
                    ('seo_ga4_metrics'),
                    ('seo_sync_jobs'),
                    ('seo_sync_logs')
            ) AS t(tablename)
        LOOP
            FOREACH v_priv IN ARRAY v_all_privs
            LOOP
                IF NOT has_table_privilege('service_role', 'public.' || v_tbl.tablename, v_priv) THEN
                    RAISE EXCEPTION 'VERIFICATION FAILED: "service_role" lacks % privilege on table "public.%".', v_priv, v_tbl.tablename;
                END IF;
            END LOOP;
        END LOOP;
    END IF;
    RAISE NOTICE '✓ 6. Table effective privileges verified (PUBLIC grantee=0, anon zero privileges across all 9 tables, authenticated verified against baseline grants, service_role full privileges).';

    -- ------------------------------------------------------------------------
    -- 7. PUBLIC ROUTE SEED DATA INTEGRITY (9 MONITORED ROUTES)
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_count FROM public.seo_pages;
    IF v_count <> 9 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected 9 seeded SEO pages, found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.seo_pages
    WHERE path IN (
        '/', '/work', '/work/payper-ai', '/work/racers-vault', '/work/aurix',
        '/about', '/contact', '/privacy', '/terms'
    ) AND is_indexed = true AND canonical_url ~ '^https://yorven\.in';

    IF v_count <> 9 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Seed route integrity validation failed. Matching routes: %', v_count;
    END IF;
    RAISE NOTICE '✓ 7. All 9 public marketing route seeds verified.';

    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'STEP 2.1 VERIFICATION SUITE PASSED (ALL ASSERTIONS OK)';
    RAISE NOTICE '=======================================================';
END $$;

-- ----------------------------------------------------------------------------
-- OPERATOR DIAGNOSTIC INSPECTION QUERIES
-- ----------------------------------------------------------------------------

-- A. Table & RLS status summary
SELECT
    schemaname,
    tablename,
    tableowner,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'user_roles', 'active_dashboard_sessions', 'dashboard_token_hashes',
    'mfa_challenge_consumptions', 'seo_pages', 'seo_search_console_metrics',
    'seo_ga4_metrics', 'seo_sync_jobs', 'seo_sync_logs'
  )
ORDER BY tablename;

-- B. Function definitions in auth_util
SELECT
    p.proname,
    p.proowner::regrole AS function_owner,
    p.provolatile AS volatility,
    p.prosecdef AS is_secdef,
    p.proconfig AS runtime_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'auth_util'
ORDER BY p.proname;

-- C. Exploded ACLs for auth_util functions (Auditing grantee = 0 for PUBLIC)
SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS signature,
    pe.grantor::regrole AS grantor,
    CASE WHEN pe.grantee = 0 THEN 'PUBLIC' ELSE pe.grantee::regrole::text END AS grantee,
    pe.privilege_type,
    pe.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) pe
WHERE n.nspname = 'auth_util'
ORDER BY p.proname, grantee;

-- D. Seeded SEO Pages
SELECT
    path,
    title,
    canonical_url,
    is_indexed
FROM public.seo_pages
ORDER BY path;
