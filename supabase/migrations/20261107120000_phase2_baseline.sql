-- ============================================================================
-- YORVEN SEO DASHBOARD — STEP 2.1 BASELINE MIGRATION
-- Migration: 20261107120000_phase2_baseline.sql
-- Target: PostgreSQL 15+ (Supabase Free Tier)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. MIGRATION PRECONDITIONS & SAFEGUARD
-- ----------------------------------------------------------------------------
-- Fail closed if any target table or the auth_util schema already exists,
-- preventing silent incompatible reuse or destructive partial overwrite.
DO $$
DECLARE
    v_existing_tables TEXT[];
    v_schema_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth_util'
    ) INTO v_schema_exists;

    SELECT array_agg(table_name::text) INTO v_existing_tables
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'user_roles',
        'active_dashboard_sessions',
        'dashboard_token_hashes',
        'mfa_challenge_consumptions',
        'seo_pages',
        'seo_search_console_metrics',
        'seo_ga4_metrics',
        'seo_sync_jobs',
        'seo_sync_logs'
      );

    IF v_schema_exists THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Schema auth_util already exists. Aborting baseline migration to prevent accidental overwrite or incompatible reuse.';
    END IF;

    IF v_existing_tables IS NOT NULL AND array_length(v_existing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: One or more target tables already exist in public schema: %. Aborting baseline migration to prevent accidental overwrite or incompatible reuse.', array_to_string(v_existing_tables, ', ');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS & SCHEMAS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA auth_util;

-- ----------------------------------------------------------------------------
-- 2. USER ROLES & AUTHORIZATION
-- ----------------------------------------------------------------------------
CREATE TABLE public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 3. ACTIVE DASHBOARD SESSIONS
-- ----------------------------------------------------------------------------
CREATE TABLE public.active_dashboard_sessions (
    session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    revoked_at TIMESTAMPTZ,

    current_access_token_encrypted TEXT NOT NULL CHECK (length(trim(current_access_token_encrypted)) > 0),
    current_access_token_iv TEXT NOT NULL CHECK (current_access_token_iv ~ '^[0-9a-f]{24}$'),
    current_access_token_auth_tag TEXT NOT NULL CHECK (current_access_token_auth_tag ~ '^[0-9a-f]{32}$'),
    access_token_expires_at TIMESTAMPTZ NOT NULL,

    refresh_lease_owner TEXT CHECK (refresh_lease_owner IS NULL OR (length(trim(refresh_lease_owner)) > 0 AND length(refresh_lease_owner) <= 128)),
    refresh_lease_attempt_id UUID,
    refresh_lease_expires_at TIMESTAMPTZ,
    refresh_generation BIGINT NOT NULL DEFAULT 0 CHECK (refresh_generation >= 0),
    last_lease_attempt_id UUID,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT chk_session_lease_fields CHECK (
        (refresh_lease_attempt_id IS NULL AND refresh_lease_expires_at IS NULL AND refresh_lease_owner IS NULL) OR
        (refresh_lease_attempt_id IS NOT NULL AND refresh_lease_expires_at IS NOT NULL AND refresh_lease_owner IS NOT NULL)
    )
);

-- ----------------------------------------------------------------------------
-- 4. TOKEN-HASH REGISTRY
-- ----------------------------------------------------------------------------
CREATE TABLE public.dashboard_token_hashes (
    token_hash CHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    session_id UUID NOT NULL REFERENCES public.active_dashboard_sessions(session_id) ON DELETE CASCADE,
    token_type TEXT NOT NULL CHECK (token_type IN ('current', 'previous')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_session_token_type UNIQUE (session_id, token_type)
);

-- ----------------------------------------------------------------------------
-- 5. ATOMIC MFA CHALLENGE CONSUMPTIONS REGISTRY
-- ----------------------------------------------------------------------------
CREATE TABLE public.mfa_challenge_consumptions (
    challenge_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 6. SEO DOMAIN TABLES (9 MONITORED ROUTES & ANALYTICS)
-- ----------------------------------------------------------------------------
CREATE TABLE public.seo_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    meta_description TEXT,
    canonical_url TEXT NOT NULL CHECK (canonical_url ~ '^https?://'),
    is_indexed BOOLEAN NOT NULL DEFAULT true,
    last_crawled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.seo_search_console_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    query TEXT NOT NULL CHECK (length(trim(query)) > 0),
    clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
    impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
    ctr NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (ctr >= 0.0 AND ctr <= 1.0),
    position NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (position >= 0.0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_gsc_page_date_query UNIQUE (page_id, metric_date, query)
);

CREATE TABLE public.seo_ga4_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.seo_pages(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    sessions INTEGER NOT NULL DEFAULT 0 CHECK (sessions >= 0),
    active_users INTEGER NOT NULL DEFAULT 0 CHECK (active_users >= 0),
    bounce_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (bounce_rate >= 0.0 AND bounce_rate <= 1.0),
    engagement_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (engagement_rate >= 0.0 AND engagement_rate <= 1.0),
    avg_session_duration_seconds NUMERIC(8, 2) NOT NULL DEFAULT 0.0 CHECK (avg_session_duration_seconds >= 0.0),
    conversions INTEGER NOT NULL DEFAULT 0 CHECK (conversions >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_ga4_page_date UNIQUE (page_id, metric_date)
);

CREATE TABLE public.seo_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL CHECK (job_type IN ('gsc_daily', 'ga4_daily', 'full_resync')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'discarded_stale')),
    worker_id TEXT CHECK (worker_id IS NULL OR (length(trim(worker_id)) > 0 AND length(worker_id) <= 128)),
    lease_attempt_id UUID,
    lease_expires_at TIMESTAMPTZ,
    generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries >= 0 AND max_retries <= 10),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT chk_sync_job_state_consistency CHECK (
        (status = 'pending' AND worker_id IS NULL AND lease_attempt_id IS NULL AND lease_expires_at IS NULL AND finished_at IS NULL) OR
        (status = 'processing' AND worker_id IS NOT NULL AND lease_attempt_id IS NOT NULL AND lease_expires_at IS NOT NULL AND started_at IS NOT NULL AND finished_at IS NULL) OR
        (status = 'completed' AND worker_id IS NULL AND lease_attempt_id IS NULL AND lease_expires_at IS NULL AND finished_at IS NOT NULL) OR
        (status = 'failed' AND worker_id IS NULL AND lease_attempt_id IS NULL AND lease_expires_at IS NULL AND finished_at IS NOT NULL) OR
        (status = 'discarded_stale' AND worker_id IS NULL AND lease_attempt_id IS NULL AND lease_expires_at IS NULL AND finished_at IS NOT NULL)
    )
);

CREATE TABLE public.seo_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.seo_sync_jobs(id) ON DELETE CASCADE,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL CHECK (length(trim(message)) > 0),
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 7. PERFORMANCE & LOOKUP INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX idx_active_sessions_user
    ON public.active_dashboard_sessions(user_id);

CREATE INDEX idx_token_hashes_lookup
    ON public.dashboard_token_hashes(token_hash, expires_at);

CREATE INDEX idx_token_hashes_session
    ON public.dashboard_token_hashes(session_id);

CREATE INDEX idx_sync_jobs_queue
    ON public.seo_sync_jobs(status, created_at)
    WHERE status IN ('pending', 'processing');

CREATE INDEX idx_sync_logs_job
    ON public.seo_sync_logs(job_id);

-- ----------------------------------------------------------------------------
-- 8. IDEMPOTENT ROUTE SEEDING (9 MONITORED PUBLIC ROUTES)
-- ----------------------------------------------------------------------------
INSERT INTO public.seo_pages (path, title, canonical_url) VALUES
    ('/', 'Yorven — Private Marketing & Digital Strategy', 'https://yorven.in/'),
    ('/work', 'Work — Yorven Case Studies', 'https://yorven.in/work'),
    ('/work/payper-ai', 'Payper AI Case Study — Yorven', 'https://yorven.in/work/payper-ai'),
    ('/work/racers-vault', 'Racers Vault Case Study — Yorven', 'https://yorven.in/work/racers-vault'),
    ('/work/aurix', 'Aurix Case Study — Yorven', 'https://yorven.in/work/aurix'),
    ('/about', 'About — Yorven Agency', 'https://yorven.in/about'),
    ('/contact', 'Contact — Yorven Agency', 'https://yorven.in/contact'),
    ('/privacy', 'Privacy Policy — Yorven', 'https://yorven.in/privacy'),
    ('/terms', 'Terms of Service — Yorven', 'https://yorven.in/terms')
ON CONFLICT (path) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. RPC SPECIFICATIONS (SCHEMA: auth_util)
-- ----------------------------------------------------------------------------

-- Deep VOLATILE RLS helper with malformed-claim defense and strict fail-closed handling
CREATE OR REPLACE FUNCTION auth_util.is_dashboard_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_raw_claims TEXT;
    v_claims JSONB;
    v_sub_text TEXT;
    v_session_text TEXT;
    v_uid UUID;
    v_session_id UUID;
    v_aal TEXT;
    v_now TIMESTAMPTZ;
BEGIN
    BEGIN
        v_raw_claims := current_setting('request.jwt.claims', true);
        IF v_raw_claims IS NULL OR length(trim(v_raw_claims)) = 0 THEN
            RETURN false;
        END IF;
        v_claims := v_raw_claims::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;

    IF v_claims IS NULL OR jsonb_typeof(v_claims) <> 'object' THEN
        RETURN false;
    END IF;

    v_sub_text := v_claims->>'sub';
    v_session_text := v_claims->>'session_id';
    v_aal := v_claims->>'aal';

    -- Format validation before UUID conversion
    IF v_sub_text IS NULL OR v_sub_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
       v_session_text IS NULL OR v_session_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
       v_aal IS DISTINCT FROM 'aal2' THEN
        RETURN false;
    END IF;

    BEGIN
        v_uid := v_sub_text::uuid;
        v_session_id := v_session_text::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;

    v_now := clock_timestamp();

    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = v_uid AND ur.role = 'owner'
    ) THEN
        RETURN false;
    END IF;

    -- Strict 90-day ceiling: original_created_at <= v_now - 90 days is EXPIRED
    IF NOT EXISTS (
        SELECT 1 FROM public.active_dashboard_sessions ads
        WHERE ads.session_id = v_session_id
          AND ads.user_id = v_uid
          AND ads.revoked_at IS NULL
          AND ads.original_created_at > (v_now - interval '90 days')
    ) THEN
        RETURN false;
    END IF;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- ATOMIC REFRESH LEASE ACQUISITION WITH CONSISTENT LOCK ORDERING
