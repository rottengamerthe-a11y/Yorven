-- ============================================================================
-- YORVEN SEO DASHBOARD — STEP 2.1 DESTRUCTIVE ROLLBACK SCRIPT
-- Script: rollback_step2_1.sql
--
-- WARNING: DESTRUCTIVE OPERATION!
-- This script permanently DROPS all 9 tables created in Step 2.1 and ERASES
-- all data stored within them (sessions, tokens, MFA challenges, SEO pages,
-- analytics metrics, and sync jobs/logs).
--
-- REVERSIBILITY & DEFAULT PRIVILEGE NOTICE:
-- This script drops all Step 2.1 database objects (policies, functions, schema
-- auth_util, and all 9 tables including dashboard_token_hashes and its columns)
-- cleanly using RESTRICT.
-- Exact automated restoration of pre-existing default privileges in schema
-- public cannot be guaranteed, as default ACLs vary across different host
-- baselines and Supabase templates. To prevent security vulnerabilities, this
-- script intentionally avoids broadening privileges as a shortcut (such as
-- blanket GRANT ALL to anon). Administrators must manually inspect and reapply
-- their project-specific default privileges if custom defaults were in place.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PRECONDITIONS: OBJECT IDENTITY & DEPENDENCY CHECK
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Verify schema identity and presence
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth_util') THEN
        RAISE EXCEPTION 'ROLLBACK PRECONDITION FAILED: Schema "auth_util" does not exist. Migration may not be applied.';
    END IF;

    -- Verify that target tables exist before dropping
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'active_dashboard_sessions'
    ) THEN
        RAISE EXCEPTION 'ROLLBACK PRECONDITION FAILED: Table "public.active_dashboard_sessions" does not exist.';
    END IF;

    RAISE NOTICE 'Rollback preconditions verified. Proceeding with targeted object teardown.';
END $$;

-- ----------------------------------------------------------------------------
-- 2. DROP EXACT POLICIES CREATED IN STEP 2.1
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS seo_logs_owner_select ON public.seo_sync_logs;
DROP POLICY IF EXISTS seo_jobs_owner_select ON public.seo_sync_jobs;
DROP POLICY IF EXISTS seo_ga4_owner_all ON public.seo_ga4_metrics;
DROP POLICY IF EXISTS seo_gsc_owner_all ON public.seo_search_console_metrics;
DROP POLICY IF EXISTS seo_pages_owner_all ON public.seo_pages;
DROP POLICY IF EXISTS user_roles_read_own ON public.user_roles;

-- ----------------------------------------------------------------------------
-- 3. REVOKE SPECIFIC FUNCTION & SCHEMA PRIVILEGES
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION auth_util.complete_sync_job(UUID, UUID, BIGINT, TEXT, TEXT) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.claim_sync_job(TEXT, UUID, INTEGER) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.create_sync_job(TEXT, INTEGER) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.release_refresh_lease(UUID, UUID, BIGINT) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.renew_refresh_lease(UUID, UUID, BIGINT, INTEGER) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.revoke_dashboard_session(CHAR(64), TEXT) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.get_active_session_token(CHAR(64)) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.commit_refresh_success(UUID, UUID, BIGINT, CHAR(64), TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.acquire_refresh_lease(CHAR(64), TEXT, UUID, INTEGER) FROM service_role;
REVOKE EXECUTE ON FUNCTION auth_util.is_dashboard_owner() FROM authenticated;

REVOKE USAGE ON SCHEMA auth_util FROM service_role, authenticated;

-- ----------------------------------------------------------------------------
-- 4. DROP EXACT 10 FUNCTIONS (BY EXACT SIGNATURE)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS auth_util.complete_sync_job(UUID, UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS auth_util.claim_sync_job(TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS auth_util.create_sync_job(TEXT, INTEGER);
DROP FUNCTION IF EXISTS auth_util.release_refresh_lease(UUID, UUID, BIGINT);
DROP FUNCTION IF EXISTS auth_util.renew_refresh_lease(UUID, UUID, BIGINT, INTEGER);
DROP FUNCTION IF EXISTS auth_util.revoke_dashboard_session(CHAR(64), TEXT);
DROP FUNCTION IF EXISTS auth_util.get_active_session_token(CHAR(64));
DROP FUNCTION IF EXISTS auth_util.commit_refresh_success(UUID, UUID, BIGINT, CHAR(64), TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS auth_util.acquire_refresh_lease(CHAR(64), TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS auth_util.is_dashboard_owner();

-- ----------------------------------------------------------------------------
-- 5. DROP AUTH_UTIL SCHEMA ONLY IF EMPTY (RESTRICT)
-- ----------------------------------------------------------------------------
DROP SCHEMA IF EXISTS auth_util RESTRICT;

-- ----------------------------------------------------------------------------
-- 6. DROP ALL 9 TABLES IN STRICT REVERSE-DEPENDENCY ORDER (RESTRICT)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.seo_sync_logs RESTRICT;
DROP TABLE IF EXISTS public.seo_sync_jobs RESTRICT;
DROP TABLE IF EXISTS public.seo_ga4_metrics RESTRICT;
DROP TABLE IF EXISTS public.seo_search_console_metrics RESTRICT;
DROP TABLE IF EXISTS public.seo_pages RESTRICT;
DROP TABLE IF EXISTS public.mfa_challenge_consumptions RESTRICT;
DROP TABLE IF EXISTS public.dashboard_token_hashes RESTRICT;
DROP TABLE IF EXISTS public.active_dashboard_sessions RESTRICT;
DROP TABLE IF EXISTS public.user_roles RESTRICT;

-- ----------------------------------------------------------------------------
-- 7. DEFAULT PRIVILEGES RESTORATION NOTICE
-- Schema auth_util is dropped above, which cleans up auth_util default ACLs.
-- Blanket GRANT shortcuts on schema public (such as granting ALL to anon) are
-- intentionally omitted to avoid broadening privileges. If custom default
-- privileges existed prior to migration, restore them explicitly.
-- ----------------------------------------------------------------------------

COMMIT;
