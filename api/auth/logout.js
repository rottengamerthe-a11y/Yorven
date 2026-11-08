/**
 * POST /api/auth/logout
 * Session Revocation Endpoint
 * Revokes session authoritatively in database via auth_util.revoke_dashboard_session,
 * triggers upstream GoTrue local signout, and clears all client cookies.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  parseCookies,
  hashToken,
  decryptAesGcm,
  clearRefreshCookie,
  clearMfaCookie,
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

  // 1. Read refresh cookie
  const cookies = parseCookies(req);
  const refreshToken = cookies[COOKIE_REFRESH_NAME];

  if (!refreshToken || typeof refreshToken !== 'string') {
    // Idempotent logout when no session exists
    clearRefreshCookie(res);
    clearMfaCookie(res);
    return res.status(200).json({ success: true, message: 'Already logged out' });
  }

  const presentedHash = hashToken(refreshToken);
  const db = getDatabaseAdapter();

  // 2. Authoritative Database Revocation via RPC
  let revokeRes;
  try {
    revokeRes = await db.revokeDashboardSession(presentedHash, 'user_logout');
  } catch {
    // Section 19: Database update failure returns 500 without false success
    return res.status(500).json({ error: 'LOGOUT_DATABASE_FAILED' });
  }

  if (!revokeRes) {
    return res.status(500).json({ error: 'LOGOUT_DATABASE_FAILED' });
  }

  // 3. Upstream GoTrue Signout (Best-effort; DB is authoritative)
  if (revokeRes.revoked && revokeRes.encrypted_token && revokeRes.iv && revokeRes.auth_tag) {
    try {
      const accessToken = decryptAesGcm(
        revokeRes.encrypted_token,
        revokeRes.iv,
        revokeRes.auth_tag
      );
      const gotrue = getGoTrueClient();
      await gotrue.logout(accessToken, 'local');
    } catch {
      // Ignored: Database session is irrevocably revoked in PostgreSQL
    }
  }

  // 4. Destroy all cookies and return success
  clearRefreshCookie(res);
  clearMfaCookie(res);

  return res.status(200).json({ success: true });
}