-- Lock order: active_dashboard_sessions FIRST, then dashboard_token_hashes
CREATE OR REPLACE FUNCTION auth_util.acquire_refresh_lease(
    p_presented_hash CHAR(64),
    p_worker_id TEXT,
    p_lease_attempt_id UUID,
    p_lease_duration_ms INTEGER DEFAULT 12000
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_discovered_session_id UUID;
    v_token RECORD;
    v_session RECORD;
    v_now TIMESTAMPTZ;
    v_lease_expiry TIMESTAMPTZ;
BEGIN
    IF p_presented_hash IS NULL OR p_presented_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'INVALID_HASH_FORMAT');
    END IF;
    IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0 OR length(p_worker_id) > 128 THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'INVALID_WORKER_ID');
    END IF;
    IF p_lease_attempt_id IS NULL THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'INVALID_LEASE_ATTEMPT_ID');
    END IF;
    IF p_lease_duration_ms IS NULL OR p_lease_duration_ms <= 0 OR p_lease_duration_ms > 60000 THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'INVALID_LEASE_DURATION');
    END IF;

    -- STEP 1: Non-locking lookup to discover session ID
    SELECT session_id INTO v_discovered_session_id
    FROM public.dashboard_token_hashes
    WHERE token_hash = p_presented_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'INVALID_TOKEN_HASH');
    END IF;

    -- STEP 2: Lock active_dashboard_sessions FIRST (consistent global lock order)
    SELECT * INTO v_session
    FROM public.active_dashboard_sessions
    WHERE session_id = v_discovered_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'SESSION_NOT_FOUND');
    END IF;

    -- STEP 3: Capture post-lock timestamp
    v_now := clock_timestamp();

    -- STEP 4: Lock and revalidate dashboard_token_hashes SECOND
    SELECT * INTO v_token
    FROM public.dashboard_token_hashes
    WHERE token_hash = p_presented_hash AND session_id = v_discovered_session_id
    FOR UPDATE;

    IF NOT FOUND OR v_token.expires_at <= v_now THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'TOKEN_EXPIRED_OR_INVALID');
    END IF;

    -- STEP 5: Validate session state
    IF v_session.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('acquired', false, 'error', 'SESSION_REVOKED');
    END IF;

    IF v_session.original_created_at <= (v_now - interval '90 days') THEN
        UPDATE public.active_dashboard_sessions
        SET revoked_at = v_now, updated_at = v_now
        WHERE session_id = v_session.session_id;
        RETURN jsonb_build_object('acquired', false, 'error', 'SESSION_LIFETIME_EXCEEDED');
    END IF;

    -- Check lease contention
    IF v_session.refresh_lease_expires_at IS NOT NULL
       AND v_session.refresh_lease_expires_at > v_now
       AND v_session.refresh_lease_attempt_id IS DISTINCT FROM p_lease_attempt_id THEN
        RETURN jsonb_build_object(
            'acquired', false,
            'lease_held', true,
            'retry_after_ms', GREATEST(500, EXTRACT(EPOCH FROM (v_session.refresh_lease_expires_at - v_now)) * 1000)
        );
    END IF;

    v_lease_expiry := v_now + (p_lease_duration_ms || ' milliseconds')::interval;

    UPDATE public.active_dashboard_sessions
    SET refresh_lease_owner = p_worker_id,
        refresh_lease_attempt_id = p_lease_attempt_id,
        refresh_lease_expires_at = v_lease_expiry,
        updated_at = v_now
    WHERE session_id = v_session.session_id;

    RETURN jsonb_build_object(
        'acquired', true,
        'session_id', v_session.session_id,
        'user_id', v_session.user_id,
        'generation', v_session.refresh_generation,
        'is_recovery', (v_token.token_type = 'previous'),
        'lease_expires_at', v_lease_expiry
    );
