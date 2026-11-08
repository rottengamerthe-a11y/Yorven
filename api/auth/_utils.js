/**
 * Shared Authentication & Session Utilities
 * Yorven SEO Dashboard — Phase 2 Serverless Endpoints
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import cookie from 'cookie';

// ----------------------------------------------------------------------------
// 1. CONFIGURATION & ENVIRONMENT
// ----------------------------------------------------------------------------

export const COOKIE_REFRESH_NAME = '__Host-yorven-refresh';
export const COOKIE_MFA_NAME = '__Host-yorven-mfa';

export const REFRESH_COOKIE_MAX_AGE = 7776000; // 90 days in seconds
export const MFA_COOKIE_MAX_AGE = 300; // 5 minutes in seconds

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://yorven.in'
];

/**
 * Returns allowed origins including preview/dev origins when appropriate.
 */
export function getAllowedOrigins() {
  const allowed = [...DEFAULT_ALLOWED_ORIGINS];

  if (process.env.ALLOWED_ORIGINS) {
    const custom = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
    allowed.push(...custom);
  }

  if (process.env.VERCEL_URL) {
    allowed.push(`https://${process.env.VERCEL_URL}`);
  }

  if (process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development') {
    allowed.push(
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    );
  }

  return allowed;
}

// ----------------------------------------------------------------------------
// 2. CSRF & ORIGIN PREFLIGHT CONTROLS
// ----------------------------------------------------------------------------

/**
 * Validates request origin against the allowed origins allowlist.
 */
export function validateOrigin(req) {
  const originHeader = req.headers?.origin || req.headers?.referer;
  if (!originHeader || typeof originHeader !== 'string') {
    return false;
  }

  try {
    const origin = new URL(originHeader).origin;
    const allowed = getAllowedOrigins();
    return allowed.includes(origin);
  } catch {
    return false;
  }
}

/**
 * Validates the mandatory custom header X-Requested-With: Yorven-Control.
 */
export function validateCsrf(req) {
  const headerValue = req.headers?.['x-requested-with'];
  return headerValue === 'Yorven-Control';
}

/**
 * Sets mandatory security and cache headers on all auth responses.
 */
export function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
}

// ----------------------------------------------------------------------------
// 3. COOKIE PARSING & SERIALIZATION
// ----------------------------------------------------------------------------

/**
 * Safely parses cookies from the request headers without throwing on malformed inputs.
 */
export function parseCookies(req) {
  const rawCookie = req.headers?.cookie;
  if (!rawCookie || typeof rawCookie !== 'string') {
    return {};
  }
  try {
    return cookie.parse(rawCookie);
  } catch {
    return {};
  }
}

/**
 * Appends a Set-Cookie header safely to the ServerResponse without overwriting existing cookies.
 */
export function appendCookie(res, cookieStr) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  }
}

/**
 * Serializes and sets __Host-yorven-refresh cookie.
 * Follows strict RFC 6265bis __Host- constraints: Path=/, Secure, HttpOnly, no Domain.
 */
export function setRefreshCookie(res, refreshToken) {
  const serialized = cookie.serialize(COOKIE_REFRESH_NAME, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
    priority: 'high'
  });
  appendCookie(res, serialized);
}

/**
 * Clears the __Host-yorven-refresh cookie.
 */
export function clearRefreshCookie(res) {
  const serialized = cookie.serialize(COOKIE_REFRESH_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  });
  appendCookie(res, serialized);
}

/**
 * Serializes and sets __Host-yorven-mfa cookie.
 * Holds AES-256-GCM encrypted temporary context for 300 seconds.
 */
export function setMfaCookie(res, encryptedPayload) {
  const serialized = cookie.serialize(COOKIE_MFA_NAME, encryptedPayload, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: MFA_COOKIE_MAX_AGE,
    priority: 'high'
  });
  appendCookie(res, serialized);
}

/**
 * Clears the __Host-yorven-mfa cookie.
 */
export function clearMfaCookie(res) {
  const serialized = cookie.serialize(COOKIE_MFA_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  });
  appendCookie(res, serialized);
}

// ----------------------------------------------------------------------------
// 4. CRYPTOGRAPHIC PRIMITIVES (AES-256-GCM & HMAC-SHA256)
// ----------------------------------------------------------------------------

function derive32ByteKey(secret) {
  if (!secret) {
    throw new Error('CONFIG_ERROR: Required encryption/hash secret is not configured');
  }
  if (typeof secret === 'string' && /^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  const buf = Buffer.from(secret, 'utf8');
  if (buf.length === 32) {
    return buf;
  }
  return crypto.createHash('sha256').update(buf).digest();
}

/**
 * Computes deterministic HMAC-SHA256 hash of refresh token.
 * Output is 64 lowercase hex characters matching token_hash CHAR(64) and ^[0-9a-f]{64}$.
 */
export function hashToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token for hashing');
  }
  const secret = process.env.SESSION_HASH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('CONFIG_ERROR: SESSION_HASH_SECRET or AUTH_SECRET must be configured');
  }
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

