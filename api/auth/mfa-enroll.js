// POST /api/auth/mfa-enroll
// 1. Validate origin, CSRF, security headers
// 2. Authenticate user via GoTrue with email/password (AAL-1 token)
// 3. Verify the user has the `owner` role via DB helper (db.checkUserOwnerRole)
// 4. Ensure user does NOT already have a verified TOTP factor
// 5. Enroll a TOTP factor using GoTrue: gotrue.createFactor('totp')
// 6. Store { userId, aal1AccessToken, factorId, createdAt } in a short‑lived encrypted cookie (COOKIE_MFA_NAME) using packMfaPayload
// 7. Return QR code (svg) and factorId to client. Do NOT return any tokens.

import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  packMfaPayload,
  setEnrollCookie,
  getGoTrueClient,
  getDatabaseAdapter
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
        // Now check for existing verified TOTP
        const existingTotp = factors.find(f => f.factor_type === 'totp' && f.status === 'verified');
        if (existingTotp) {
          return res.status(409).json({ error: 'MFA_ALREADY_ENROLLED' });
        }

      // Enroll new TOTP factor
              // Enroll new TOTP factor with friendly name
        const enrollRes = await gotrue.createFactor('totp', aal1AccessToken, { friendly_name: 'Yorven Authenticator' });

      if (!enrollRes.ok || !enrollRes.data?.id) {
        console.error('MFA factor creation failed:', {
          status: enrollRes.status,
          error: enrollRes.data?.error,
          code: enrollRes.data?.code,
          message: enrollRes.data?.msg || enrollRes.data?.message
        });
        // Return generic error plus safe diagnostics for internal use
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

      // Bind context to short‑lived cookie
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

export default makeEnrollHandler();
