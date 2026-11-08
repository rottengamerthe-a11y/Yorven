/**
 * SEO Endpoints Authentication & Authorization Helper
 * Yorven SEO Dashboard — Phase 2 Serverless Endpoints
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import {
  validateOrigin,
  validateCsrf,
  setSecurityHeaders,
  verifySupabaseJwt,
  getDatabaseAdapter
} from '../auth/_utils.js';

export { setSecurityHeaders as setSeoSecurityHeaders };

/**
 * Validates the machine-to-machine runner secret in constant time.
 * Pre-hashes inputs with SHA-256 to ensure strictly equal buffer lengths,
 * preventing RangeErrors and timing leaks.
 * Fails closed if YORVEN_SYNC_RUNNER_SECRET is unset or empty.
 */
export function verifyRunnerSecret(providedSecret) {
  const expectedSecret = process.env.YORVEN_SYNC_RUNNER_SECRET;
  if (!expectedSecret || typeof expectedSecret !== 'string' || expectedSecret.trim() === '') {
    return false; // Fail closed when unconfigured
  }
  if (!providedSecret || typeof providedSecret !== 'string' || providedSecret.trim() === '') {
    return false;
  }

  const expectedHash = crypto.createHash('sha256').update(Buffer.from(expectedSecret)).digest();
  const providedHash = crypto.createHash('sha256').update(Buffer.from(providedSecret)).digest();

  return crypto.timingSafeEqual(expectedHash, providedHash);
}

/**
 * Extracts Bearer token from the Authorization header.
 */
export function extractBearerToken(req) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1].trim();
  }
  return null;
}

/**
 * Authorizes owner-only GET requests (/api/seo/status, /api/seo/overview, /api/seo/metrics, /api/seo/pages).
 * Requires:
 * 1. Valid Origin / Referer
 * 2. Mandatory CSRF header: X-Requested-With: Yorven-Control
 * 3. Verified Supabase JWT (AAL2)
 * 4. DB confirmation via auth_util.is_dashboard_owner()
 */
export async function authorizeOwnerRequest(req, res) {
  setSecurityHeaders(res);

  // 1. Origin validation
  if (!validateOrigin(req)) {
    return { authorized: false, status: 403, error: 'FORBIDDEN_ORIGIN', message: 'Forbidden origin' };
  }

  // 2. CSRF header validation
  if (!validateCsrf(req)) {
    return { authorized: false, status: 403, error: 'INVALID_CSRF', message: 'Missing or invalid CSRF header' };
  }

  // 3. Bearer token extraction
  const token = extractBearerToken(req);
  if (!token) {
    return { authorized: false, status: 401, error: 'UNAUTHORIZED', message: 'Missing Bearer token' };
  }

  // 4. JWT verification
  let claims;
  try {
    claims = await verifySupabaseJwt(token);
  } catch {
    return { authorized: false, status: 401, error: 'INVALID_TOKEN', message: 'Invalid or expired access token' };
  }

  // 5. Database active session & role check via auth_util.is_dashboard_owner()
  const db = getDatabaseAdapter();
  const isOwner = await db.isDashboardOwner(token);
  if (!isOwner) {
    return { authorized: false, status: 403, error: 'FORBIDDEN_NOT_OWNER', message: 'Forbidden: caller is not an active dashboard owner' };
  }

  return { authorized: true, user: claims, token };
}

/**
 * Authorizes POST /api/seo/sync requests.
 * Dual-path authorization:
 * - Runner Path: Verified YORVEN_SYNC_RUNNER_SECRET (no Origin/CSRF requirement).
 * - Owner Path: Verified Owner AAL2 JWT with strict Origin and CSRF enforcement.
 */
export async function authorizeSyncRequest(req, res) {
  setSecurityHeaders(res);

  const token = extractBearerToken(req);
  if (!token) {
    return { authorized: false, status: 401, error: 'UNAUTHORIZED', message: 'Missing Bearer token' };
  }

  // 1. Check if token matches runner secret
  if (verifyRunnerSecret(token)) {
    return {
      authorized: true,
      caller: 'runner',
      workerId: 'worker-vercel-runner'
    };
  }

  // 2. Otherwise, must be a browser-based Owner request (requires Origin + CSRF)
  if (!validateOrigin(req)) {
    return { authorized: false, status: 403, error: 'FORBIDDEN_ORIGIN', message: 'Forbidden origin' };
  }

  if (!validateCsrf(req)) {
    return { authorized: false, status: 403, error: 'INVALID_CSRF', message: 'Missing or invalid CSRF header' };
  }

  let claims;
  try {
    claims = await verifySupabaseJwt(token);
  } catch {
    return { authorized: false, status: 401, error: 'UNAUTHORIZED', message: 'Invalid credentials or runner secret' };
  }

  const db = getDatabaseAdapter();
  const isOwner = await db.isDashboardOwner(token);
  if (!isOwner) {
    return { authorized: false, status: 403, error: 'FORBIDDEN_NOT_OWNER', message: 'Forbidden: caller is not an active dashboard owner' };
  }

  return {
    authorized: true,
    caller: 'owner',
    workerId: 'worker-vercel-owner',
    user: claims,
    token
  };
}
