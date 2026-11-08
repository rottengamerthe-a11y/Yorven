# YORVEN SEO DASHBOARD — STEP 2.1 DEPLOYMENT & VERIFICATION GUIDE

## Overview
This document guides the deployment, security verification, and administrative configuration of **Step 2.1: Supabase Baseline Schema, Constraints, RPCs, and RLS**.

---

## 1. Prerequisites & Execution Boundaries
- **Status**: Migration file `supabase/migrations/20261107120000_phase2_baseline.sql` contains the complete corrected Step 2.1 schema baseline.
- **Clean Database Execution**: The baseline migration **must be run on a clean disposable database**. The migration explicitly asserts that neither `auth_util` nor any of the 9 target tables exist in PostgreSQL, aborting immediately with `PRECONDITION_FAILED` if a conflict is detected.
- **Additive Repair Script**: `supabase/scripts/repair_step2_1_test_database.sql` is provided **only for an already-created test database** to add the `updated_at` column to `public.dashboard_token_hashes`. It should never be run on a clean database or production Supabase project.
- **Approval Boundary**: **Step 2.1 is not approved until database verification and runtime RPC tests pass.** Do not execute commands on live/production Supabase projects, and do not begin Step 2.2.
- **Target Database**: PostgreSQL 15+ (Supabase Free Tier).

---

## 2. Table Schema, Constraints & Column Requirements

### A. Token-Hash Registry (`public.dashboard_token_hashes`)
- **Required `updated_at` Column**: The `updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()` column is **required by refresh-token rotation**. The `commit_refresh_success()` RPC explicitly writes to `updated_at` during token demotion (updating current to previous) and token registration (inserting replacement current token).
- **Uniqueness**: Enforced by `CONSTRAINT uq_session_token_type UNIQUE (session_id, token_type)`.

### B. Unique Constraints on Analytics Metrics
- **Google Search Console**: Enforced via `CONSTRAINT uq_gsc_page_date_query UNIQUE (page_id, metric_date, query)` on `public.seo_search_console_metrics`.
- **Google Analytics 4**: Enforced via `CONSTRAINT uq_ga4_page_date UNIQUE (page_id, metric_date)` on `public.seo_ga4_metrics`.

### C. State Consistency Constraints
- **Sync Jobs**: Enforced via `CONSTRAINT chk_sync_job_state_consistency` on `public.seo_sync_jobs`.
- **Session Leases**: Enforced via `CONSTRAINT chk_session_lease_fields` on `public.active_dashboard_sessions`.

---

## 3. JWT and Session Trust Boundary Specification

### A. Claims Origin & Identity Mapping
| JWT Claim | Source / Authority | Format / Example | Validation in `is_dashboard_owner()` |
|---|---|---|---|
| `sub` | Supabase GoTrue (Standard) | UUID (`a1b2c3d4-...`) | Validated via UUID regex; must match `user_roles.user_id` where `role = 'owner'` |
| `session_id` | Supabase GoTrue (Standard) | UUID (`e5f6a7b8-...`) | Validated via UUID regex; must match `active_dashboard_sessions.session_id` |
| `aal` | Supabase GoTrue (Standard) | String (`aal1` or `aal2`) | Strictly asserted `aal === 'aal2'` |
| `aud` | Supabase GoTrue (Standard) | String (`authenticated`) | Verified at serverless edge verification boundary |
| `iss` | Supabase GoTrue (Standard) | URL (`https://.../auth/v1`) | Verified at serverless edge verification boundary |
| `exp` | Supabase GoTrue (Standard) | Epoch integer | Verified at serverless edge and via DB lifetime boundary |

### B. Custom Claims vs Database Authority
- **No Reliance on Client Claims**: The system does **NOT** rely on client-supplied JWT claims or mutable `app_metadata` for role authorization.
- **Database Authority**: User role (`owner`) is verified exclusively against the `public.user_roles` database table.
- **Fail-Closed Design**: In `auth_util.is_dashboard_owner()`, any malformed JSON, invalid string formatting, regex mismatch, missing claim, or type exception immediately triggers the exception handler and returns `false`.

### C. JWT Header Inspection & Algorithm Configuration
Prior to deploying Step 2.2 serverless endpoints:
1. **Live Header Inspection**: Issue an actual active session JWT via GoTrue, decode its header (`{"alg": "...", "typ": "JWT"}`), and inspect the `alg` field.
2. **Signing-Key Configuration**: Cross-reference the header `alg` with Supabase Studio (**Project Settings** $\to$ **API** $\to$ **JWT Settings**):
   - If an HMAC JWT Secret is present, the expected algorithm is `HS256`.
   - If an asymmetric key pair or JWKS URL is configured, the expected algorithm is `RS256` or `ES256`.
3. **Explicit Algorithm Allowlist Required**:
   The server-side JWT verification logic in Step 2.2 **MUST** specify an explicit algorithm allowlist (e.g., `algorithms: ['HS256']` or `algorithms: ['RS256']`). It must never allow dynamic algorithm selection or accept the `none` algorithm, preventing algorithm confusion and key substitution attacks.

