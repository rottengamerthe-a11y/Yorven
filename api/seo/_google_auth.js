/**
 * Google Service Account OAuth2 Token Manager
 * Handles JWT assertion generation, RS256 signing, and token exchange.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';

// In-memory token cache: Map<cacheKey, { accessToken: string, expiresAt: number }>
const tokenCache = new Map();

/**
 * Normalizes PEM private key strings, handling escaped newlines (\n)
 * or surrounding quotes from environment variables.
 *
 * @param {string} rawKey
 * @returns {string} Normalized PEM string
 */
export function normalizePrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    throw new Error('CONFIG_ERROR: Private key is missing or invalid');
  }

  let key = rawKey.trim();
  // Strip surrounding double or single quotes if present
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  // Replace literal '\n' characters with actual newlines
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  if (!key.includes('-----BEGIN PRIVATE KEY-----') && !key.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    throw new Error('CONFIG_ERROR: Malformed private key: missing PEM header');
  }

  return key;
}

/**
 * Generates an RS256-signed JWT assertion for Google OAuth2 token exchange.
 *
 * @param {Object} params
 * @param {string} params.clientEmail
 * @param {string} params.privateKey
 * @param {string} params.scope
 * @returns {string} Signed JWT assertion
 */
export function generateSignedJwtAssertion({ clientEmail, privateKey, scope }) {
  if (!clientEmail || typeof clientEmail !== 'string' || !clientEmail.trim()) {
    throw new Error('CONFIG_ERROR: Missing client email for Google authentication');
  }

  const pemKey = normalizePrivateKey(privateKey);

  const nowSec = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const payload = {
    iss: clientEmail.trim(),
    scope: scope.trim(),
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSec + 3600,
    iat: nowSec
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsignedToken = `${b64Header}.${b64Payload}`;

  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    const signature = signer.sign(pemKey, 'base64url');
    return `${unsignedToken}.${signature}`;
  } catch (err) {
    // Redact any potential key material from error message
    throw new Error('CONFIG_ERROR: Failed to sign JWT assertion with private key');
  }
}

/**
 * Retrieves a valid Google OAuth2 access token for the given credentials and scope.
 * Caches tokens until 5 minutes before their expiration.
 *
 * @param {Object} options
 * @param {string} options.clientEmail
 * @param {string} options.privateKey
 * @param {string} options.scope
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.fetchImpl] - Optional fetch injection for testing
 * @returns {Promise<string>} Bearer access token
 */
export async function getGoogleAccessToken({
  clientEmail,
  privateKey,
  scope,
  signal,
  fetchImpl = fetch
}) {
  if (!clientEmail || typeof clientEmail !== 'string' || !clientEmail.trim()) {
    throw new Error('CONFIG_ERROR: Missing Google client email configuration');
  }
  if (!privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
    throw new Error('CONFIG_ERROR: Missing Google private key configuration');
  }
  if (!scope || typeof scope !== 'string' || !scope.trim()) {
    throw new Error('CONFIG_ERROR: Missing OAuth2 scope');
  }

  const cacheKey = `${clientEmail.trim()}::${scope.trim()}`;
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  // Reuse token if still valid for more than 5 minutes (300,000 ms)
  if (cached && cached.expiresAt > now + 300000) {
    return cached.accessToken;
  }

  const assertion = generateSignedJwtAssertion({ clientEmail, privateKey, scope });

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  let res;
  try {
    res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      signal
    });
  } catch (err) {
    throw new Error(`AUTH_TRANSPORT_ERROR: Google OAuth2 token request failed: ${err.message}`);
  }

  if (!res.ok) {
    let errBody = '';
    try {
      const errJson = await res.json();
      errBody = errJson?.error_description || errJson?.error || `HTTP ${res.status}`;
    } catch {
      errBody = `HTTP ${res.status}`;
    }
    // Never log raw assertion or credentials
    throw new Error(`AUTH_REJECTED: Google OAuth2 token exchange rejected: ${errBody}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('AUTH_PARSE_ERROR: Failed to parse Google OAuth2 token response');
  }

  if (!data?.access_token) {
    throw new Error('AUTH_EMPTY_TOKEN: Google OAuth2 response did not contain an access_token');
  }

  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: now + expiresInSec * 1000
  });

  return data.access_token;
}

/**
 * Resets the in-process token cache (primarily for testing).
 */
export function clearTokenCache() {
  tokenCache.clear();
}
