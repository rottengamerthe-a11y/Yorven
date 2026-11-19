-- ============================================================================
-- YORVEN CONTACT API RATE LIMITING (HOTFIX: btrim FUNCTION RESOLUTION)
-- Migration: 20261119120000_fix_contact_rate_limit_trim.sql
-- Description: Corrects invalid pg_catalog.trim(text) to pg_catalog.btrim(text)
-- Schema: auth_util
-- Owner: postgres
-- ============================================================================

-- Atomic RPC executed exclusively by service_role with empty search_path
CREATE OR REPLACE FUNCTION auth_util.check_and_increment_rate_limit(
    p_ip TEXT,
    p_window_ms INT DEFAULT 900000,
    p_max_requests INT DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_record RECORD;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_window_interval INTERVAL := (p_window_ms || ' milliseconds')::interval;
BEGIN
    -- 1. Input parameter validation: raise PostgreSQL exceptions on invalid arguments
    IF p_ip IS NULL OR pg_catalog.length(pg_catalog.btrim(p_ip)) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip must not be null or whitespace-only';
    END IF;

    IF pg_catalog.length(p_ip) > 128 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip exceeds maximum length of 128 characters';
    END IF;

    IF p_window_ms IS NULL OR p_window_ms <= 0 OR p_window_ms > 86400000 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_window_ms must be a positive integer not exceeding 86400000 (24 hours)';
    END IF;

    IF p_max_requests IS NULL OR p_max_requests <= 0 OR p_max_requests > 1000 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_max_requests must be a positive integer not exceeding 1000';
    END IF;

    -- 2. Opportunistic data retention prune: purge records older than 24 hours (~2% of requests)
    IF (pg_catalog.random() < 0.02) THEN
        DELETE FROM auth_util.contact_rate_limits
        WHERE window_start < v_now - interval '24 hours';
    END IF;

    INSERT INTO auth_util.contact_rate_limits (ip, request_count, window_start)
    VALUES (p_ip, 1, v_now)
    ON CONFLICT (ip) DO UPDATE
    SET request_count = CASE
            WHEN auth_util.contact_rate_limits.window_start + v_window_interval < v_now THEN 1
            ELSE auth_util.contact_rate_limits.request_count + 1
        END,
        window_start = CASE
            WHEN auth_util.contact_rate_limits.window_start + v_window_interval < v_now THEN v_now
            ELSE auth_util.contact_rate_limits.window_start
        END
    RETURNING request_count INTO v_record;

    IF v_record.request_count > p_max_requests THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

ALTER FUNCTION auth_util.check_and_increment_rate_limit(TEXT, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION auth_util.check_and_increment_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_util.check_and_increment_rate_limit(TEXT, INT, INT) TO service_role;