---

## 4. Sync-Job Retry Semantics & Lifecycle

### A. Definitions
- `retry_count`: The count of retry attempts executed **after** the initial attempt (starts at 0).
- `max_retries`: The maximum permitted retries (default 3; allowed range 0–10). A value of 3 permits 1 initial attempt + 3 retries = 4 total attempts.
- `started_at`: The timestamp when the job was **first claimed** for execution (initial attempt). It is set on the first transition from `pending` to `processing` and is never overwritten on subsequent retries.

### B. Attempt Consumption Rules
1. **Reported Failure (`complete_sync_job` with `p_status = 'failed'`)**:
   - Consumes exactly 1 attempt.
   - If `retry_count < max_retries`: transitions to `status = 'pending'`, clears `worker_id`, `lease_attempt_id`, and `lease_expires_at`, increments `retry_count = retry_count + 1`, and records `error_message`.
   - If `retry_count >= max_retries`: transitions to terminal `status = 'failed'`, clears lease fields, sets `finished_at = clock_timestamp()`, and records `error_message`.
2. **Expired Lease Recovery (`claim_sync_job` recovering an expired `processing` job)**:
   - An expired lease represents 1 unsuccessful attempt.
   - If `retry_count < max_retries`: increments `retry_count = retry_count + 1`, updates `generation = generation + 1`, sets new lease fields, and remains in `status = 'processing'`.
   - If `retry_count >= max_retries`: transitions to terminal `status = 'discarded_stale'`, clears lease fields, sets `finished_at = clock_timestamp()`, records `error_message = 'EXCEEDED_MAX_RETRIES'`, and returns `{ claimed: false, error: 'JOB_DISCARDED_STALE' }`.
3. **No Dual Consumption**:
   - A job in `pending` that is claimed does not increment `retry_count`.
   - A reported failure increments `retry_count` upon return to `pending`. When subsequently claimed, it does not increment again. Exactly one retry is consumed per failed attempt.
4. **State Consistency**: Enforced via table constraint `chk_sync_job_state_consistency`.

---

## 5. Session & Token Concurrency Semantics

### A. Global Lock Ordering
To prevent deadlocks across concurrent authentication, refresh, and logout transactions, all RPCs follow an identical lock hierarchy:
1. `public.active_dashboard_sessions` locked FIRST (`FOR UPDATE` or `FOR SHARE`).
2. `public.dashboard_token_hashes` locked SECOND (`FOR UPDATE` or `FOR SHARE`).

### B. Strict Refresh Idempotency & Lifetime Bounding (`commit_refresh_success`)
- **No Alternate Idempotency Paths**: The function rejects any loose idempotency checks.
- **Strict Identity Match**: Idempotent replay (`{ success: true, idempotent: true }`) is permitted **only** when all of the following match simultaneously:
  1. `v_session.last_lease_attempt_id = p_lease_attempt_id` (the durable attempt identifier),
  2. `v_session.refresh_generation = p_expected_generation + 1` (the incremented generation),
  3. `v_existing_token.token_hash = p_new_refresh_token_hash` (the new token hash is registered),
  4. `v_existing_token.token_type = 'current'` (the token is currently active).
- **Absolute 90-Day Ceiling**: The replacement refresh-token expiry is calculated **before** modifying the token registry, bounded by `LEAST(clock_timestamp() + interval '30 days', v_session.original_created_at + interval '90 days')`. If this calculated timestamp is $\le$ `clock_timestamp()`, rotation is immediately rejected with `SESSION_LIFETIME_EXCEEDED` without altering token or session state.
- **Collision Protection**: If the proposed `p_new_refresh_token_hash` already exists in `dashboard_token_hashes` outside that exact condition, the transaction immediately fails closed with `{ success: false, error: 'HASH_COLLISION' }` without modifying any session or token state.

### C. Revocation Race Resolution (`revoke_dashboard_session`)
- **Never-Registered Tokens**: If Step 1 (non-locking lookup) does not find the presented hash, it returns `{ status: 'not_found', revoked: false }` without modifying any session.
- **Token Disappearance Race**: If the presented hash was found in Step 1 but concurrently disappeared before the locked lookup in Step 3:
  - If the session was already revoked (`revoked_at IS NOT NULL`), it returns `{ status: 'already_revoked', session_id: v_session.session_id, token_was_expired: true, revoked: false }`.
  - If the session is active, the session is revoked: sets `revoked_at = clock_timestamp()`, deletes any remaining token hashes for that session, and returns `{ status: 'revoked', session_id: v_session.session_id, token_was_expired: true, revoked: true }` along with encrypted token fields for upstream GoTrue revocation.
- **Type Safety**: `token_was_expired` is strictly an explicit JSON boolean (`true` or `false`) across all execution branches.

---

## 6. Architectural Schema Exposure Strategy (Revision 11 Section 14.2)