END;
$$;

-- ATOMIC COMMIT SUCCESS WITH FENCING, DURABLE IDEMPOTENCY & LOCK ORDERING
-- Lock order: active_dashboard_sessions FIRST, then dashboard_token_hashes
CREATE OR REPLACE FUNCTION auth_util.commit_refresh_success(
    p_session_id UUID,
    p_lease_attempt_id UUID,
    p_expected_generation BIGINT,
    p_new_refresh_token_hash CHAR(64),
    p_encrypted_access_token TEXT,
    p_iv TEXT,
    p_auth_tag TEXT,
    p_access_token_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_now TIMESTAMPTZ;
    v_existing_token RECORD;
    v_calculated_token_expires_at TIMESTAMPTZ;
BEGIN
    -- Strict input validation
    IF p_session_id IS NULL OR
       p_lease_attempt_id IS NULL OR
       p_expected_generation IS NULL OR p_expected_generation < 0 OR
       p_new_refresh_token_hash IS NULL OR p_new_refresh_token_hash !~ '^[0-9a-f]{64}$' OR
       p_encrypted_access_token IS NULL OR length(trim(p_encrypted_access_token)) = 0 OR
       p_iv IS NULL OR p_iv !~ '^[0-9a-f]{24}$' OR
       p_auth_tag IS NULL OR p_auth_tag !~ '^[0-9a-f]{32}$' OR
       p_access_token_expires_at IS NULL OR p_access_token_expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUTS');
    END IF;

    -- STEP 1: Lock active_dashboard_sessions FIRST
    SELECT * INTO v_session
    FROM public.active_dashboard_sessions
    WHERE session_id = p_session_id
    FOR UPDATE;

    v_now := clock_timestamp();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
    END IF;

    IF v_session.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_REVOKED');
    END IF;

    IF v_session.original_created_at <= (v_now - interval '90 days') THEN
        UPDATE public.active_dashboard_sessions
        SET revoked_at = v_now, updated_at = v_now
        WHERE session_id = p_session_id;
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_LIFETIME_EXCEEDED');
    END IF;

    -- STEP 2: Strict Durable Idempotency Check
    -- Permit idempotent success only when durable attempt ID, expected generation,
    -- resulting generation (expected + 1), and current token hash all match the original successful rotation.
    IF v_session.last_lease_attempt_id = p_lease_attempt_id AND
       v_session.refresh_generation = p_expected_generation + 1 THEN
        SELECT * INTO v_existing_token
        FROM public.dashboard_token_hashes
        WHERE session_id = p_session_id AND token_type = 'current';

        IF FOUND AND v_existing_token.token_hash = p_new_refresh_token_hash THEN
            RETURN jsonb_build_object('success', true, 'idempotent', true);
        END IF;
    END IF;

    -- STEP 3: Strict fencing checks for active worker
    IF v_session.refresh_lease_attempt_id IS DISTINCT FROM p_lease_attempt_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'LEASE_ATTEMPT_MISMATCH');
    END IF;
    IF v_session.refresh_lease_expires_at IS NULL OR v_session.refresh_lease_expires_at <= v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'LEASE_EXPIRED');
    END IF;
    IF v_session.refresh_generation <> p_expected_generation THEN
        RETURN jsonb_build_object('success', false, 'error', 'GENERATION_MISMATCH');
    END IF;

    -- STEP 4: Calculate and validate replacement refresh-token expiry before modifying token registry
    -- Bounded by both the normal 30-day token lifetime and session absolute 90-day lifetime
    v_calculated_token_expires_at := LEAST(v_now + interval '30 days', v_session.original_created_at + interval '90 days');
    IF v_calculated_token_expires_at <= v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_LIFETIME_EXCEEDED');
    END IF;

    -- STEP 5: Lock dashboard_token_hashes SECOND
    PERFORM 1 FROM public.dashboard_token_hashes WHERE session_id = p_session_id FOR UPDATE;

    -- Check for hash collision in registry
    SELECT * INTO v_existing_token
    FROM public.dashboard_token_hashes
    WHERE token_hash = p_new_refresh_token_hash;

    IF FOUND THEN
        -- Any hash collision outside the strict durable idempotency match in STEP 2
        -- must fail immediately without modifying session or token state.
        RETURN jsonb_build_object('success', false, 'error', 'HASH_COLLISION');
    END IF;

    -- Rotate tokens in registry
    DELETE FROM public.dashboard_token_hashes
    WHERE session_id = p_session_id AND token_type = 'previous';

    UPDATE public.dashboard_token_hashes
    SET token_type = 'previous',
        expires_at = LEAST(v_now + interval '60 seconds', v_calculated_token_expires_at),
        updated_at = v_now
    WHERE session_id = p_session_id AND token_type = 'current';

    INSERT INTO public.dashboard_token_hashes (
        token_hash, session_id, token_type, expires_at, created_at, updated_at
    ) VALUES (
        p_new_refresh_token_hash, p_session_id, 'current', v_calculated_token_expires_at, v_now, v_now
    );

    -- Update session state
    UPDATE public.active_dashboard_sessions
    SET current_access_token_encrypted = p_encrypted_access_token,
        current_access_token_iv = p_iv,
        current_access_token_auth_tag = p_auth_tag,
        access_token_expires_at = p_access_token_expires_at,
        refresh_generation = v_session.refresh_generation + 1,
        last_lease_attempt_id = p_lease_attempt_id,
        refresh_lease_owner = NULL,
        refresh_lease_attempt_id = NULL,
        refresh_lease_expires_at = NULL,
        updated_at = v_now
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object('success', true, 'idempotent', false);
END;
$$;

