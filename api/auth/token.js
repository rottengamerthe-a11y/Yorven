/**
 * GET /api/auth/token
 * Follower Tab Token Retrieval Endpoint
 * Read-only database query via auth_util.get_active_session_token(p_presented_hash).
 * Returns cached decrypted token or signals refresh_in_progress / refresh_required.
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
  COOKIE_REFRESH_NAME,
  getDatabaseAdapter
} from './_utils.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'GET') {
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
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const presentedHash = hashToken(refreshToken);
  const db = getDatabaseAdapter();

  // 2. Query follower token status via RPC
  let tokenRes;
  try {
    tokenRes = await db.getActiveSessionToken(presentedHash);
  } catch {
    return res.status(500).json({ error: 'DATABASE_ERROR' });
  }

  if (!tokenRes) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'INVALID_OR_EXPIRED' });
  }

  // 3. Route based on database status
  switch (tokenRes.status) {
    case 'active': {
      try {
        const decryptedToken = decryptAesGcm(
          tokenRes.encrypted_token,
          tokenRes.iv,
          tokenRes.auth_tag
        );
        return res.status(200).json({
          accessToken: decryptedToken,
          expiresIn: tokenRes.remaining_seconds
        });
      } catch {
        return res.status(500).json({ error: 'TOKEN_DECRYPTION_FAILED' });
      }
    }

    case 'refresh_in_progress': {
      return res.status(200).json({
        status: 'refresh_in_progress',
        retryAfter: tokenRes.retry_after_sec || 1
      });
    }

    case 'refresh_required': {
      return res.status(200).json({
        status: 'refresh_required'
      });
    }

    case 'revoked':
    case 'lifetime_exceeded': {
      clearRefreshCookie(res);
      return res.status(401).json({ error: tokenRes.status.toUpperCase() });
    }

    case 'invalid':
    case 'invalid_or_expired':
    default: {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'INVALID_OR_EXPIRED' });
    }
  }
}
