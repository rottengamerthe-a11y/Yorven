/**
 * POST /api/auth/login
 * Step 1: Password authentication, verified TOTP discovery, challenge creation,
 * and encrypted intermediate MFA cookie issuance.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  packMfaPayload,
  setMfaCookie,
  getGoTrueClient
} from './_utils.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    const gotrue = getGoTrueClient();

    // 1. Authenticate credentials with GoTrue
    const signInResult = await gotrue.passwordSignIn(email.trim(), password);
    if (!signInResult.ok || !signInResult.data?.access_token) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const { access_token: aal1AccessToken, user } = signInResult.data;

    // 2. Discover enrolled MFA factors
    const factorsResult = await gotrue.getUserFactors(aal1AccessToken);
    if (!factorsResult.ok) {
      return res.status(403).json({ error: 'MFA_NOT_ENROLLED' });
    }

    const factors = Array.isArray(factorsResult.data)
      ? factorsResult.data
      : (factorsResult.data?.all || []);

    const totpFactor = factors.find(
      (f) => f.factor_type === 'totp' && f.status === 'verified'
    );

    if (!totpFactor) {
      return res.status(403).json({ error: 'MFA_NOT_ENROLLED' });
    }

    // 3. Create MFA challenge
    const challengeResult = await gotrue.createFactorChallenge(totpFactor.id, aal1AccessToken);
    if (!challengeResult.ok || !challengeResult.data?.id) {
      return res.status(500).json({ error: 'MFA_CHALLENGE_FAILED' });
    }

    const challengeId = challengeResult.data.id;

    // 4. Encrypt temporary AAL1 session context into __Host-yorven-mfa cookie (Max-Age=300)
    const mfaPayload = {
      userId: user.id,
      aal1AccessToken,
      factorId: totpFactor.id,
      challengeId,
      createdAt: Date.now()
    };

    const packedCookie = packMfaPayload(mfaPayload);
    setMfaCookie(res, packedCookie);

    // 5. Response — Zero access tokens or refresh tokens in response body
    return res.status(200).json({
      mfaRequired: true,
      factorId: totpFactor.id,
      challengeId
    });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