-- CONCURRENCY-SAFE READ-ONLY FOLLOWER TOKEN RETRIEVAL
-- Lock order: active_dashboard_sessions FIRST (FOR SHARE), then dashboard_token_hashes (FOR SHARE)
CREATE OR REPLACE FUNCTION auth_util.get_active_session_token(
    p_presented_hash CHAR(64)
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_discovered_session_id UUID;
    v_session RECORD;
    v_token RECORD;
    v_now TIMESTAMPTZ;
BEGIN
    IF p_presented_hash IS NULL OR p_presented_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    -- STEP 1: Non-locking lookup to discover session ID
    SELECT session_id INTO v_discovered_session_id
    FROM public.dashboard_token_hashes
    WHERE token_hash = p_presented_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_or_expired');
    END IF;

    -- STEP 2: Lock active_dashboard_sessions FOR SHARE
    SELECT * INTO v_session
    FROM public.active_dashboard_sessions
    WHERE session_id = v_discovered_session_id
    FOR SHARE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_or_expired');
    END IF;

    v_now := clock_timestamp();

    -- STEP 3: Lock dashboard_token_hashes FOR SHARE
    SELECT * INTO v_token
    FROM public.dashboard_token_hashes
    WHERE token_hash = p_presented_hash AND session_id = v_discovered_session_id
    FOR SHARE;

    IF NOT FOUND OR v_token.expires_at <= v_now THEN
        RETURN jsonb_build_object('status', 'invalid_or_expired');
    END IF;

    IF v_session.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'revoked');
    END IF;

    IF v_session.original_created_at <= (v_now - interval '90 days') THEN
        RETURN jsonb_build_object('status', 'lifetime_exceeded');
    END IF;

    -- Strict access-token expiration check
    IF v_session.access_token_expires_at <= (v_now + interval '60 seconds') THEN
        IF v_session.refresh_lease_expires_at IS NOT NULL AND v_session.refresh_lease_expires_at > v_now THEN
            RETURN jsonb_build_object(
                'status', 'refresh_in_progress',
                'retry_after_sec', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_session.refresh_lease_expires_at - v_now))))
            );
        ELSE
            RETURN jsonb_build_object('status', 'refresh_required');
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'status', 'active',
        'session_id', v_session.session_id,
        'user_id', v_session.user_id,
        'encrypted_token', v_session.current_access_token_encrypted,
        'iv', v_session.current_access_token_iv,
        'auth_tag', v_session.current_access_token_auth_tag,
        'remaining_seconds', FLOOR(EXTRACT(EPOCH FROM (v_session.access_token_expires_at - v_now)))
    );