/**
 * Encrypts plain text with AES-256-GCM using AUTH_SECRET.
 * Returns IV (24 hex chars), AuthTag (32 hex chars), and encrypted ciphertext (hex).
 */
export function encryptAesGcm(plainText, secret = process.env.AUTH_SECRET) {
  const key = derive32ByteKey(secret);
  const iv = crypto.randomBytes(12); // 12 bytes = 24 hex chars
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes = 32 hex chars

  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypts AES-256-GCM ciphertext.
 */
export function decryptAesGcm(encryptedHex, ivHex, authTagHex, secret = process.env.AUTH_SECRET) {
  const key = derive32ByteKey(secret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Serializes encrypted object into a single string for storage in __Host-yorven-mfa cookie.
 */
export function packMfaPayload(payload, secret = process.env.AUTH_SECRET) {
  const text = JSON.stringify(payload);
  const { encrypted, iv, authTag } = encryptAesGcm(text, secret);
  return `${iv}.${authTag}.${encrypted}`;
}

/**
 * Unpacks and decrypts __Host-yorven-mfa cookie string.
 */
export function unpackMfaPayload(packedStr, secret = process.env.AUTH_SECRET) {
  if (!packedStr || typeof packedStr !== 'string') {
    throw new Error('Invalid packed MFA payload');
  }
  const parts = packedStr.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed packed MFA payload');
  }
  const [iv, authTag, encrypted] = parts;
  const jsonStr = decryptAesGcm(encrypted, iv, authTag, secret);
  return JSON.parse(jsonStr);
}

// ----------------------------------------------------------------------------
// 5. JWT VERIFICATION (Section 5 Invariants)
// ----------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies Supabase JWT signature and claims with zero silent fallbacks.
 */
export async function verifySupabaseJwt(token, options = {}) {
  const algorithm = process.env.SUPABASE_JWT_ALGORITHM;
  if (!algorithm || !['HS256', 'RS256', 'ES256'].includes(algorithm)) {
    throw new Error('CONFIG_ERROR: SUPABASE_JWT_ALGORITHM must be explicitly set to HS256, RS256, or ES256');
  }

  if (!token || typeof token !== 'string') {
    throw new Error('JWT token is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('JWT must have 3 parts');
  }

  const [b64Header, b64Payload, b64Signature] = parts;
  let header, payload;

  try {
    header = JSON.parse(Buffer.from(b64Header, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid JWT encoding');
  }

  if (header.alg !== algorithm) {
    throw new Error(`JWT algorithm mismatch: expected ${algorithm}, got ${header.alg}`);
  }

  const signedContent = `${b64Header}.${b64Payload}`;

  if (algorithm === 'HS256') {
    const secretStr = process.env.SUPABASE_JWT_SECRET;
    if (!secretStr || secretStr.length < 32) {
      throw new Error('CONFIG_ERROR: SUPABASE_JWT_SECRET is missing or insufficient (min 32 chars)');
    }
    const expectedSig = crypto.createHmac('sha256', secretStr).update(signedContent).digest('base64url');
    const sigBuf = Buffer.from(b64Signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new Error('Invalid JWT signature');
    }
  } else if (algorithm === 'RS256' || algorithm === 'ES256') {
    // If JWKS public key or cert provided in options or environment
    const rawKey = options.publicKey || process.env.SUPABASE_JWT_PUBLIC_KEY;
    if (!rawKey) {
      throw new Error(`CONFIG_ERROR: Public key required for ${algorithm} verification`);
    }
    const publicKey = typeof rawKey === 'string' && rawKey.includes('\\n')
      ? rawKey.replace(/\\n/g, '\n')
      : rawKey;
    const verifier = crypto.createVerify(algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256');
    verifier.update(signedContent);
    const verifyKey = algorithm === 'ES256'
      ? { key: publicKey, dsaEncoding: 'ieee-p1363' }
      : publicKey;
    const valid = verifier.verify(verifyKey, b64Signature, 'base64url');
    if (!valid) {
      throw new Error('Invalid JWT signature');
    }
  }

  // Verify claims
  const nowSec = Math.floor(Date.now() / 1000);

  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('JWT token is expired');
  }

  if (payload.aud !== 'authenticated') {
    throw new Error(`Invalid audience: expected authenticated, got ${payload.aud}`);
  }

  if (!payload.sub || !UUID_REGEX.test(payload.sub)) {
    throw new Error('Invalid or missing sub claim');
  }

  if (options.requireAal2) {
    if (payload.aal !== 'aal2') {
      throw new Error(`Invalid AAL level: expected aal2, got ${payload.aal}`);
    }
    if (!payload.session_id || !UUID_REGEX.test(payload.session_id)) {
      throw new Error('Invalid or missing session_id claim');
    }
  }

  if (!process.env.SUPABASE_URL || typeof process.env.SUPABASE_URL !== 'string' || !process.env.SUPABASE_URL.trim()) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL must be configured');
  }

  const expectedIssuer = `${process.env.SUPABASE_URL.trim().replace(/\/+$/, '')}/auth/v1`;

  if (!payload.iss || typeof payload.iss !== 'string' || !payload.iss.trim()) {
    throw new Error('Invalid or missing iss claim');
  }

  const actualIssuer = payload.iss.trim().replace(/\/+$/, '');
  if (actualIssuer !== expectedIssuer) {
    throw new Error(`Invalid issuer: expected ${expectedIssuer}, got ${actualIssuer}`);
  }

  return payload;
}

// ----------------------------------------------------------------------------
// 6. GOTRUE AUTHENTICATION ADAPTER
// ----------------------------------------------------------------------------

export class GoTrueClient {
  constructor(baseUrl, anonKey) {
    this.baseUrl = (baseUrl || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.anonKey = anonKey || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  }

  getHeaders(extra = {}) {
    return {
      'Content-Type': 'application/json',
      apikey: this.anonKey,
      ...extra
    };
  }

  async passwordSignIn(email, password) {
    const res = await fetch(`${this.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  async getUserFactors(aal1AccessToken) {
    const res = await fetch(`${this.baseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: this.getHeaders({ Authorization: `Bearer ${aal1AccessToken}` })
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data: Array.isArray(data?.factors) ? data.factors : data };
  }

  async createFactorChallenge(factorId, aal1AccessToken) {
    const res = await fetch(`${this.baseUrl}/auth/v1/factors/${factorId}/challenge`, {
      method: 'POST',
      headers: this.getHeaders({ Authorization: `Bearer ${aal1AccessToken}` }),
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  async verifyFactorChallenge(factorId, challengeId, code, aal1AccessToken) {
    const res = await fetch(`${this.baseUrl}/auth/v1/factors/${factorId}/verify`, {
      method: 'POST',
      headers: this.getHeaders({ Authorization: `Bearer ${aal1AccessToken}` }),
      body: JSON.stringify({ challenge_id: challengeId, code })
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  async exchangeRefreshToken(refreshToken, options = {}) {
    const signal = options.signal || AbortSignal.timeout(6000);
    const res = await fetch(`${this.baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  async logout(accessToken, scope = 'local') {
    try {
      const res = await fetch(`${this.baseUrl}/auth/v1/logout?scope=${scope}`, {
        method: 'POST',
        headers: this.getHeaders({ Authorization: `Bearer ${accessToken}` })
      });
      return { status: res.status, ok: res.ok };
    } catch {
      return { status: 500, ok: false };
    }
  }
}

let activeGoTrue = new GoTrueClient();

export function getGoTrueClient() {
  return activeGoTrue;
}

export function setGoTrueClient(client) {
  activeGoTrue = client;
}

// ----------------------------------------------------------------------------
// 7. DATABASE & RPC ADAPTER
// ----------------------------------------------------------------------------

export class DatabaseAdapter {
  constructor() {
    this.supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  }

  getPostgrestHeaders(schema = 'public') {
    return {
      'Content-Type': 'application/json',
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      'Content-Profile': schema,
      'Accept-Profile': schema
    };
  }

  async callAuthUtilRpc(rpcName, params) {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: this.getPostgrestHeaders('auth_util'),
      body: JSON.stringify(params)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(`RPC ${rpcName} failed with HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async acquireRefreshLease(presentedHash, workerId, leaseAttemptId, leaseDurationMs = 12000) {
    return this.callAuthUtilRpc('acquire_refresh_lease', {
      p_presented_hash: presentedHash,
      p_worker_id: workerId,
      p_lease_attempt_id: leaseAttemptId,
      p_lease_duration_ms: leaseDurationMs
    });
  }

  async commitRefreshSuccess(sessionId, leaseAttemptId, expectedGeneration, newHash, encryptedToken, iv, authTag, accessTokenExpiresAt) {
    return this.callAuthUtilRpc('commit_refresh_success', {
      p_session_id: sessionId,
      p_lease_attempt_id: leaseAttemptId,
      p_expected_generation: expectedGeneration,
      p_new_refresh_token_hash: newHash,
      p_encrypted_access_token: encryptedToken,
      p_iv: iv,
      p_auth_tag: authTag,
      p_access_token_expires_at: accessTokenExpiresAt instanceof Date ? accessTokenExpiresAt.toISOString() : accessTokenExpiresAt
    });
  }

  async releaseRefreshLease(sessionId, leaseAttemptId, expectedGeneration) {
    try {
      return await this.callAuthUtilRpc('release_refresh_lease', {
        p_session_id: sessionId,
        p_lease_attempt_id: leaseAttemptId,
        p_expected_generation: expectedGeneration
      });
    } catch {
      // Best-effort release
      return null;
    }
  }

  async getActiveSessionToken(presentedHash) {
    return this.callAuthUtilRpc('get_active_session_token', {
      p_presented_hash: presentedHash
    });
  }

  async revokeDashboardSession(presentedHash, reason = 'user_logout') {
    return this.callAuthUtilRpc('revoke_dashboard_session', {
      p_presented_hash: presentedHash,
      p_reason: reason
    });
  }

  async recordMfaChallengeConsumption(challengeId, userId) {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/mfa_challenge_consumptions`, {
      method: 'POST',
      headers: {
        ...this.getPostgrestHeaders('public'),
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        challenge_id: challengeId,
        user_id: userId
      })
    });

    if (res.status === 409) {
      throw new Error('CHALLENGE_ALREADY_USED');
    }
    if (!res.ok) {
      throw new Error(`Failed to record challenge consumption: HTTP ${res.status}`);
    }
    return true;
  }

  async checkUserOwnerRole(userId) {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`, {
      method: 'GET',
      headers: this.getPostgrestHeaders('public')
    });
    if (!res.ok) {
      return false;
    }
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0 && rows[0].role === 'owner';
  }

  async deleteActiveSession(sessionId) {
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/active_dashboard_sessions?session_id=eq.${sessionId}`, {
        method: 'DELETE',
        headers: this.getPostgrestHeaders('public')
      });
    } catch {
      // Best-effort cleanup
    }
  }

  async createDashboardSession(sessionData, tokenHashData) {
    const sessionId = sessionData?.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('SESSION_ID_REQUIRED: session_id is required');
    }

    // 1. Safely query active_dashboard_sessions to ensure the session does not already exist
    const checkRes = await fetch(`${this.supabaseUrl}/rest/v1/active_dashboard_sessions?session_id=eq.${sessionId}&select=session_id`, {
      method: 'GET',
      headers: this.getPostgrestHeaders('public')
    });

    // A failed existence check must abort immediately. Never interpret failure as empty result.
    if (!checkRes.ok) {
      const err = new Error(`Database existence check failed with HTTP ${checkRes.status}`);
      err.status = checkRes.status;
      throw err;
    }

    let existing;
    try {
      existing = await checkRes.json();
    } catch {
      throw new Error('Database existence check returned malformed JSON response');
    }

    if (!Array.isArray(existing)) {
      throw new Error('Database existence check returned malformed response format');
    }

    if (existing.length > 0) {
      const err = new Error('SESSION_ALREADY_EXISTS: Active session already exists for this session_id');
      err.status = 409;
      throw err;
    }

    // 2. Insert active_dashboard_sessions using standard INSERT (Prefer: return=minimal).
    // NEVER use resolution=merge-duplicates (no overwrite allowed).
    let sessionCreatedByUs = false;
    const sessionRes = await fetch(`${this.supabaseUrl}/rest/v1/active_dashboard_sessions`, {
      method: 'POST',
      headers: {
        ...this.getPostgrestHeaders('public'),
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(sessionData)
    });

    if (!sessionRes.ok) {
      const err = new Error(`Failed to persist active session: HTTP ${sessionRes.status}`);
      err.status = sessionRes.status;
      throw err;
    }

    sessionCreatedByUs = true;

    // 3. Insert token hash using standard INSERT (Prefer: return=minimal).
    // NEVER delete existing token hashes merely to make a new insert succeed.
    try {
      const hashRes = await fetch(`${this.supabaseUrl}/rest/v1/dashboard_token_hashes`, {
        method: 'POST',
        headers: {
          ...this.getPostgrestHeaders('public'),
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(tokenHashData)
      });

      if (!hashRes.ok) {
        const err = new Error(`Failed to persist token hash: HTTP ${hashRes.status}`);
        err.status = hashRes.status;
        throw err;
      }
    } catch (err) {
      // Compensate ONLY when creation was positively established by this invocation.
      // Never delete a pre-existing session or foreign token hashes.
      if (sessionCreatedByUs) {
        await this.deleteActiveSession(sessionId).catch(() => {});
      }
      throw err;
    }

    return true;
  }

  async isDashboardOwner(accessToken) {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/rpc/is_dashboard_owner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.anonKey || process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Profile': 'auth_util',
        'Accept-Profile': 'auth_util'
      },
      body: JSON.stringify({})
    });
    if (!res.ok) return false;
    const result = await res.json().catch(() => false);
    return Boolean(result);
  }
}

let activeDb = new DatabaseAdapter();

export function getDatabaseAdapter() {
  return activeDb;
}

export function setDatabaseAdapter(adapter) {
  activeDb = adapter;
}
