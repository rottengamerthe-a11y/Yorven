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
export const COOKIE_ENROLL_NAME = '__Host-yorven-enroll';
export const COOKIE_MFA_NAME = '__Host-yorven-mfa';



export function setEnrollCookie(res, encryptedPayload) {
  const serialized = cookie.serialize(COOKIE_ENROLL_NAME, encryptedPayload, {
    httpOnly: true,
    // Secure flag only in production to allow HTTP localhost during development
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: MFA_COOKIE_MAX_AGE,
    priority: 'high'
  });
  appendCookie(res, serialized);
}

export function clearEnrollCookie(res) {
  const serialized = cookie.serialize(COOKIE_ENROLL_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  });
  appendCookie(res, serialized);
}


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
    // Secure flag only in production to allow HTTP localhost during development
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
// Decrypts AES-256-GCM ciphertext.
export function decryptAesGcm(encryptedHex, ivHex, authTagHex, secret = process.env.AUTH_SECRET) {
  if (!secret) {
    throw new Error('CONFIG_ERROR: AUTH_SECRET not configured');
  }
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
const MAX_JWKS_RESPONSE_BYTES = 100 * 1024;
const MAX_KEYS_COUNT = 50;
const MAX_CACHED_ORIGINS = 10;
const DEFAULT_JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_JWKS_MIN_REFRESH_INTERVAL_MS = 10 * 1000; // 10 seconds cooldown between successful refreshes
const DEFAULT_JWKS_REFRESH_BACKOFF_MS = 10 * 1000; // 10 seconds backoff on failed refreshes
const DEFAULT_JWKS_TIMEOUT_MS = 5000; // 5 seconds

export function validateAndNormalizeJwksOrigin(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL must be configured');
  }

  let parsed;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error('CONFIG_ERROR: SUPABASE_URL is an invalid URL');
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && (!isLocal || parsed.protocol !== 'http:')) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL must use HTTPS protocol');
  }

  if (parsed.username || parsed.password) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL must not contain credentials');
  }

  if (parsed.search || parsed.hash) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL must not contain query parameters or fragments');
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('CONFIG_ERROR: SUPABASE_URL must not contain a path component');
  }

  return parsed.origin;
}

function validateEcCoordinate(coord) {
  if (typeof coord !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(coord)) {
    return false;
  }
  const buf = Buffer.from(coord, 'base64url');
  return buf.length === 32 && buf.toString('base64url') === coord;
}

async function readBoundedBody(res, maxBytes, signal) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    throw new Error('JWKS response body is not streamable');
  }

  const reader = res.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  if (signal?.aborted) {
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
    throw new Error('JWKS fetch aborted due to timeout');
  }

  const abortHandler = () => {
    try { reader.cancel(); } catch {}
  };
  if (signal) {
    signal.addEventListener('abort', abortHandler, { once: true });
  }

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error('JWKS fetch aborted due to timeout');
      }

      const { done, value } = await reader.read();
      if (done) {
        if (signal?.aborted) {
          throw new Error('JWKS fetch aborted due to timeout');
        }
        break;
      }
      if (!value) continue;

      const chunkBytes = value.byteLength !== undefined ? value.byteLength : value.length || 0;
      totalBytes += chunkBytes;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error('JWKS response exceeded maximum allowable size');
      }
      chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
    try {
      reader.releaseLock();
    } catch {}
  }

  return Buffer.concat(chunks).toString('utf8');
}

export class SupabaseJwksClient {
  constructor(options = {}) {
    this.origins = new Map();
    this.ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_JWKS_CACHE_TTL_MS;
    this.minRefreshIntervalMs = typeof options.minRefreshIntervalMs === 'number'
      ? options.minRefreshIntervalMs
      : DEFAULT_JWKS_MIN_REFRESH_INTERVAL_MS;
    this.backoffMs = typeof options.backoffMs === 'number' ? options.backoffMs : DEFAULT_JWKS_REFRESH_BACKOFF_MS;
    this.timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_JWKS_TIMEOUT_MS;
    this.customFetch = options.fetch || null;
  }

  clearCache() {
    this.origins.clear();
  }

  getOriginState(origin) {
    let state = this.origins.get(origin);
    if (state) {
      // Refresh recency for LRU ordering
      this.origins.delete(origin);
      this.origins.set(origin, state);
      return state;
    }

    if (this.origins.size >= MAX_CACHED_ORIGINS) {
      // Evict least-recently-used origin
      const oldestKey = this.origins.keys().next().value;
      this.origins.delete(oldestKey);
    }
    state = {
      keys: new Map(),
      lastFetchedAt: 0,
      lastFailedAt: 0,
      inFlightPromise: null
    };
    this.origins.set(origin, state);
    return state;
  }