END;
$$;

-- ATOMIC SESSION REVOCATION
-- Deterministic race handling, boolean token_was_expired, and lock ordering
CREATE OR REPLACE FUNCTION auth_util.revoke_dashboard_session(
    p_presented_hash CHAR(64),
    p_reason TEXT DEFAULT 'user_logout'
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_discovered_session_id UUID;
    v_session RECORD;
    v_token RECORD;
    v_now TIMESTAMPTZ;
    v_token_was_expired BOOLEAN;
BEGIN
    IF p_presented_hash IS NULL OR p_presented_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status', 'invalid', 'revoked', false);
    END IF;

    -- STEP 1: Non-locking lookup to discover session ID
    SELECT session_id INTO v_discovered_session_id
    FROM public.dashboard_token_hashes
    WHERE token_hash = p_presented_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'revoked', false);
    END IF;

    -- STEP 2: Lock active_dashboard_sessions FIRST
    SELECT * INTO v_session
    FROM public.active_dashboard_sessions
    WHERE session_id = v_discovered_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'revoked', false);
    END IF;

    v_now := clock_timestamp();

    -- STEP 3: Lock dashboard_token_hashes SECOND
    SELECT * INTO v_token
    FROM public.dashboard_token_hashes
    WHERE token_hash = p_presented_hash AND session_id = v_discovered_session_id
    FOR UPDATE;

    -- Deterministic race handling: token was registered in STEP 1, but disappeared before STEP 3 lock
    IF NOT FOUND THEN
        IF v_session.revoked_at IS NOT NULL THEN
            RETURN jsonb_build_object(
                'status', 'already_revoked',
                'session_id', v_session.session_id,
                'token_was_expired', true,
                'revoked', false
            );
        END IF;

        -- If initially registered token identified a session, revoke that session even if the token row disappeared
        UPDATE public.active_dashboard_sessions
        SET revoked_at = v_now, updated_at = v_now
        WHERE session_id = v_session.session_id;

        DELETE FROM public.dashboard_token_hashes
        WHERE session_id = v_session.session_id;

        RETURN jsonb_build_object(
            'status', 'revoked',
            'session_id', v_session.session_id,
            'token_was_expired', true,
            'revoked', true,
            'encrypted_token', v_session.current_access_token_encrypted,
            'iv', v_session.current_access_token_iv,
            'auth_tag', v_session.current_access_token_auth_tag
        );
    END IF;

    -- Explicit JSON boolean
    v_token_was_expired := (v_token.expires_at <= v_now);

    IF v_session.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'already_revoked',
            'session_id', v_session.session_id,
            'token_was_expired', v_token_was_expired,
            'revoked', false
        );
    END IF;

    UPDATE public.active_dashboard_sessions
    SET revoked_at = v_now, updated_at = v_now
    WHERE session_id = v_session.session_id;

    DELETE FROM public.dashboard_token_hashes
    WHERE session_id = v_session.session_id;

    RETURN jsonb_build_object(
        'status', 'revoked',
        'session_id', v_session.session_id,
        'token_was_expired', v_token_was_expired,
        'revoked', true,
        'encrypted_token', v_session.current_access_token_encrypted,
        'iv', v_session.current_access_token_iv,
        'auth_tag', v_session.current_access_token_auth_tag
    );
