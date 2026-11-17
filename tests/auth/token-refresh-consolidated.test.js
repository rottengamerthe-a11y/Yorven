import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.AUTH_SECRET = 'a'.repeat(64);
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key-12345';

import handler from '../../api/auth/token.js';
import {
  COOKIE_REFRESH_NAME,
  encryptAesGcm,
  hashToken,
  setDatabaseAdapter,
  setGoTrueClient,
  DatabaseAdapter,
  GoTrueClient
} from '../../api/auth/_utils.js';

// Setup HS256 JWT environment for fast deterministic testing
const JWT_SECRET = 'a'.repeat(32);

function mockRes() {
  const res = {};
  res._status = 200;
  res._headers = {};
  res._json = null;
  res.status = (code) => {
    res._status = code;
    return res;
  };
  res.json = (obj) => {
    res._json = obj;
    return res;
  };
  res.setHeader = (name, value) => {
    res._headers[name.toLowerCase()] = value;
  };
  res.getHeader = (name) => res._headers[name.toLowerCase()];
  return res;
}

function makeValidToken(userId = '00000000-0000-4000-8000-000000000001', sessionId = '00000000-0000-4000-8000-000000000002') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    aal: 'aal2',
    session_id: sessionId,
    iss: 'https://mock.supabase.co/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const b64H = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64P = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${b64H}.${b64P}`).digest('base64url');
  return `${b64H}.${b64P}.${sig}`;
}