  get cache() {
    const first = this.origins.values().next().value;
    return first ? first.keys : new Map();
  }

  async getSigningKey(kid, baseUrl) {
    if (!kid || typeof kid !== 'string' || !kid.trim() || !/^[a-zA-Z0-9_-]{1,128}$/.test(kid)) {
      throw new Error('CONFIG_ERROR: Valid kid header is required for ES256 verification');
    }

    const origin = validateAndNormalizeJwksOrigin(baseUrl);
    const originState = this.getOriginState(origin);
    const now = Date.now();

    // 1. If key is in cache and within normal 1-hour TTL, return immediately
    const isCached = originState.keys.has(kid);
    const isCacheExpired = (now - originState.lastFetchedAt) >= this.ttlMs;

    if (isCached && !isCacheExpired) {
      return originState.keys.get(kid);
    }

    // 2. Rate-limiting backoff on repeated failed refreshes
    if (now - originState.lastFailedAt < this.backoffMs) {
      throw new Error('CONFIG_ERROR: JWKS refresh rate-limited due to recent failure');
    }

    // 3. Prevent rapid successive refreshes triggered by unknown kid flooding
    // If the key is not in cache, but a successful refresh already occurred recently,
    // do not hammer the JWKS endpoint again until the cooldown has passed.
    if (!isCached && originState.lastFetchedAt > 0 && (now - originState.lastFetchedAt) < this.minRefreshIntervalMs) {
      throw new Error(`CONFIG_ERROR: Key ID ${kid} not found in Supabase JWKS (refresh cooldown active)`);
    }

    // 4. Deduplicate concurrent refreshes with a shared in-flight promise per origin
    if (!originState.inFlightPromise) {
      originState.inFlightPromise = this.fetchAndCache(origin).finally(() => {
        originState.inFlightPromise = null;
      });
    }

    await originState.inFlightPromise;

    if (originState.keys.has(kid)) {
      return originState.keys.get(kid);
    }

    throw new Error(`CONFIG_ERROR: Key ID ${kid} not found in Supabase JWKS`);
  }

  async fetchAndCache(origin) {
    const originState = this.getOriginState(origin);
    const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', origin).href;

    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const fetchFn = this.customFetch || globalThis.fetch;
      const headers = { Accept: 'application/json' };
      if (process.env.SUPABASE_ANON_KEY) {
        headers.apikey = process.env.SUPABASE_ANON_KEY;
      }

      const res = await fetchFn(jwksUrl, {
        method: 'GET',
        headers,
        signal
      });

      if (!res.ok) {
        throw new Error(`JWKS endpoint returned HTTP status ${res.status}`);
      }

      const text = await readBoundedBody(res, MAX_JWKS_RESPONSE_BYTES, signal);

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('JWKS response is not valid JSON');
      }

      if (!data || typeof data !== 'object' || !Array.isArray(data.keys)) {
        throw new Error('JWKS response missing keys array');
      }

      if (data.keys.length > MAX_KEYS_COUNT) {
        throw new Error('JWKS keys count exceeds maximum allowable limit');
      }

      const seenKids = new Set();
      const newMap = new Map();
      for (const k of data.keys) {
        if (!k || typeof k !== 'object') continue;
        if (typeof k.kid !== 'string' || !k.kid.trim() || !/^[a-zA-Z0-9_-]{1,128}$/.test(k.kid)) {
          continue;
        }

        if (seenKids.has(k.kid)) {
          throw new Error(`JWKS contains duplicate key ID: ${k.kid}`);
        }
        seenKids.add(k.kid);

        if (k.kty !== 'EC' || k.crv !== 'P-256') continue;
        if (k.alg !== undefined && k.alg !== 'ES256') continue;
        if (k.use !== undefined && k.use !== 'sig') continue;

        if (!validateEcCoordinate(k.x) || !validateEcCoordinate(k.y)) {
          continue;
        }

        try {
          const keyObj = crypto.createPublicKey({
            key: {
              kty: 'EC',
              crv: 'P-256',
              x: k.x,
              y: k.y
            },
            format: 'jwk'
          });
          newMap.set(k.kid, keyObj);
        } catch {
          // Skip unparseable keys
        }
      }

      if (newMap.size === 0) {
        throw new Error('JWKS contained no valid ES256 signing keys');
      }

      originState.keys = newMap;
      originState.lastFetchedAt = Date.now();
      originState.lastFailedAt = 0;
    } catch (err) {
      originState.lastFailedAt = Date.now();
      throw new Error(`CONFIG_ERROR: Failed to fetch JWKS: ${err.message}`);
    }
  }
}