END;
$$;

-- LEASE RENEWAL & RELEASE RPCS
CREATE OR REPLACE FUNCTION auth_util.renew_refresh_lease(
    p_session_id UUID,
    p_lease_attempt_id UUID,
    p_expected_generation BIGINT,
    p_lease_duration_ms INTEGER DEFAULT 12000
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_now TIMESTAMPTZ;
BEGIN
    IF p_session_id IS NULL OR
       p_lease_attempt_id IS NULL OR
       p_expected_generation IS NULL OR p_expected_generation < 0 OR
       p_lease_duration_ms IS NULL OR p_lease_duration_ms <= 0 OR p_lease_duration_ms > 60000 THEN
        RETURN false;
    END IF;

    SELECT * INTO v_session
    FROM public.active_dashboard_sessions
    WHERE session_id = p_session_id
    FOR UPDATE;

    v_now := clock_timestamp();

    IF NOT FOUND OR v_session.revoked_at IS NOT NULL OR
       v_session.refresh_lease_attempt_id IS DISTINCT FROM p_lease_attempt_id OR
       v_session.refresh_generation <> p_expected_generation OR
       v_session.refresh_lease_expires_at <= v_now THEN
        RETURN false;
    END IF;

    UPDATE public.active_dashboard_sessions
    SET refresh_lease_expires_at = v_now + (p_lease_duration_ms || ' milliseconds')::interval,
        updated_at = v_now
    WHERE session_id = p_session_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION auth_util.release_refresh_lease(
    p_session_id UUID,
    p_lease_attempt_id UUID,
    p_expected_generation BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
BEGIN
    IF p_session_id IS NULL OR
       p_lease_attempt_id IS NULL OR
       p_expected_generation IS NULL OR p_expected_generation < 0 THEN
        RETURN;
    END IF;

    UPDATE public.active_dashboard_sessions
    SET refresh_lease_owner = NULL,
        refresh_lease_attempt_id = NULL,
        refresh_lease_expires_at = NULL,
        updated_at = clock_timestamp()
    WHERE session_id = p_session_id
      AND refresh_lease_attempt_id = p_lease_attempt_id
      AND refresh_generation = p_expected_generation;
END;
$$;

-- SYNC-JOB COORDINATION RPCS WITH RETRY SCHEDULING
CREATE OR REPLACE FUNCTION auth_util.create_sync_job(
    p_job_type TEXT,
    p_max_retries INTEGER DEFAULT 3
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    IF p_job_type IS NULL OR p_job_type NOT IN ('gsc_daily', 'ga4_daily', 'full_resync') OR
       p_max_retries IS NULL OR p_max_retries < 0 OR p_max_retries > 10 THEN
        RAISE EXCEPTION 'INVALID_INPUTS';
    END IF;

    INSERT INTO public.seo_sync_jobs (job_type, status, max_retries)
    VALUES (p_job_type, 'pending', p_max_retries)
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION auth_util.claim_sync_job(
    p_worker_id TEXT,
    p_lease_attempt_id UUID,
    p_lease_duration_ms INTEGER DEFAULT 300000
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_job RECORD;
    v_now TIMESTAMPTZ;
    v_lease_expiry TIMESTAMPTZ;
BEGIN
    IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0 OR length(p_worker_id) > 128 OR
       p_lease_attempt_id IS NULL OR
       p_lease_duration_ms IS NULL OR p_lease_duration_ms <= 0 OR p_lease_duration_ms > 3600000 THEN
        RETURN jsonb_build_object('claimed', false, 'error', 'INVALID_INPUTS');
    END IF;

    -- Row lock candidate job
    SELECT * INTO v_job
    FROM public.seo_sync_jobs
    WHERE status = 'pending'
       OR (status = 'processing' AND lease_expires_at <= clock_timestamp())
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('claimed', false, 'error', 'NO_JOBS_AVAILABLE');
    END IF;

    v_now := clock_timestamp();

    -- Check if reclaiming a timed-out processing job (consumes exactly one retry)
    IF v_job.status = 'processing' THEN
        IF v_job.lease_expires_at > v_now THEN
            RETURN jsonb_build_object('claimed', false, 'error', 'JOB_LEASE_NOT_EXPIRED');
        END IF;

        IF v_job.retry_count >= v_job.max_retries THEN
            UPDATE public.seo_sync_jobs
            SET status = 'discarded_stale',
                worker_id = NULL,
                lease_attempt_id = NULL,
                lease_expires_at = NULL,
                finished_at = v_now,
                error_message = 'EXCEEDED_MAX_RETRIES'
            WHERE id = v_job.id;
            RETURN jsonb_build_object('claimed', false, 'error', 'JOB_DISCARDED_STALE');
        END IF;

        UPDATE public.seo_sync_jobs
        SET retry_count = retry_count + 1
        WHERE id = v_job.id;
    END IF;

    v_lease_expiry := v_now + (p_lease_duration_ms || ' milliseconds')::interval;

    UPDATE public.seo_sync_jobs
    SET status = 'processing',
        worker_id = p_worker_id,
        lease_attempt_id = p_lease_attempt_id,
        lease_expires_at = v_lease_expiry,
        generation = generation + 1,
        started_at = COALESCE(started_at, v_now)
    WHERE id = v_job.id;

    RETURN jsonb_build_object(
        'claimed', true,
        'job_id', v_job.id,
        'job_type', v_job.job_type,
        'generation', v_job.generation + 1,
        'lease_expires_at', v_lease_expiry
    );
END;
$$;

CREATE OR REPLACE FUNCTION auth_util.complete_sync_job(
    p_job_id UUID,
    p_lease_attempt_id UUID,
    p_expected_generation BIGINT,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_util, pg_temp
AS $$
DECLARE
    v_job RECORD;
    v_now TIMESTAMPTZ;
BEGIN
    IF p_job_id IS NULL OR
       p_lease_attempt_id IS NULL OR
       p_expected_generation IS NULL OR p_expected_generation < 0 OR
       p_status IS NULL OR p_status NOT IN ('completed', 'failed') THEN
        RETURN false;
    END IF;

    SELECT * INTO v_job
    FROM public.seo_sync_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    v_now := clock_timestamp();

    IF NOT FOUND OR v_job.status <> 'processing' OR
       v_job.lease_attempt_id IS DISTINCT FROM p_lease_attempt_id OR
       v_job.generation <> p_expected_generation OR
       v_job.lease_expires_at IS NULL OR
       v_job.lease_expires_at <= v_now THEN
        RETURN false;
    END IF;

    -- Consumes exactly one retry on reported failure
    IF p_status = 'failed' THEN
        IF v_job.retry_count < v_job.max_retries THEN
            UPDATE public.seo_sync_jobs
            SET status = 'pending',
                worker_id = NULL,
                lease_attempt_id = NULL,
                lease_expires_at = NULL,
                retry_count = retry_count + 1,
                error_message = p_error_message
            WHERE id = p_job_id;
            RETURN true;
        ELSE
            UPDATE public.seo_sync_jobs
            SET status = 'failed',
                worker_id = NULL,
                lease_attempt_id = NULL,
                lease_expires_at = NULL,
                finished_at = v_now,
                error_message = p_error_message
            WHERE id = p_job_id;
            RETURN true;
        END IF;
    END IF;

    -- Successful completion
    UPDATE public.seo_sync_jobs
    SET status = 'completed',
        worker_id = NULL,
        lease_attempt_id = NULL,
        lease_expires_at = NULL,
        finished_at = v_now,
        error_message = NULL
    WHERE id = p_job_id;

    RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_dashboard_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_token_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_challenge_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_search_console_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_ga4_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_sync_logs ENABLE ROW LEVEL SECURITY;

-- Owner read own role
CREATE POLICY user_roles_read_own ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Owner CRUD on SEO domain tables protected by VOLATILE is_dashboard_owner()
CREATE POLICY seo_pages_owner_all ON public.seo_pages
    FOR ALL TO authenticated
    USING (auth_util.is_dashboard_owner())
    WITH CHECK (auth_util.is_dashboard_owner());

CREATE POLICY seo_gsc_owner_all ON public.seo_search_console_metrics
    FOR ALL TO authenticated
    USING (auth_util.is_dashboard_owner())
    WITH CHECK (auth_util.is_dashboard_owner());

CREATE POLICY seo_ga4_owner_all ON public.seo_ga4_metrics
    FOR ALL TO authenticated
    USING (auth_util.is_dashboard_owner())
    WITH CHECK (auth_util.is_dashboard_owner());

CREATE POLICY seo_jobs_owner_select ON public.seo_sync_jobs
    FOR SELECT TO authenticated
    USING (auth_util.is_dashboard_owner());

CREATE POLICY seo_logs_owner_select ON public.seo_sync_logs
    FOR SELECT TO authenticated
    USING (auth_util.is_dashboard_owner());

-- ----------------------------------------------------------------------------
-- 11. PRIVILEGES, ROLES & GRANTS
-- ----------------------------------------------------------------------------
REVOKE ALL ON SCHEMA auth_util FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA auth_util TO service_role;
GRANT USAGE ON SCHEMA auth_util TO authenticated;

-- Function privileges: default deny, explicit grant
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_util FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_util.is_dashboard_owner() TO authenticated;

GRANT EXECUTE ON FUNCTION auth_util.acquire_refresh_lease(CHAR(64), TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.commit_refresh_success(UUID, UUID, BIGINT, CHAR(64), TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.renew_refresh_lease(UUID, UUID, BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.release_refresh_lease(UUID, UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.get_active_session_token(CHAR(64)) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.revoke_dashboard_session(CHAR(64), TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.create_sync_job(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.claim_sync_job(TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION auth_util.complete_sync_job(UUID, UUID, BIGINT, TEXT, TEXT) TO service_role;

-- Table privileges: explicit deny for anon, PUBLIC, and authenticated on all tables before granting intended permissions
REVOKE ALL ON public.active_dashboard_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.dashboard_token_hashes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mfa_challenge_consumptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seo_pages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seo_search_console_metrics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seo_ga4_metrics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seo_sync_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seo_sync_logs FROM PUBLIC, anon, authenticated;

-- Grant only intended permissions
GRANT ALL ON public.active_dashboard_sessions TO service_role;
GRANT ALL ON public.dashboard_token_hashes TO service_role;
GRANT ALL ON public.mfa_challenge_consumptions TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_search_console_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_ga4_metrics TO authenticated;
GRANT SELECT ON public.seo_sync_jobs TO authenticated;
GRANT SELECT ON public.seo_sync_logs TO authenticated;

GRANT ALL ON public.seo_pages TO service_role;
GRANT ALL ON public.seo_search_console_metrics TO service_role;
GRANT ALL ON public.seo_ga4_metrics TO service_role;
GRANT ALL ON public.seo_sync_jobs TO service_role;
GRANT ALL ON public.seo_sync_logs TO service_role;

-- Default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_util REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        BEGIN
            ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
        EXCEPTION WHEN insufficient_privilege THEN
            NULL;
        END;
    END IF;
END $$;

COMMIT;
