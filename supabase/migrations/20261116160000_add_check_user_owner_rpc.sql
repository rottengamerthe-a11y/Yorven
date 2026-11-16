-- ============================================================================
-- Migration: 20261116160000_add_check_user_owner_rpc.sql
-- Description: Add AAL1-compatible owner check RPC for MFA enrollment
-- Schema: auth_util
-- Security: SECURITY DEFINER, STABLE, search_path = pg_catalog, public, auth_util, pg_temp
-- RBAC: service_role execute only (PUBLIC, anon, authenticated explicitly revoked)
-- Owner: postgres
-- Status: Proposed (UNEXECUTED - strictly per Phase 2 constraints)
-- ============================================================================

CREATE OR REPLACE FUNCTION auth_util.check_user_owner(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p_user_id
          AND ur.role = 'owner'
    );
END;
$$;

-- Ensure trusted database owner
ALTER FUNCTION auth_util.check_user_owner(UUID) OWNER TO postgres;

-- Enforce strict function RBAC: default deny, explicit service_role grant
REVOKE ALL ON FUNCTION auth_util.check_user_owner(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_util.check_user_owner(UUID) TO service_role;