let globalJwksClient = null;

export function getGlobalJwksClient() {
  if (!globalJwksClient) {
    globalJwksClient = new SupabaseJwksClient();
  }
  return globalJwksClient;
}

export function resetGlobalJwksClient() {
  if (globalJwksClient) {
    globalJwksClient.clearCache();
  }
  globalJwksClient = null;
}

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

  if (header.jwk !== undefined || header.jku !== undefined || header.x5c !== undefined || header.x5u !== undefined) {
    throw new Error('CONFIG_ERROR: Embedded key material or key-source headers are forbidden');
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
  } else if (algorithm === 'RS256') {
    const rawKey = options.publicKey || process.env.SUPABASE_JWT_PUBLIC_KEY;
    if (!rawKey) {
      throw new Error(`CONFIG_ERROR: Public key required for ${algorithm} verification`);
    }
    const publicKey = typeof rawKey === 'string' && rawKey.includes('\\n')
      ? rawKey.replace(/\\n/g, '\n')
      : rawKey;
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signedContent);
    const valid = verifier.verify(publicKey, b64Signature, 'base64url');
    if (!valid) {
      throw new Error('Invalid JWT signature');
    }
  } else if (algorithm === 'ES256') {
    let verifyKey;
    if (options.publicKey) {
      // Test-only override
      const rawKey = options.publicKey;
      const publicKey = typeof rawKey === 'string' && rawKey.includes('\\n')
        ? rawKey.replace(/\\n/g, '\n')
        : rawKey;
      verifyKey = { key: publicKey, dsaEncoding: 'ieee-p1363' };
    } else {
      // Production path: strictly resolve via JWKS client (NO fallback to SUPABASE_JWT_PUBLIC_KEY)
      if (typeof header.kid !== 'string' || !header.kid.trim() || !/^[a-zA-Z0-9_-]{1,128}$/.test(header.kid)) {
        throw new Error('CONFIG_ERROR: Valid kid header is required for ES256 verification');
      }
      if (!process.env.SUPABASE_URL || typeof process.env.SUPABASE_URL !== 'string' || !process.env.SUPABASE_URL.trim()) {
        throw new Error('CONFIG_ERROR: SUPABASE_URL must be configured');
      }
      const jwksClient = options.jwksClient || getGlobalJwksClient();
      const keyObj = await jwksClient.getSigningKey(header.kid, process.env.SUPABASE_URL);
      verifyKey = { key: keyObj, dsaEncoding: 'ieee-p1363' };
    }

    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedContent);
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
  // Delete an existing MFA factor (e.g., unverified TOTP)
  async deleteFactor(factorId, aal1AccessToken) {
    const res = await fetch(`${this.baseUrl}/auth/v1/factors/${factorId}`, {
      method: 'DELETE',
      headers: this.getHeaders({
        Authorization: `Bearer ${aal1AccessToken}`
      })
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

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

     async createFactor(factorType, aal1AccessToken, extra = {}) {
    const res = await fetch(`${this.baseUrl}/auth/v1/factors`, {
      method: 'POST',
      headers: this.getHeaders({
        Authorization: `Bearer ${aal1AccessToken}`
      }),
      body: JSON.stringify({
  factor_type: factorType,
  ...extra
})
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
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
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return false;
    }

    const rpcName = 'check_user_owner';
    try {
      const result = await this.callAuthUtilRpc(rpcName, {
        p_user_id: userId
      });
      return result === true;
    } catch (err) {
      let code = null;
      let classification = null;

      if (err?.data && typeof err.data === 'object') {
        if (typeof err.data.code === 'string') {
          code = err.data.code;
        }
        if (code === '42501') {
          const rawMsg = typeof err.data.message === 'string' ? err.data.message.toLowerCase() : '';
          if (rawMsg.includes('schema')) {
            classification = 'SCHEMA_PERMISSION_DENIED';
          } else if (rawMsg.includes('function')) {
            classification = 'FUNCTION_PERMISSION_DENIED';
          }
        }
      }

      if (!err?.status) {
        classification = 'NETWORK_ERROR';
      } else if (!classification) {
        classification = 'UNKNOWN_ERROR';
      }

      let host = 'UNKNOWN_HOST';
      try {
        if (this.supabaseUrl) {
          host = new URL(this.supabaseUrl).hostname || 'UNKNOWN_HOST';
        }
      } catch {
        host = 'UNKNOWN_HOST';
      }

      console.error('OWNER_ROLE_RPC_FAILED', {
        host,
        rpc: rpcName,
        status: typeof err?.status === 'number' ? err.status : 0,
        code,
        classification
      });
      return false;
    }
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