describe('Consolidated Session Handler (/api/auth/token & /api/auth/refresh)', () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_ALGORITHM = 'HS256';
    process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    setDatabaseAdapter(new DatabaseAdapter());
    setGoTrueClient(new GoTrueClient());
  });

  // --------------------------------------------------------------------------
  // 1. GET Method -> Follower Tab Token Retrieval
  // --------------------------------------------------------------------------
  describe('GET Method -> Token Retrieval (/api/auth/token)', () => {
    test('rejects request with invalid origin', async () => {
      const req = {
        method: 'GET',
        headers: {
          origin: 'https://malicious-site.com',
          'x-requested-with': 'Yorven-Control'
        }
      };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res._status, 403);
      assert.equal(res._json.error, 'Invalid or missing origin');
    });

    test('rejects request with missing CSRF header', async () => {
      const req = {
        method: 'GET',
        headers: {
          origin: 'http://localhost:5173'
        }
      };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res._status, 403);
      assert.equal(res._json.error, 'Missing required custom header');
    });

    test('rejects request when refresh cookie is missing', async () => {
      const req = {
        method: 'GET',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control'
        }
      };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res._status, 401);
      assert.equal(res._json.error, 'UNAUTHORIZED');
    });

    test('returns decrypted accessToken when session is active', async () => {
      const plainAccessToken = 'ey-valid-decrypted-access-token';
      const encrypted = encryptAesGcm(plainAccessToken);

      const mockDb = {
        getActiveSessionToken: async () => ({
          status: 'active',
          encrypted_token: encrypted.encrypted,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          remaining_seconds: 3500
        })
      };
      setDatabaseAdapter(mockDb);

      const req = {
        method: 'GET',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_REFRESH_NAME}=my-mock-refresh-token`
        }
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 200);
      assert.equal(res._json.accessToken, plainAccessToken);
      assert.equal(res._json.expiresIn, 3500);
    });

    test('returns status refresh_in_progress with retryAfter', async () => {
      const mockDb = {
        getActiveSessionToken: async () => ({
          status: 'refresh_in_progress',
          retry_after_sec: 2
        })
      };
      setDatabaseAdapter(mockDb);

      const req = {
        method: 'GET',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_REFRESH_NAME}=my-mock-refresh-token`
        }
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 200);
      assert.equal(res._json.status, 'refresh_in_progress');
      assert.equal(res._json.retryAfter, 2);
    });

    test('returns status refresh_required when token needs refresh', async () => {
      const mockDb = {
        getActiveSessionToken: async () => ({
          status: 'refresh_required'
        })
      };
      setDatabaseAdapter(mockDb);

      const req = {
        method: 'GET',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_REFRESH_NAME}=my-mock-refresh-token`
        }
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 200);
      assert.equal(res._json.status, 'refresh_required');
    });

    test('returns 401 and clears cookie when session is revoked', async () => {
      const mockDb = {
        getActiveSessionToken: async () => ({
          status: 'revoked'
        })
      };
      setDatabaseAdapter(mockDb);

      const req = {
        method: 'GET',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_REFRESH_NAME}=my-mock-refresh-token`
        }
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 401);
      assert.equal(res._json.error, 'REVOKED');
      const cookies = Array.isArray(res._headers['set-cookie'])
        ? res._headers['set-cookie'].join(';')
        : (res._headers['set-cookie'] || '');
      assert.ok(cookies.includes('Max-Age=0'));
    });
  });

  // --------------------------------------------------------------------------
  // 2. POST Method -> Leader Tab Token Refresh
  // --------------------------------------------------------------------------
  describe('POST Method -> Token Refresh (/api/auth/refresh)', () => {
    test('rejects POST request with missing refresh cookie', async () => {
      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control'
        }
      };
      const res = mockRes();
      await handler(req, res);
      assert.equal(res._status, 401);
      assert.equal(res._json.error, 'REFRESH_TOKEN_REQUIRED');
    });

    test('returns 429 with Retry-After when lease contention occurs', async () => {
      const mockDb = {
        acquireRefreshLease: async () => ({
          acquired: false,
          lease_held: true,
          retry_after_ms: 3000
        })
      };
      setDatabaseAdapter(mockDb);

      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_REFRESH_NAME}=my-mock-refresh-token`
        }
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 429);
      assert.equal(res._json.error, 'REFRESH_IN_PROGRESS');
      assert.equal(res.getHeader('Retry-After'), '3');
    });

    test('successfully refreshes token, commits session, and rotates cookie', async () => {
      const userId = '00000000-0000-4000-8000-000000000001';
      const sessionId = '00000000-0000-4000-8000-000000000002';
      const newAccessToken = makeValidToken(userId, sessionId);
      const newRefreshToken = 'new-refresh-token-xyz';

      const mockDb = {
        acquireRefreshLease: async () => ({
          acquired: true,
          session_id: sessionId,
          user_id: userId,
          generation: 2
        }),
        commitRefreshSuccess: async () => ({
          success: true,
          idempotent: false
        })
      };
      setDatabaseAdapter(mockDb);

      const mockGoTrue = {
        exchangeRefreshToken: async () => ({
          ok: true,
          data: {
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            expires_in: 3600
          }
        })
      };
      setGoTrueClient(mockGoTrue);

      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_REFRESH_NAME}=my-old-refresh-token`
        }
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 200);
      assert.equal(res._json.accessToken, newAccessToken);
      assert.equal(res._json.expiresIn, 3600);
      assert.equal(res._json.idempotent, false);

      // Verify that new refresh cookie was issued
      const cookies = Array.isArray(res._headers['set-cookie'])
        ? res._headers['set-cookie'].join(';')
        : (res._headers['set-cookie'] || '');
      assert.ok(cookies.includes(COOKIE_REFRESH_NAME));
      assert.ok(cookies.includes(newRefreshToken));
    });
  });

  // --------------------------------------------------------------------------
  // 3. Unsupported HTTP Methods
  // --------------------------------------------------------------------------
  describe('Unsupported HTTP Methods', () => {
    test('returns 405 Method Not Allowed with Allow header on PUT, DELETE, PATCH', async () => {
      const unsupportedMethods = ['PUT', 'DELETE', 'PATCH'];

      for (const method of unsupportedMethods) {
        const req = {
          method,
          headers: {
            origin: 'http://localhost:5173',
            'x-requested-with': 'Yorven-Control'
          }
        };
        const res = mockRes();
        await handler(req, res);

        assert.equal(res._status, 405);
        assert.equal(res._json.error, 'Method not allowed');
        assert.equal(res.getHeader('Allow'), 'GET, POST');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Vercel Configuration & Routing Verification
  // --------------------------------------------------------------------------
  describe('Vercel Routing & Discovery Verification', () => {
    test('vercel.json includes rewrite from /api/auth/refresh to /api/auth/token', () => {
      const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
      assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');

      const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
      assert.ok(Array.isArray(config.rewrites), 'vercel.json must have rewrites array');

      const refreshRewrite = config.rewrites.find(
        (r) => r.source === '/api/auth/refresh' && r.destination === '/api/auth/token'
      );
      assert.ok(refreshRewrite, 'Rewrite rule /api/auth/refresh -> /api/auth/token must be defined');

      // Ensure SPA catch-all remains at the end
      const lastRewrite = config.rewrites[config.rewrites.length - 1];
      assert.equal(lastRewrite.source, '/((?!api/).*)');
      assert.equal(lastRewrite.destination, '/');
    });

    test('Vercel discovers exactly 12 Serverless Functions in tracked files', () => {
      // Find all tracked .js files in api/ that do NOT start with underscore
      const apiDir = path.resolve(process.cwd(), 'api');
      const files = fs.readdirSync(apiDir, { recursive: true });

      const discoveredFunctions = files.filter((f) => {
        const filename = path.basename(f);
        // Exclude private modules starting with underscore and non-js files
        if (filename.startsWith('_') || !filename.endsWith('.js')) return false;

        // Verify it is not an untracked scratch file (history.js, issues.js)
        const relPath = path.join('api', f).replace(/\\/g, '/');
        const isTracked = [
          'api/contact.js',
          'api/auth/login.js',
          'api/auth/logout.js',
          'api/auth/mfa-enroll.js',
          'api/auth/mfa-verify.js',
          'api/auth/token.js',
          'api/seo/overview.js',
          'api/seo/metrics.js',
          'api/seo/pages.js',
          'api/seo/status.js',
          'api/seo/sync.js',
          'api/seo/inspect.js'
        ].includes(relPath);

        return isTracked;
      });

      assert.equal(
        discoveredFunctions.length,
        12,
        `Expected exactly 12 Serverless Functions for Vercel Hobby plan, found ${discoveredFunctions.length}`
      );
    });
  });
});
