// Tests for MFA login and verification flow using Node's built-in test runner
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.AUTH_SECRET = 'a'.repeat(64);
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key-12345';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'mock-anon-key-12345';

import { makeLoginHandler } from '../../api/auth/login.js';
import { makeMfaVerifyHandler } from '../../api/auth/mfa-verify.js';
import {
  packMfaPayload,
  COOKIE_MFA_NAME,
  COOKIE_REFRESH_NAME
} from '../../api/auth/_utils.js';

// Helper to create a mock response object capturing status, json payload and headers
function mockRes() {
  const res = {};
  res.status = (code) => { res._status = code; return res; };
  res.json = (obj) => { res._json = obj; return res; };
  res.setHeader = (name, value) => { (res._headers = res._headers || {})[name] = value; };
  res.getHeader = (name) => {
    return (res._headers && res._headers[name]) || undefined;
  };
  return res;
}

// Helper to generate a packed MFA cookie payload
function makeMfaCookie({
  createdAt = Date.now(),
  aal1AccessToken = 'mock-aal1-jwt',
  factorId = 'factor-totp-1',
  userId = 'user-owner-123'
} = {}) {
  const payload = { createdAt, aal1AccessToken, factorId, userId };
  return packMfaPayload(payload);
}

describe('MFA Login Step 1 (Password Authentication & MFA Discovery)', () => {
  test('password login discovers verified TOTP factor and does NOT create a challenge prematurely', async () => {
    let challengeCreated = false;
    const mockGotrue = {
      passwordSignIn: async () => ({
        ok: true,
        data: { access_token: 'valid-aal1-token', user: { id: 'user-owner-123' } }
      }),
      getUserFactors: async () => ({
        ok: true,
        data: [
          { id: 'factor-totp-1', factor_type: 'totp', status: 'verified', friendly_name: 'Yorven Authenticator' }
        ]
      }),
      createFactorChallenge: async () => {
        challengeCreated = true;
        return { ok: true, data: { id: 'cid-should-not-exist' } };
      }
    };

    const handler = makeLoginHandler({ getGoTrueClient: () => mockGotrue });
    const req = {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' },
      body: { email: 'owner@yorven.in', password: 'correct-password' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._json, {
      mfaRequired: true,
      factorId: 'factor-totp-1',
      challengeId: 'pending'
    });

    assert.equal(challengeCreated, false, 'createFactorChallenge MUST NOT be called prematurely during password login');

    // Cookie must be set with secure attributes
    const setCookieHeader = res.getHeader('Set-Cookie');
    assert.ok(setCookieHeader, 'Set-Cookie header must be emitted');
    const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : String(setCookieHeader);
    assert.ok(rawCookie.includes(`${COOKIE_MFA_NAME}=`), 'Must set intermediate MFA cookie');
    assert.ok(rawCookie.includes('HttpOnly'), 'Must be HttpOnly');
    assert.ok(rawCookie.includes('SameSite=Strict'), 'Must be SameSite=Strict');
  });

  test('rejects credentials when user has no verified TOTP factor', async () => {
    const mockGotrue = {
      passwordSignIn: async () => ({
        ok: true,
        data: { access_token: 'valid-aal1-token', user: { id: 'user-no-mfa' } }
      }),
      getUserFactors: async () => ({
        ok: true,
        data: [] // No factors
      })
    };

    const handler = makeLoginHandler({ getGoTrueClient: () => mockGotrue });
    const req = {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' },
      body: { email: 'owner@yorven.in', password: 'correct-password' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: 'MFA_NOT_ENROLLED' });
  });
});

describe('MFA Login Step 2 (Just-In-Time Challenge & Verification)', () => {
  test('verification creates a fresh challenge for each attempt', async () => {
    let createdChallenges = [];
    const mockGotrue = {
      createFactorChallenge: async (factorId, token) => {
        const id = `fresh-cid-${createdChallenges.length + 1}`;
        createdChallenges.push({ factorId, token, id });
        return { ok: true, data: { id } };
      },
      verifyFactorChallenge: async (factorId, challengeId, code, token) => {
        return { ok: false, status: 400, data: { error_code: 'invalid_grant' } };
      }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => ({}),
      clearMfaCookie: () => {}
    });

    const origConsoleError = console.error;
    console.error = () => {};

    try {
      const packed = makeMfaCookie({ factorId: 'factor-totp-1', aal1AccessToken: 'aal1-token' });
      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '111111' }
      };
      const res = mockRes();

      await handler(req, res);

      assert.equal(res._status, 401);
      assert.equal(createdChallenges.length, 1);
      assert.equal(createdChallenges[0].factorId, 'factor-totp-1');
      assert.equal(createdChallenges[0].token, 'aal1-token');
      assert.equal(createdChallenges[0].id, 'fresh-cid-1');
    } finally {
      console.error = origConsoleError;
    }
  });

  test('invalid code preserves the MFA cookie without destroying the session', async () => {
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-jit-1' } }),
      verifyFactorChallenge: async () => ({ ok: false, status: 400, data: { error_code: 'invalid_grant' } })
    };

    let cookieCleared = false;
    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => ({}),
      clearMfaCookie: () => { cookieCleared = true; }
    });

    const origConsoleError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);

    try {
      const packed = makeMfaCookie();
      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '000000' }
      };
      const res = mockRes();

      await handler(req, res);

      assert.equal(res._status, 401);
      assert.deepEqual(res._json, { error: 'INVALID_MFA_CODE' });
      assert.equal(cookieCleared, false, 'Cookie MUST NOT be cleared on invalid verification code');

      // Verify safe diagnostic logging
      const logEntry = logs.find(l => l[0] === 'MFA_LOGIN_VERIFY_FAILED');
      assert.ok(logEntry, 'Must log MFA_LOGIN_VERIFY_FAILED');
      assert.deepEqual(logEntry[1], {
        status: 400,
        code: 'invalid_grant',
        classification: 'INVALID_CODE'
      });
      const serialized = JSON.stringify(logs);
      assert.ok(!serialized.includes('000000'), 'Must never log TOTP code');
      assert.ok(!serialized.includes('mock-aal1-jwt'), 'Must never log access token');
    } finally {
      console.error = origConsoleError;
    }
  });

  test('a second attempt with the same MFA session can succeed and establishes session', async () => {
    let attemptCount = 0;
    const mockGotrue = {
      createFactorChallenge: async () => ({
        ok: true,
        data: { id: `challenge-${++attemptCount}` }
      }),
      verifyFactorChallenge: async (fId, cId, code) => {
        if (code === '000000') {
          return { ok: false, status: 400, data: { error_code: 'invalid_grant' } };
        }
        if (code === '654321') {
          return {
            ok: true,
            status: 200,
            data: {
              access_token: 'aal2-valid-jwt',
              refresh_token: 'aal2-valid-refresh',
              expires_in: 3600
            }
          };
        }
        return { ok: false, status: 400 };
      }
    };

    let recordedChallengeId = null;
    let sessionCreated = false;
    const mockDb = {
      recordMfaChallengeConsumption: async (challengeId) => {
        recordedChallengeId = challengeId;
        return true;
      },
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true
    };

    let clearCallCount = 0;
    let refreshSet = null;

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { clearCallCount++; },
      setRefreshCookie: (res, token) => { refreshSet = token; },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const origConsoleError = console.error;
    console.error = () => {};

    try {
      const packed = makeMfaCookie();

      // Attempt 1: Failed verification
      const req1 = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '000000' }
      };
      const res1 = mockRes();
      await handler(req1, res1);

      assert.equal(res1._status, 401);
      assert.deepEqual(res1._json, { error: 'INVALID_MFA_CODE' });
      assert.equal(clearCallCount, 0, 'Failed attempt 1 must not clear cookie');
      assert.equal(recordedChallengeId, null, 'Failed attempt 1 must not record consumption');

      // Attempt 2: Successful verification using the exact same MFA session cookie
      const req2 = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '654321' }
      };
      const res2 = mockRes();
      await handler(req2, res2);

      assert.equal(res2._status, 200);
      assert.deepEqual(res2._json, { accessToken: 'aal2-valid-jwt', expiresIn: 3600 });
      assert.equal(clearCallCount, 1, 'Successful verification must clear the temporary MFA cookie');
      assert.equal(refreshSet, 'aal2-valid-refresh', 'Successful verification must set the refresh cookie');
      assert.equal(recordedChallengeId, 'challenge-2', 'Consumption must be recorded for the successful challenge');
      assert.equal(sessionCreated, true, 'Active dashboard session must be registered');
    } finally {
      console.error = origConsoleError;
    }
  });

  test('consumption failure never grants an authenticated session (fails closed)', async () => {
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-jit' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-jwt', refresh_token: 'refresh', expires_in: 3600 }
      })
    };

    let sessionCreated = false;
    let cookieCleared = false;
    let refreshSet = false;

    const mockDb = {
      recordMfaChallengeConsumption: async () => {
        throw new Error('DATABASE_ERROR');
      },
      createDashboardSession: async () => { sessionCreated = true; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; }
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { error: 'DATABASE_ERROR' });
    assert.equal(cookieCleared, true, 'Must clear cookie on consumption failure');
    assert.equal(sessionCreated, false, 'Must never create dashboard session if consumption recording fails');
    assert.equal(refreshSet, false, 'Must never issue refresh cookie if consumption recording fails');
  });

  test('replayed or duplicate challenge throws CHALLENGE_ALREADY_USED', async () => {
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-replayed' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-jwt', refresh_token: 'refresh', expires_in: 3600 }
      })
    };

    let cookieCleared = false;
    const mockDb = {
      recordMfaChallengeConsumption: async () => {
        throw new Error('CHALLENGE_ALREADY_USED');
      }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; }
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 401);
    assert.deepEqual(res._json, { error: 'CHALLENGE_ALREADY_USED' });
    assert.equal(cookieCleared, true);
  });

  test('expired and malformed sessions are rejected and cleared', async () => {
    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => ({}),
      getDatabaseAdapter: () => ({})
    });

    // 1. Missing cookie
    const reqMissing = {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' },
      body: { code: '123456' }
    };
    const resMissing = mockRes();
    await handler(reqMissing, resMissing);
    assert.equal(resMissing._status, 401);
    assert.deepEqual(resMissing._json, { error: 'MFA_SESSION_EXPIRED' });

    // 2. Expired cookie (> 5 min)
    const expiredPacked = makeMfaCookie({ createdAt: Date.now() - 301000 });
    const reqExpired = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${expiredPacked}`
      },
      body: { code: '123456' }
    };
    const resExpired = mockRes();
    await handler(reqExpired, resExpired);
    assert.equal(resExpired._status, 401);
    assert.deepEqual(resExpired._json, { error: 'MFA_SESSION_EXPIRED' });

    // 3. Malformed cookie
    const reqMalformed = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=invalid.malformed.cookie`
      },
      body: { code: '123456' }
    };
    const resMalformed = mockRes();
    await handler(reqMalformed, resMalformed);
    assert.equal(resMalformed._status, 401);
    assert.deepEqual(resMalformed._json, { error: 'MFA_SESSION_EXPIRED' });
  });

  test('diagnostics correctly classify upstream failures safely', async () => {
    const origConsoleError = console.error;
    const testCases = [
      { status: 429, data: {}, expectedClass: 'RATE_LIMITED', expectedCode: null },
      { status: 500, data: { code: 'internal_error' }, expectedClass: 'UPSTREAM_ERROR', expectedCode: 'internal_error' },
      { status: 400, data: { error_code: 'expired_challenge' }, expectedClass: 'CHALLENGE_EXPIRED', expectedCode: 'expired_challenge' },
      { status: 422, data: { error_code: 'invalid_credentials' }, expectedClass: 'INVALID_CODE', expectedCode: 'invalid_credentials' },
      { status: 403, data: { error_code: 'forbidden' }, expectedClass: 'VERIFICATION_FAILED', expectedCode: 'forbidden' }
    ];

    try {
      for (const tc of testCases) {
        const logs = [];
        console.error = (...args) => logs.push(args);

        const mockGotrue = {
          createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-tc' } }),
          verifyFactorChallenge: async () => ({ ok: false, status: tc.status, data: tc.data })
        };

        const handler = makeMfaVerifyHandler({
          getGoTrueClient: () => mockGotrue,
          getDatabaseAdapter: () => ({})
        });

        const packed = makeMfaCookie();
        const req = {
          method: 'POST',
          headers: {
            origin: 'http://localhost:5173',
            'x-requested-with': 'Yorven-Control',
            cookie: `${COOKIE_MFA_NAME}=${packed}`
          },
          body: { code: '123456' }
        };
        const res = mockRes();
        await handler(req, res);

        assert.equal(res._status, 401);
        const log = logs.find(l => l[0] === 'MFA_LOGIN_VERIFY_FAILED');
        assert.ok(log, `Expected MFA_LOGIN_VERIFY_FAILED log for status ${tc.status}`);
        assert.deepEqual(log[1], {
          status: tc.status,
          code: tc.expectedCode,
          classification: tc.expectedClass
        });
      }
    } finally {
      console.error = origConsoleError;
    }
  });

  test('createFactorChallenge network exception produces controlled error, preserves cookie, issues no refresh token', async () => {
    let cookieCleared = false;
    let refreshSet = false;
    const mockGotrue = {
      createFactorChallenge: async () => {
        throw new TypeError('fetch failed: network timeout');
      }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => ({}),
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; }
    });

    const origConsoleError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);

    try {
      const packed = makeMfaCookie();
      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '123456' }
      };
      const res = mockRes();

      await handler(req, res);

      assert.equal(res._status, 500);
      assert.deepEqual(res._json, { error: 'MFA_CHALLENGE_FAILED' });
      assert.equal(cookieCleared, false, 'MFA cookie must be preserved for retry on network error');
      assert.equal(refreshSet, false, 'Refresh cookie must never be set');

      const log = logs.find(l => l[0] === 'MFA_LOGIN_CHALLENGE_FAILED');
      assert.ok(log, 'Must log safe diagnostic');
      assert.deepEqual(log[1], {
        status: 0,
        code: null,
        classification: 'NETWORK_ERROR'
      });
      const serialized = JSON.stringify(logs);
      assert.ok(!serialized.includes('fetch failed'), 'Must never log raw error message');
      assert.ok(!serialized.includes('123456'), 'Must never log code');
    } finally {
      console.error = origConsoleError;
    }
  });

  test('verifyFactorChallenge network exception produces controlled error, preserves cookie, issues no refresh token', async () => {
    let cookieCleared = false;
    let refreshSet = false;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-jit-net' } }),
      verifyFactorChallenge: async () => {
        throw new TypeError('fetch failed: socket reset');
      }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => ({}),
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; }
    });

    const origConsoleError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);

    try {
      const packed = makeMfaCookie();
      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '123456' }
      };
      const res = mockRes();

      await handler(req, res);

      assert.equal(res._status, 500);
      assert.deepEqual(res._json, { error: 'MFA_VERIFY_FAILED' });
      assert.equal(cookieCleared, false, 'MFA cookie must be preserved for retry on network error');
      assert.equal(refreshSet, false, 'Refresh cookie must never be set');

      const log = logs.find(l => l[0] === 'MFA_LOGIN_VERIFY_FAILED');
      assert.ok(log, 'Must log safe diagnostic');
      assert.deepEqual(log[1], {
        status: 0,
        code: null,
        classification: 'NETWORK_ERROR'
      });
      const serialized = JSON.stringify(logs);
      assert.ok(!serialized.includes('socket reset'), 'Must never log raw error message');
      assert.ok(!serialized.includes('123456'), 'Must never log code');
    } finally {
      console.error = origConsoleError;
    }
  });

  test('post-verification consumption failure triggers best-effort GoTrue logout and grants no session', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-fail-consume' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-token-consume-fail', refresh_token: 'refresh-token', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let cookieCleared = false;
    let refreshSet = false;
    const mockDb = {
      recordMfaChallengeConsumption: async () => {
        throw new Error('DATABASE_ERROR');
      },
      createDashboardSession: async () => { sessionCreated = true; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; }
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { error: 'DATABASE_ERROR' });
    assert.equal(cookieCleared, true, 'Temporary MFA cookie must be cleared on consumption error');
    assert.equal(refreshSet, false, 'Refresh cookie must never be set');
    assert.equal(sessionCreated, false, 'Dashboard session must never be created');
    assert.deepEqual(logoutCalledWith, { token: 'aal2-token-consume-fail', scope: 'local' }, 'Must invoke GoTrue local logout with AAL2 token');
  });

  test('post-verification JWT validation failure triggers best-effort GoTrue logout and grants no session', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-fail-jwt' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-token-bad-jwt', refresh_token: 'refresh-token', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let cookieCleared = false;
    let refreshSet = false;
    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      createDashboardSession: async () => { sessionCreated = true; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; },
      verifySupabaseJwt: async () => {
        throw new Error('JWT verification failed');
      }
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: 'INVALID_JWT_CLAIMS' });
    assert.equal(cookieCleared, true);
    assert.equal(refreshSet, false);
    assert.equal(sessionCreated, false);
    assert.deepEqual(logoutCalledWith, { token: 'aal2-token-bad-jwt', scope: 'local' });
  });

  test('post-verification owner-role rejection triggers best-effort GoTrue logout and grants no session', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-fail-owner' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-token-non-owner', refresh_token: 'refresh-token', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let cookieCleared = false;
    let refreshSet = false;
    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => false, // Rejection
      createDashboardSession: async () => { sessionCreated = true; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: 'FORBIDDEN_NOT_OWNER' });
    assert.equal(cookieCleared, true);
    assert.equal(refreshSet, false);
    assert.equal(sessionCreated, false);
    assert.deepEqual(logoutCalledWith, { token: 'aal2-token-non-owner', scope: 'local' });
  });

  test('null or malformed createFactorChallenge result returns controlled error and preserves cookie', async () => {
    let cookieCleared = false;
    let refreshSet = false;
    const mockGotrue = {
      createFactorChallenge: async () => null // Null result
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => ({}),
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; }
    });

    const origConsoleError = console.error;
    console.error = () => {};

    try {
      const packed = makeMfaCookie();
      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '123456' }
      };
      const res = mockRes();

      await handler(req, res);

      assert.equal(res._status, 500);
      assert.deepEqual(res._json, { error: 'MFA_CHALLENGE_FAILED' });
      assert.equal(cookieCleared, false, 'Cookie preserved on challenge failure');
      assert.equal(refreshSet, false);
    } finally {
      console.error = origConsoleError;
    }
  });

  test('null or malformed verifyFactorChallenge result returns controlled error and preserves cookie', async () => {
    let cookieCleared = false;
    let refreshSet = false;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => null // Null result
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => ({}),
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; }
    });

    const origConsoleError = console.error;
    console.error = () => {};

    try {
      const packed = makeMfaCookie();
      const req = {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control',
          cookie: `${COOKIE_MFA_NAME}=${packed}`
        },
        body: { code: '123456' }
      };
      const res = mockRes();

      await handler(req, res);

      assert.equal(res._status, 401);
      assert.deepEqual(res._json, { error: 'INVALID_MFA_CODE' });
      assert.equal(cookieCleared, false, 'Cookie preserved on invalid verify result');
      assert.equal(refreshSet, false);
    } finally {
      console.error = origConsoleError;
    }
  });

  test('missing or malformed AAL2 refresh token triggers logout and returns 500', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'valid-aal2-jwt', refresh_token: null, expires_in: 3600 } // Missing refresh token
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let cookieCleared = false;
    let refreshSet = false;
    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => ({}),
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => { refreshSet = true; }
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { error: 'INVALID_UPSTREAM_TOKENS' });
    assert.equal(cookieCleared, true);
    assert.equal(refreshSet, false);
    assert.deepEqual(logoutCalledWith, { token: 'valid-aal2-jwt', scope: 'local' });
  });

  test('null or malformed JWT claims object triggers logout and returns 403', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-token-null-claims', refresh_token: 'refresh-token', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let cookieCleared = false;
    const mockDb = {
      recordMfaChallengeConsumption: async () => true
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      verifySupabaseJwt: async () => null // Null claims object
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: 'INVALID_JWT_CLAIMS' });
    assert.equal(cookieCleared, true);
    assert.deepEqual(logoutCalledWith, { token: 'aal2-token-null-claims', scope: 'local' });
  });

  test('invalid or non-numeric exp in JWT claims triggers logout and returns 403', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-token-invalid-exp', refresh_token: 'refresh-token', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let cookieCleared = false;
    const mockDb = {
      recordMfaChallengeConsumption: async () => true
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: 'not-a-number' // Non-numeric exp
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: 'INVALID_JWT_CLAIMS' });
    assert.equal(cookieCleared, true);
    assert.deepEqual(logoutCalledWith, { token: 'aal2-token-invalid-exp', scope: 'local' });
  });

  test('refresh-cookie setter throwing triggers session deletion, GoTrue logout, and returns 500', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-token-cookie-throw', refresh_token: 'refresh-token-val', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let deletedSessionId = null;
    let cookieCleared = false;

    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true,
      deleteActiveSession: async (sid) => { deletedSessionId = sid; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: () => {
        throw new Error('Header serialization error');
      },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { error: 'SESSION_ISSUANCE_FAILED' });
    assert.equal(sessionCreated, true, 'Session was created prior to cookie failure');
    assert.equal(deletedSessionId, '12345678-1234-1234-1234-123456789abc', 'Session must be deleted on cookie failure');
    assert.deepEqual(logoutCalledWith, { token: 'aal2-token-cookie-throw', scope: 'local' }, 'GoTrue local logout must be invoked');
    assert.equal(cookieCleared, true, 'MFA cookie must be cleared');
  });

  test('successful login does NOT call GoTrue logout and sets refresh cookie', async () => {
    let logoutCalled = false;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-success-token', refresh_token: 'refresh-success-token', expires_in: 3600 }
      }),
      logout: async () => {
        logoutCalled = true;
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let cookieCleared = false;
    let refreshSet = null;

    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: (res, token) => { refreshSet = token; },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._json, { accessToken: 'aal2-success-token', expiresIn: 3600 });
    assert.equal(logoutCalled, false, 'Successful login MUST NOT call logout');
    assert.equal(sessionCreated, true);
    assert.equal(cookieCleared, true);
    assert.equal(refreshSet, 'refresh-success-token');
  });

  test('setRefreshCookie throwing because headers are already sent triggers session deletion and logout without second response', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-headers-sent', refresh_token: 'refresh-token-val', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let deletedSessionId = null;

    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true,
      deleteActiveSession: async (sid) => { deletedSessionId = sid; }
    };

    let statusCalls = 0;
    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => {},
      clearRefreshCookie: () => {},
      setRefreshCookie: () => {
        throw new Error('ERR_HTTP_HEADERS_SENT: Cannot set headers after they are sent to the client');
      },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();
    res.headersSent = true; // Simulate headers already written
    res.status = (code) => {
      statusCalls++;
      res._status = code;
      return res;
    };

    await handler(req, res);

    assert.equal(sessionCreated, true);
    assert.equal(deletedSessionId, '12345678-1234-1234-1234-123456789abc', 'Session must be deleted');
    assert.deepEqual(logoutCalledWith, { token: 'aal2-headers-sent', scope: 'local' }, 'GoTrue local logout must be invoked');
    assert.equal(statusCalls, 0, 'No second response must be attempted when headersSent is true');
  });

  test('clearMfaCookie throwing during issuance cleanup does not prevent GoTrue logout or session deletion', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-clear-mfa-throw', refresh_token: 'refresh-token-val', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let deletedSessionId = null;

    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true,
      deleteActiveSession: async (sid) => { deletedSessionId = sid; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => {
        throw new Error('ERR_MFA_COOKIE_MUTATION_FAILED');
      },
      clearRefreshCookie: () => {},
      setRefreshCookie: () => {
        throw new Error('Simulated setRefreshCookie failure');
      },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { error: 'SESSION_ISSUANCE_FAILED' });
    assert.equal(sessionCreated, true);
    assert.equal(deletedSessionId, '12345678-1234-1234-1234-123456789abc', 'Session deletion must still succeed');
    assert.deepEqual(logoutCalledWith, { token: 'aal2-clear-mfa-throw', scope: 'local' }, 'Logout must still succeed');
  });

  test('clearRefreshCookie throwing during issuance cleanup does not prevent GoTrue logout or session deletion', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-clear-refresh-throw', refresh_token: 'refresh-token-val', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let deletedSessionId = null;

    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true,
      deleteActiveSession: async (sid) => { deletedSessionId = sid; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => {},
      clearRefreshCookie: () => {
        throw new Error('ERR_REFRESH_COOKIE_MUTATION_FAILED');
      },
      setRefreshCookie: () => {
        throw new Error('Simulated setRefreshCookie failure');
      },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { error: 'SESSION_ISSUANCE_FAILED' });
    assert.equal(sessionCreated, true);
    assert.equal(deletedSessionId, '12345678-1234-1234-1234-123456789abc', 'Session deletion must still succeed');
    assert.deepEqual(logoutCalledWith, { token: 'aal2-clear-refresh-throw', scope: 'local' }, 'Logout must still succeed');
  });

  test('MFA cookie clearing throwing during step 9 prevents refresh cookie issuance, deletes session, and logs out', async () => {
    let logoutCalledWith = null;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-mfa-clear-fail', refresh_token: 'refresh-token-val', expires_in: 3600 }
      }),
      logout: async (token, scope) => {
        logoutCalledWith = { token, scope };
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let deletedSessionId = null;
    let refreshSet = false;

    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true,
      deleteActiveSession: async (sid) => { deletedSessionId = sid; }
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => {
        throw new Error('ERR_MFA_COOKIE_CLEAR_THROW');
      },
      clearRefreshCookie: () => {},
      setRefreshCookie: () => {
        refreshSet = true;
      },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._json, { error: 'SESSION_ISSUANCE_FAILED' });
    assert.equal(sessionCreated, true, 'Session created prior to issuance check');
    assert.equal(deletedSessionId, '12345678-1234-1234-1234-123456789abc', 'Session must be deleted when MFA clearing fails');
    assert.deepEqual(logoutCalledWith, { token: 'aal2-mfa-clear-fail', scope: 'local' }, 'Logout must be executed');
    assert.equal(refreshSet, false, 'Refresh cookie MUST NOT be issued if MFA cookie clearing fails');
    assert.equal(res._json.accessToken, undefined, 'Access token MUST NOT be issued');
  });

  test('MFA cookie clearing succeeding in step 9 allows normal successful issuance', async () => {
    let logoutCalled = false;
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-valid' } }),
      verifyFactorChallenge: async () => ({
        ok: true,
        data: { access_token: 'aal2-normal-success', refresh_token: 'refresh-token-normal', expires_in: 3600 }
      }),
      logout: async () => {
        logoutCalled = true;
        return { ok: true };
      }
    };

    let sessionCreated = false;
    let cookieCleared = false;
    let refreshSet = null;

    const mockDb = {
      recordMfaChallengeConsumption: async () => true,
      checkUserOwnerRole: async () => true,
      createDashboardSession: async () => { sessionCreated = true; },
      isDashboardOwner: async () => true
    };

    const handler = makeMfaVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      getDatabaseAdapter: () => mockDb,
      clearMfaCookie: () => { cookieCleared = true; },
      setRefreshCookie: (res, token) => { refreshSet = token; },
      verifySupabaseJwt: async () => ({
        sub: 'user-owner-123',
        session_id: '12345678-1234-1234-1234-123456789abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    });

    const packed = makeMfaCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_MFA_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._json, { accessToken: 'aal2-normal-success', expiresIn: 3600 });
    assert.equal(sessionCreated, true);
    assert.equal(cookieCleared, true);
    assert.equal(refreshSet, 'refresh-token-normal');
    assert.equal(logoutCalled, false, 'No logout on success');
  });
});