### Exposed PostgREST Schemas Configuration
In accordance with the frozen Revision 11 Final Architecture (Section 14.2), PostgREST schema routing exposes `auth_util` alongside `public`:
- **Navigation in Supabase Studio**: **Project Settings** $\to$ **API** $\to$ **Data API** $\to$ **Exposed Schemas**.
- **Required Exposed Schemas**: `public, auth_util`.
- **Reason**: Enables PostgREST HTTP routing so that Vercel serverless functions in Step 2.2 can invoke `auth_util` stored procedures via `/rest/v1/rpc/<function_name>` using `Content-Profile: auth_util` and `Accept-Profile: auth_util`.

### Schema Exposure vs. Database Permissions
Exposing `auth_util` in PostgREST configures API routing visibility only; it **does NOT broaden database permissions** or grant access to unauthorized roles:
1. **Explicit Default Deny**: The Step 2.1 baseline migration executes `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_util FROM PUBLIC, anon, authenticated;`.
2. **Owner-Only Elevation Helper**: Only role `authenticated` holds `GRANT EXECUTE ON FUNCTION auth_util.is_dashboard_owner()`. Any call from `anon` or without a valid verified AAL2 owner JWT is rejected by PostgreSQL with `42501 permission denied`.
3. **Administrative Coordination RPCs**: All 9 coordination RPCs (`acquire_refresh_lease`, `commit_refresh_success`, `renew_refresh_lease`, `release_refresh_lease`, `get_active_session_token`, `revoke_dashboard_session`, `create_sync_job`, `claim_sync_job`, `complete_sync_job`) are granted **strictly to `service_role`**. Any attempt by `anon` or `authenticated` to invoke these endpoints returns `42501 permission denied`.
4. **Table Protection**: Direct access to `active_dashboard_sessions`, `dashboard_token_hashes`, and `mfa_challenge_consumptions` is revoked from `PUBLIC`, `anon`, and `authenticated`. Only `service_role` has access.

---

## 7. Migration Application Protocol (When Authorized)

When authorized to apply this migration:

### Clean Baseline Deployment
1. Open **SQL Editor** in Supabase Studio or execute via Supabase CLI against a clean disposable database.
2. Run `supabase/migrations/20261107120000_phase2_baseline.sql`.
3. The migration runs within a single transactional block (`BEGIN ... COMMIT`) and verifies that no target tables or schemas pre-exist.

### Test Database Repair (If repairing an already-created test database)
1. If an existing test database already had Step 2.1 tables initialized prior to the `updated_at` fix, run `supabase/scripts/repair_step2_1_test_database.sql`.
2. If an existing test database inherited default schema privileges granting excessive permissions (TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN on PG 17+) to `authenticated` on the domain and sync/role tables, run `supabase/scripts/repair_step2_1_seo_domain_privileges.sql` to restore intended privileges.
3. Do not run repair scripts on clean databases or production instances.

---

## 8. Verification Protocol

The verification script **must be run after the migration or repair**:
1. Open `supabase/scripts/verify_step2_1.sql`.
2. Run the script in the Supabase SQL Editor.
3. The script executes as an **automated assertion suite**:
   - Asserts that all 9 tables exist and have RLS enabled.
   - Asserts that `dashboard_token_hashes.updated_at` exists.
   - Asserts that `uq_gsc_page_date_query`, `uq_ga4_page_date`, `uq_session_token_type`, and state consistency constraints exist.
   - Asserts that all 10 functions in `auth_util` are `VOLATILE SECURITY DEFINER` with fixed search path.
   - Asserts using `has_function_privilege()` and `has_table_privilege()` that `anon`, `authenticated`, and `PUBLIC` cannot execute administrative RPCs or access private tables.
   - Asserts all 9 seeded SEO pages exist.
   - If all assertions succeed, outputs: `STEP 2.1 VERIFICATION SUITE PASSED (ALL ASSERTIONS OK)`.
   - If any assertion fails, immediately halts with `RAISE EXCEPTION`.

---

## 9. Rollback Protocol & Data Loss Warning

> [!CAUTION]
> **DESTRUCTIVE OPERATION WARNING**: Running `rollback_step2_1.sql` permanently drops all 9 Step 2.1 tables (`user_roles`, `active_dashboard_sessions`, `dashboard_token_hashes`, `mfa_challenge_consumptions`, `seo_pages`, `seo_search_console_metrics`, `seo_ga4_metrics`, `seo_sync_jobs`, `seo_sync_logs`) and **permanently erases all data** stored within them.
>
> Back up any required production data before executing rollback.

If rollback is necessary:
1. Review `supabase/scripts/rollback_step2_1.sql`.
2. Execute the script within a transactional block.
3. The script verifies object identity preconditions, drops the 6 policies, 10 functions, and `auth_util` schema using `RESTRICT`, and drops the 9 tables (including `dashboard_token_hashes` and its `updated_at` column) using `RESTRICT`.
4. Automated default privilege restoration does not claim exact restoration of unknown prior host state or execute broadening `GRANT ALL` shortcuts; administrators must review and reapply their project-specific default privileges if custom ACLs were in place.
