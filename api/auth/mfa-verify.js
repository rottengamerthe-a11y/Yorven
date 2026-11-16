/**
 * POST /api/auth/mfa-verify
 * Step 2: Intermediate MFA cookie decryption, local one-time challenge lock,
 * upstream TOTP verification, AAL2 claims validation, owner authorization,
 * active session registration, and __Host-yorven-refresh issuance.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  parseCookies,
  unpackMfaPayload,
  clearMfaCookie,
  setRefreshCookie,
  clearRefreshCookie,
  verifySupabaseJwt,
  hashToken,
  encryptAesGcm,
  COOKIE_MFA_NAME,
  getGoTrueClient,
  getDatabaseAdapter
} from './_utils.js';

export function makeMfaVerifyHandler({
  getGoTrueClient: getGoTrue = getGoTrueClient,
  getDatabaseAdapter: getDb = getDatabaseAdapter,
  clearMfaCookie: clearCookie = clearMfaCookie,
  setRefreshCookie: setRefresh = setRefreshCookie,
  verifySupabaseJwt: verifyJwt = verifySupabaseJwt
} = {}) {
  return async function handleMfaVerify(req, res) {
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

    const { code, factorId: reqFactorId } = req.body || {};

    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ error: 'Invalid verification code format (6 digits required)' });
    }

    // Helper for safe best-effort cookie operations that never throw or prevent cleanup/response
    const safeClearMfa = () => {
      try {
        if (!res.headersSent) {
          clearCookie(res);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const safeClearRefresh = () => {
      try {
        if (!res.headersSent) {
          clearRefreshCookie(res);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    // 1. Read and decrypt intermediate MFA cookie
    const cookies = parseCookies(req);
    const packedMfa = cookies[COOKIE_MFA_NAME];
    if (!packedMfa) {
      safeClearMfa();
      return res.status(401).json({ error: 'MFA_SESSION_EXPIRED' });
    }

    let mfaPayload;
    try {
      mfaPayload = unpackMfaPayload(packedMfa);
    } catch {
      safeClearMfa();
      return res.status(401).json({ error: 'MFA_SESSION_EXPIRED' });
    }

    // Check 5-minute expiry
    const now = Date.now();
    if (!mfaPayload.createdAt || (now - mfaPayload.createdAt) > 300000) {
      safeClearMfa();
      return res.status(401).json({ error: 'MFA_SESSION_EXPIRED' });
    }

    const { userId, aal1AccessToken, factorId } = mfaPayload;

    // Validate parameter binding if passed in request body
    if (reqFactorId && reqFactorId !== factorId) {
      return res.status(400).json({ error: 'FACTOR_ID_MISMATCH' });
    }

    const db = getDb();
    const gotrue = getGoTrue();

    // 2. Create fresh challenge just-in-time for this verification attempt
    let challengeResult;
    try {
      challengeResult = await gotrue.createFactorChallenge(factorId, aal1AccessToken);
    } catch {
      console.error('MFA_LOGIN_CHALLENGE_FAILED', {
        status: 0,
        code: null,
        classification: 'NETWORK_ERROR'
      });
      // Preserve intermediate MFA cookie on network blip so user can retry
      return res.status(500).json({ error: 'MFA_CHALLENGE_FAILED' });
    }

    if (!challengeResult?.ok || !challengeResult?.data?.id) {
      let safeCode = null;
      if (typeof challengeResult?.data?.error_code === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(challengeResult.data.error_code)) {
        safeCode = challengeResult.data.error_code;
      } else if (typeof challengeResult?.data?.code === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(challengeResult.data.code)) {
        safeCode = challengeResult.data.code;
      }
      console.error('MFA_LOGIN_CHALLENGE_FAILED', {
        status: typeof challengeResult?.status === 'number' ? challengeResult.status : 0,
        code: safeCode,
        classification: 'CHALLENGE_CREATION_FAILED'
      });
      return res.status(500).json({ error: 'MFA_CHALLENGE_FAILED' });
    }

    const challengeId = challengeResult.data.id;

    // 3. Upstream GoTrue MFA verification against the fresh challenge
    let verifyResult;
    try {
      verifyResult = await gotrue.verifyFactorChallenge(
        factorId,
        challengeId,
        code.trim(),
        aal1AccessToken
      );
    } catch {
      console.error('MFA_LOGIN_VERIFY_FAILED', {
        status: 0,
        code: null,
        classification: 'NETWORK_ERROR'
      });
      // Preserve intermediate MFA cookie on network blip so user can retry
      return res.status(500).json({ error: 'MFA_VERIFY_FAILED' });
    }

    if (!verifyResult?.ok || !verifyResult?.data?.access_token) {
      let safeCode = null;
      if (typeof verifyResult?.data?.error_code === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(verifyResult.data.error_code)) {
        safeCode = verifyResult.data.error_code;
      } else if (typeof verifyResult?.data?.code === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(verifyResult.data.code)) {
        safeCode = verifyResult.data.code;
      }

      const status = typeof verifyResult?.status === 'number' ? verifyResult.status : 0;
      let classification = 'VERIFICATION_FAILED';
      if (status === 429) {
        classification = 'RATE_LIMITED';
      } else if (status >= 500) {
        classification = 'UPSTREAM_ERROR';
      } else if (safeCode === 'expired_challenge') {
        classification = 'CHALLENGE_EXPIRED';
      } else if (status === 400 || status === 422) {
        classification = 'INVALID_CODE';
      }

      console.error('MFA_LOGIN_VERIFY_FAILED', {
        status,
        code: safeCode,
        classification
      });

      // Do not clear the MFA cookie on invalid code / retryable failure — allow retry within 5 min TTL
      return res.status(401).json({ error: 'INVALID_MFA_CODE' });
    }

    const { access_token: aal2AccessToken, refresh_token: aal2RefreshToken, expires_in } = verifyResult.data;

    // Helper for best-effort local GoTrue session revocation on any post-verification failure
    const revokeAal2Session = async () => {
      try {
        if (typeof aal2AccessToken === 'string' && aal2AccessToken.trim()) {
          await gotrue.logout(aal2AccessToken, 'local');
        }
      } catch {
        // Best-effort cleanup must never throw or alter response
      }
    };

    // Validate AAL2 token and refresh token types early
    if (
      typeof aal2AccessToken !== 'string' ||
      !aal2AccessToken.trim() ||
      typeof aal2RefreshToken !== 'string' ||
      !aal2RefreshToken.trim()
    ) {
      await revokeAal2Session();
      safeClearMfa();
      return res.status(500).json({ error: 'INVALID_UPSTREAM_TOKENS' });
    }

    // 4. Record challenge consumption only AFTER successful GoTrue verification
    try {
      await db.recordMfaChallengeConsumption(challengeId, userId);
    } catch (err) {
      await revokeAal2Session();
      safeClearMfa();
      if (err.message === 'CHALLENGE_ALREADY_USED') {
        return res.status(401).json({ error: 'CHALLENGE_ALREADY_USED' });
      }
      return res.status(500).json({ error: 'DATABASE_ERROR' });
    }

    // 5. Verify AAL2 JWT signature and claims
    let claims;
    try {
      claims = await verifyJwt(aal2AccessToken, { requireAal2: true });
      if (!claims || typeof claims !== 'object') {
        throw new Error('INVALID_CLAIMS_OBJECT');
      }
    } catch {
      await revokeAal2Session();
      safeClearMfa();
      return res.status(403).json({ error: 'INVALID_JWT_CLAIMS' });
    }

    if (claims.sub !== userId) {
      await revokeAal2Session();
      safeClearMfa();
      return res.status(403).json({ error: 'USER_ID_MISMATCH' });
    }

    const sessionId = claims.session_id;
    if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      await revokeAal2Session();
      safeClearMfa();
      return res.status(403).json({ error: 'INVALID_JWT_CLAIMS' });
    }

    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= 0) {
      await revokeAal2Session();
      safeClearMfa();
      return res.status(403).json({ error: 'INVALID_JWT_CLAIMS' });
    }

    // 6. Authorize owner role in database
    let isOwner = false;
    try {
      isOwner = await db.checkUserOwnerRole(userId);
    } catch {
      isOwner = false;
    }
    if (!isOwner) {
      await revokeAal2Session();
      safeClearMfa();
      return res.status(403).json({ error: 'FORBIDDEN_NOT_OWNER' });
    }

    // 7. Establish active dashboard session in database
    let sessionData;
    let hashData;
    try {
      const tokenHash = hashToken(aal2RefreshToken);
      const { encrypted, iv, authTag } = encryptAesGcm(aal2AccessToken);
      const accessTokenExpiresAt = new Date(claims.exp * 1000).toISOString();
      const nowIso = new Date().toISOString();
      const tokenExpiryIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      sessionData = {
        session_id: sessionId,
        user_id: userId,
        current_access_token_encrypted: encrypted,
        current_access_token_iv: iv,
        current_access_token_auth_tag: authTag,
        access_token_expires_at: accessTokenExpiresAt,
        refresh_generation: 0,
        original_created_at: nowIso,
        revoked_at: null,
        updated_at: nowIso
      };

      hashData = {
        token_hash: tokenHash,
        session_id: sessionId,
        token_type: 'current',
        expires_at: tokenExpiryIso,
        created_at: nowIso,
        updated_at: nowIso
      };
    } catch {
      await revokeAal2Session();
      safeClearMfa();
      return res.status(500).json({ error: 'SESSION_PREPARATION_FAILED' });
    }

    try {
      await db.createDashboardSession(sessionData, hashData);
    } catch {
      // Session persistence failure handling
      await revokeAal2Session();
      safeClearMfa();
      safeClearRefresh();
      return res.status(500).json({ error: 'SESSION_PERSISTENCE_FAILED' });
    }

    // 8. Verify owner authorization RPC using AAL2 token
    try {
      const isOwnerRpc = await db.isDashboardOwner(aal2AccessToken);
      if (!isOwnerRpc) {
        await db.deleteActiveSession(sessionId).catch(() => {});
        await revokeAal2Session();
        safeClearMfa();
        safeClearRefresh();
        return res.status(403).json({ error: 'FORBIDDEN_NOT_OWNER' });
      }
    } catch {
      await db.deleteActiveSession(sessionId).catch(() => {});
      await revokeAal2Session();
      safeClearMfa();
      safeClearRefresh();
      return res.status(403).json({ error: 'FORBIDDEN_NOT_OWNER' });
    }

    // 9. Cleanup temporary cookie and issue permanent refresh cookie
    try {
      const mfaCleared = safeClearMfa();
      if (!mfaCleared) {
        throw new Error('MFA_COOKIE_CLEAR_FAILED');
      }
      setRefresh(res, aal2RefreshToken);
    } catch {
      await db.deleteActiveSession(sessionId).catch(() => {});
      await revokeAal2Session();
      safeClearMfa();
      safeClearRefresh();
      if (!res.headersSent) {
        return res.status(500).json({ error: 'SESSION_ISSUANCE_FAILED' });
      }
      return;
    }

    if (!res.headersSent) {
      return res.status(200).json({
        accessToken: aal2AccessToken,
        expiresIn: expires_in || 3600
      });
    }
  };
}

export default async function handler(req, res) {
  return makeMfaVerifyHandler()(req, res);
}
