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

  const { code, factorId: reqFactorId, challengeId: reqChallengeId } = req.body || {};

  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return res.status(400).json({ error: 'Invalid verification code format (6 digits required)' });
  }

  // 1. Read and decrypt intermediate MFA cookie
  const cookies = parseCookies(req);
  const packedMfa = cookies[COOKIE_MFA_NAME];
  if (!packedMfa) {
    clearMfaCookie(res);
    return res.status(401).json({ error: 'MFA_SESSION_EXPIRED' });
  }

  let mfaPayload;
  try {
    mfaPayload = unpackMfaPayload(packedMfa);
  } catch {
    clearMfaCookie(res);
    return res.status(401).json({ error: 'MFA_SESSION_EXPIRED' });
  }

  // Check 5-minute expiry
  const now = Date.now();
  if (!mfaPayload.createdAt || (now - mfaPayload.createdAt) > 300000) {
    clearMfaCookie(res);
    return res.status(401).json({ error: 'MFA_SESSION_EXPIRED' });
  }

  const { userId, aal1AccessToken, factorId, challengeId } = mfaPayload;

  // Validate parameter binding if passed in request body
  if (reqFactorId && reqFactorId !== factorId) {
    clearMfaCookie(res);
    return res.status(400).json({ error: 'FACTOR_ID_MISMATCH' });
  }
  if (reqChallengeId && reqChallengeId !== challengeId) {
    clearMfaCookie(res);
    return res.status(400).json({ error: 'CHALLENGE_ID_MISMATCH' });
  }

  const db = getDatabaseAdapter();
  const gotrue = getGoTrueClient();

  // 2. Enforce local one-time challenge consumption lock in database
  try {
    await db.recordMfaChallengeConsumption(challengeId, userId);
  } catch (err) {
    if (err.message === 'CHALLENGE_ALREADY_USED') {
      clearMfaCookie(res);
      return res.status(401).json({ error: 'CHALLENGE_ALREADY_USED' });
    }
    return res.status(500).json({ error: 'DATABASE_ERROR' });
  }

  // 3. Upstream GoTrue MFA verification
  const verifyResult = await gotrue.verifyFactorChallenge(
    factorId,
    challengeId,
    code.trim(),
    aal1AccessToken
  );

  if (!verifyResult.ok || !verifyResult.data?.access_token) {
    clearMfaCookie(res);
    return res.status(401).json({ error: 'INVALID_MFA_CODE' });
  }

  const { access_token: aal2AccessToken, refresh_token: aal2RefreshToken, expires_in } = verifyResult.data;

  // 4. Verify AAL2 JWT signature and claims
  let claims;
  try {
    claims = await verifySupabaseJwt(aal2AccessToken, { requireAal2: true });
  } catch {
    clearMfaCookie(res);
    return res.status(403).json({ error: 'INVALID_JWT_CLAIMS' });
  }

  if (claims.sub !== userId) {
    clearMfaCookie(res);
    return res.status(403).json({ error: 'USER_ID_MISMATCH' });
  }

  // 5. Authorize owner role in database
  const isOwner = await db.checkUserOwnerRole(userId);
  if (!isOwner) {
    clearMfaCookie(res);
    return res.status(403).json({ error: 'FORBIDDEN_NOT_OWNER' });
  }

  // 6. Establish active dashboard session in database
  const sessionId = claims.session_id;
  if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    clearMfaCookie(res);
    return res.status(403).json({ error: 'INVALID_JWT_CLAIMS' });
  }

  const tokenHash = hashToken(aal2RefreshToken);
  const { encrypted, iv, authTag } = encryptAesGcm(aal2AccessToken);
  const accessTokenExpiresAt = new Date(claims.exp * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const tokenExpiryIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const sessionData = {
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

  const hashData = {
    token_hash: tokenHash,
    session_id: sessionId,
    token_type: 'current',
    expires_at: tokenExpiryIso,
    created_at: nowIso,
    updated_at: nowIso
  };

  try {
    await db.createDashboardSession(sessionData, hashData);
  } catch {
    // Session persistence failure handling (Section 6.2 #8)
    await gotrue.logout(aal2AccessToken, 'local').catch(() => {});
    clearMfaCookie(res);
    clearRefreshCookie(res);
    return res.status(500).json({ error: 'SESSION_PERSISTENCE_FAILED' });
  }

  // 7. Verify owner authorization RPC using AAL2 token
  try {
    const isOwnerRpc = await db.isDashboardOwner(aal2AccessToken);
    if (!isOwnerRpc) {
      await db.deleteActiveSession(sessionId).catch(() => {});
      await gotrue.logout(aal2AccessToken, 'local').catch(() => {});
      clearMfaCookie(res);
      clearRefreshCookie(res);
      return res.status(403).json({ error: 'FORBIDDEN_NOT_OWNER' });
    }
  } catch {
    await db.deleteActiveSession(sessionId).catch(() => {});
    await gotrue.logout(aal2AccessToken, 'local').catch(() => {});
    clearMfaCookie(res);
    clearRefreshCookie(res);
    return res.status(403).json({ error: 'FORBIDDEN_NOT_OWNER' });
  }

  // 8. Cleanup temporary cookie and issue permanent refresh cookie
  clearMfaCookie(res);
  setRefreshCookie(res, aal2RefreshToken);

  return res.status(200).json({
    accessToken: aal2AccessToken,
    expiresIn: expires_in || 3600
  });
}
