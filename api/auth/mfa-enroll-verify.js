// POST /api/auth/mfa-enroll-verify
// 1. Validate origin, CSRF, security headers
// 2. Read and decrypt the short‑lived enrollment cookie (same format as login MFA cookie)
// 3. Enforce expiry (5 min max, same as MFA_COOKIE_MAX_AGE)
// 4. Create a challenge for the enrolled TOTP factor using the stored AAL‑1 token
// 5. Verify the user‑provided TOTP code against that challenge
// 6. On success clear the enrollment cookie and return success. On any error clear cookie and return appropriate status.

import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  unpackMfaPayload,
  clearEnrollCookie,
  getGoTrueClient,
  COOKIE_ENROLL_NAME,
  parseCookies
} from './_utils.js';

export function makeEnrollVerifyHandler({ getGoTrueClient: getGoTrue = getGoTrueClient, clearEnrollCookie: clearCookie = clearEnrollCookie } = {}) {
  return async function handler(req, res) {
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

            const cookies = parseCookies(req);
    const packed = cookies[COOKIE_ENROLL_NAME];
    if (!packed) {
      return res.status(401).json({ error: 'ENROLLMENT_SESSION_EXPIRED' });
    }

    const { code } = req.body || {};
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ error: 'Invalid verification code format (6 digits required)' });
    }

    let payload;
    try {
      payload = unpackMfaPayload(packed);
    } catch {
      clearCookie(res);
      return res.status(401).json({ error: 'ENROLLMENT_SESSION_EXPIRED' });
    }

    const now = Date.now();
    if (!payload.createdAt || now - payload.createdAt > 300000) { // 5 min
      clearCookie(res);
      return res.status(401).json({ error: 'ENROLLMENT_SESSION_EXPIRED' });
    }

    const { aal1AccessToken, factorId, userId } = payload;

    try {
      const gotrue = getGoTrue();
      const challengeRes = await gotrue.createFactorChallenge(factorId, aal1AccessToken);
      if (!challengeRes.ok || !challengeRes.data?.id) {
        clearCookie(res);
        return res.status(500).json({ error: 'CHALLENGE_CREATION_FAILED' });
      }
      const challengeId = challengeRes.data.id;

      const verifyRes = await gotrue.verifyFactorChallenge(factorId, challengeId, code.trim(), aal1AccessToken);
      if (!verifyRes.ok) {
        clearCookie(res);
        return res.status(401).json({ error: 'INVALID_TOTP_CODE' });
      }

      clearCookie(res);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('MFA enrollment verification error', err);
      clearCookie(res);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  };
}
export default makeEnrollVerifyHandler();
// Duplicate block removed