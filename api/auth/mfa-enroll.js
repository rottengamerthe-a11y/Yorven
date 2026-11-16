// Consolidated MFA Enrollment Handler: /api/auth/mfa-enroll
// Handles:
// 1. Enrollment Initiation (default): POST /api/auth/mfa-enroll
//    - Validates origin, CSRF, security headers
//    - Authenticates user via GoTrue with email/password (AAL-1 token)
//    - Verifies user has owner role via db.checkUserOwnerRole(user.id)
//    - Cleans up stale unverified TOTP factors
//    - Rejects with 409 if a verified TOTP factor already exists
//    - Enrolls new TOTP factor with friendly name
//    - Stores payload in encrypted __Host-yorven-enroll cookie
//    - Returns { factorId, qrCode }
// 2. Enrollment Verification (when req.query.action === 'verify'): POST /api/auth/mfa-enroll-verify (via Vercel rewrite)
//    - Validates origin, CSRF, security headers
//    - Decrypts and unpacks __Host-yorven-enroll cookie
//    - Enforces 5-minute expiry
//    - Creates and verifies factor challenge against GoTrue
//    - Clears enrollment cookie on success and failure
//    - Returns { success: true }

import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  packMfaPayload,
  unpackMfaPayload,
  setEnrollCookie,
  clearEnrollCookie,
  getGoTrueClient,
  getDatabaseAdapter,
  COOKIE_ENROLL_NAME,
  parseCookies
} from './_utils.js';

export function makeEnrollHandler({ getGoTrueClient: getGoTrue = getGoTrueClient, getDatabaseAdapter: getDb = getDatabaseAdapter } = {}) {
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

    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const gotrue = getGoTrue();
      const signIn = await gotrue.passwordSignIn(email.trim(), password);
      if (!signIn.ok || !signIn.data?.access_token) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      }
      const { access_token: aal1AccessToken, user } = signIn.data;

      // Verify owner role
      const db = getDb();
      const isOwner = await db.checkUserOwnerRole(user.id);
      if (!isOwner) {
        return res.status(403).json({ error: 'FORBIDDEN_NOT_OWNER' });
      }

      // Ensure no verified TOTP already exists
      const factorsRes = await gotrue.getUserFactors(aal1AccessToken);
      if (!factorsRes.ok) {
        return res.status(500).json({ error: 'FAILED_TO_FETCH_FACTORS' });
      }
      const factors = Array.isArray(factorsRes.data) ? factorsRes.data : (factorsRes.data?.all || []);

      // Delete any unverified TOTP factors (cleanup stale enrollments)
      const unverifiedTotps = factors.filter(f => f.factor_type === 'totp' && f.status !== 'verified');
      for (const f of unverifiedTotps) {
        const delRes = await gotrue.deleteFactor(f.id, aal1AccessToken);
        if (!delRes.ok) {
          console.error('Failed to delete unverified TOTP factor', { factorId: f.id, status: delRes.status });
          return res.status(500).json({ error: 'MFA_ENROLL_FAILED' });
        }
      }

      // Check for existing verified TOTP
      const existingTotp = factors.find(f => f.factor_type === 'totp' && f.status === 'verified');
      if (existingTotp) {
        return res.status(409).json({ error: 'MFA_ALREADY_ENROLLED' });
      }

      // Enroll new TOTP factor with friendly name
      const enrollRes = await gotrue.createFactor('totp', aal1AccessToken, { friendly_name: 'Yorven Authenticator' });

      if (!enrollRes.ok || !enrollRes.data?.id) {
        console.error('MFA factor creation failed:', {
          status: enrollRes.status,
          error: enrollRes.data?.error,
          code: enrollRes.data?.code,
          message: enrollRes.data?.msg || enrollRes.data?.message
        });
        return res.status(500).json({
          error: 'MFA_ENROLL_FAILED',
          ...(process.env.NODE_ENV !== 'production' && {
            debug: {
              status: enrollRes.status,
              code: enrollRes.data?.code,
              message: enrollRes.data?.error || enrollRes.data?.msg || enrollRes.data?.message
            }
          })
        });
      }
      const factorId = enrollRes.data.id;
      const qrCode = enrollRes.data.totp?.qr_code || '';

      // Bind context to short-lived encrypted cookie
      const payload = {
        userId: user.id,
        aal1AccessToken,
        factorId,
        createdAt: Date.now()
      };
      const packed = packMfaPayload(payload);
      setEnrollCookie(res, packed);

      return res.status(200).json({ factorId, qrCode });
    } catch (err) {
      console.error('MFA enrollment error', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  };
}

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
    if (!payload.createdAt || now - payload.createdAt > 300000) { // 5 min
      clearCookie(res);
      return res.status(401).json({ error: 'ENROLLMENT_SESSION_EXPIRED' });
    }

    const { aal1AccessToken, factorId } = payload;

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

export function makeConsolidatedHandler(options = {}) {
  const enrollHandler = makeEnrollHandler(options);
  const verifyHandler = makeEnrollVerifyHandler(options);

  return async function handler(req, res) {
    if (req.query?.action === 'verify') {
      return verifyHandler(req, res);
    }
    return enrollHandler(req, res);
  };
}

export default makeConsolidatedHandler();
