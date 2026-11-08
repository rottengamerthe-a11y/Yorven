/**
 * POST /api/auth/refresh
 * Leader Tab Token Refresh Endpoint
 * Implements 10-state machine, atomic lease acquisition, generation fencing,
 * 6-second AbortSignal timeout, 12-second lease quarantine, and durable idempotency.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  parseCookies,
  hashToken,
  encryptAesGcm,
  verifySupabaseJwt,
  setRefreshCookie,
  clearRefreshCookie,
  COOKIE_REFRESH_NAME,
  getGoTrueClient,
  getDatabaseAdapter
} from './_utils.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateOrigin(req)) {
    return res.status(403).json({ error: 'Invalid or missing origin' });
  }

  if (!validateCsrf(req)) {
    return res.status(403).json({ error: 'Missing required custom header' });
  }

  // 1. Read refresh token from __Host-yorven-refresh cookie
  const cookies = parseCookies(req);
  const refreshToken = cookies[COOKIE_REFRESH_NAME];

  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(401).json({ error: 'REFRESH_TOKEN_REQUIRED' });
  }

  const presentedHash = hashToken(refreshToken);
  const workerId = `worker-${crypto.randomUUID()}`;
  const leaseAttemptId = crypto.randomUUID();
  const db = getDatabaseAdapter();

  // 2. Atomic Lease Acquisition via RPC (auth_util.acquire_refresh_lease)
  let leaseRes;
  try {
    leaseRes = await db.acquireRefreshLease(presentedHash, workerId, leaseAttemptId, 12000);
  } catch {
    return res.status(500).json({ error: 'DATABASE_ERROR' });
  }

  if (!leaseRes || !leaseRes.acquired) {
    if (leaseRes?.lease_held) {
      const retrySec = Math.max(1, Math.ceil((leaseRes.retry_after_ms || 2000) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: 'REFRESH_IN_PROGRESS',
        retryAfter: retrySec
      });
    }

    if (leaseRes?.error === 'SESSION_REVOKED' || leaseRes?.error === 'SESSION_LIFETIME_EXCEEDED') {
      clearRefreshCookie(res);
      return res.status(401).json({ error: leaseRes.error });
    }

    if (
      leaseRes?.error === 'INVALID_TOKEN_HASH' ||
      leaseRes?.error === 'TOKEN_EXPIRED_OR_INVALID' ||
      leaseRes?.error === 'INVALID_HASH_FORMAT' ||
      leaseRes?.error === 'SESSION_NOT_FOUND'
    ) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'INVALID_OR_REVOKED' });
    }

    return res.status(401).json({ error: leaseRes?.error || 'UNAUTHORIZED' });
  }

  const { session_id: sessionId, user_id: userId, generation } = leaseRes;
  const gotrue = getGoTrueClient();

  // 3. Upstream GoTrue Token Exchange with 6s Timeout
  let exchangeResult;
  try {
    exchangeResult = await gotrue.exchangeRefreshToken(refreshToken, {
      signal: AbortSignal.timeout(6000)
    });
  } catch (err) {
    // States 4, 5, 6: Network timeout or socket drop
    // CRUCIAL INVARIANT: HOLD LEASE. Quarantine for remaining 12s. DO NOT clear cookie.
    res.setHeader('Retry-After', '6');
    return res.status(504).json({
      error: 'UPSTREAM_TIMEOUT',
      retryAfter: 6
    });
  }

  // 4. Handle Upstream Errors
  if (!exchangeResult.ok || !exchangeResult.data?.access_token) {
    const errCode = exchangeResult.data?.error || exchangeResult.data?.error_code || '';
    const errDesc = (exchangeResult.data?.error_description || exchangeResult.data?.msg || '').toLowerCase();
    const isInvalidGrant =
      errCode === 'invalid_grant' ||
      errDesc.includes('invalid refresh token') ||
      errDesc.includes('already used');

    if (isInvalidGrant) {
      // State 3: Upstream invalid_grant -> revoke session, clear cookie
      await db.revokeDashboardSession(presentedHash, 'upstream_invalid_grant').catch(() => {});
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'INVALID_GRANT' });
    }

    // State 1: Transient 5xx or bad response before socket timeout -> release lease early
    await db.releaseRefreshLease(sessionId, leaseAttemptId, generation);
    return res.status(503).json({ error: 'UPSTREAM_ERROR' });
  }

  const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in } = exchangeResult.data;

  // 5. Verify Claims & AAL2 (State 7)
  let claims;
  try {
    claims = await verifySupabaseJwt(newAccessToken, { requireAal2: true });
  } catch {
    await db.revokeDashboardSession(presentedHash, 'jwt_verification_failed').catch(() => {});
    clearRefreshCookie(res);
    return res.status(403).json({ error: 'INVALID_JWT_CLAIMS' });
  }

  if (claims.sub !== userId) {
    await db.revokeDashboardSession(presentedHash, 'user_id_mismatch').catch(() => {});
    clearRefreshCookie(res);
    return res.status(403).json({ error: 'USER_ID_MISMATCH' });
  }

  if (!claims.session_id || claims.session_id !== sessionId) {
    await db.revokeDashboardSession(presentedHash, 'session_id_mismatch').catch(() => {});
    clearRefreshCookie(res);
    return res.status(403).json({ error: 'SESSION_ID_MISMATCH' });
  }

  // 6. Encrypt New Access Token & Hash New Refresh Token
  const { encrypted, iv, authTag } = encryptAesGcm(newAccessToken);
  const newHash = hashToken(newRefreshToken);
  const accessTokenExpiresAt = new Date(claims.exp * 1000).toISOString();

  // 7. Atomic Commit RPC with Generation Fencing and Durable Idempotency
  let commitRes;
  try {
    commitRes = await db.commitRefreshSuccess(
      sessionId,
      leaseAttemptId,
      generation,
      newHash,
      encrypted,
      iv,
      authTag,
      accessTokenExpiresAt
    );
  } catch {
    // State 8: DB commit failure post-GoTrue -> HOLD LEASE, preserve cookie
    return res.status(503).json({ error: 'DATABASE_COMMIT_FAILED' });
  }

  if (!commitRes || !commitRes.success) {
    const commitErr = commitRes?.error;
    if (
      commitErr === 'LEASE_ATTEMPT_MISMATCH' ||
      commitErr === 'LEASE_EXPIRED' ||
      commitErr === 'GENERATION_MISMATCH'
    ) {
      // State 9: Worker lost lease / fenced out -> preserve cookie
      return res.status(409).json({ error: 'LEASE_FENCED_OUT' });
    }

    return res.status(500).json({ error: commitErr || 'COMMIT_FAILED' });
  }

  // 8. Success: Rotate client cookie and return new access token
  setRefreshCookie(res, newRefreshToken);

  return res.status(200).json({
    accessToken: newAccessToken,
    expiresIn: expires_in || 3600,
    idempotent: Boolean(commitRes.idempotent)
  });
}
