// Tests for MFA enrollment and verification endpoints using Node's built-in test runner
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.AUTH_SECRET = 'a'.repeat(64);
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key-12345';

import {
  makeEnrollHandler,
  makeEnrollVerifyHandler,
  makeConsolidatedHandler
} from '../../api/auth/mfa-enroll.js';
import { packMfaPayload, COOKIE_ENROLL_NAME, DatabaseAdapter } from '../../api/auth/_utils.js';

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

// Helper to generate a packed enrollment cookie payload
function makeEnrollCookie({ createdAt = Date.now(), aal1AccessToken = 'AAL1', factorId = 'fid', userId = 'uid' } = {}) {
  const payload = { createdAt, aal1AccessToken, factorId, userId };
  return packMfaPayload(payload);
}

describe('MFA enrollment flow', () => {
  test('rejects non-owner', async () => {
    const mockGotrue = {
      passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
      getUserFactors: async () => ({ ok: true, data: [] })
    };
    const mockDb = { checkUserOwnerRole: async () => false };
    const handlerEnroll = makeEnrollHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
    const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { email: 'owner@yorven.in', password: 'pw' } };
    const res = mockRes();
    await handlerEnroll(req, res);
    assert.equal(res._status, 403);
    assert.deepEqual(res._json, { error: 'FORBIDDEN_NOT_OWNER' });
  });

  test('rejects when already has verified TOTP', async () => {
    const mockGotrue = {
      passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
      getUserFactors: async () => ({ ok: true, data: [{ factor_type: 'totp', status: 'verified' }] })
    };
    const mockDb = { checkUserOwnerRole: async () => true };
    const handlerEnroll = makeEnrollHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
    const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { email: 'owner@yorven.in', password: 'pw' } };
    const res = mockRes();
    await handlerEnroll(req, res);
    assert.equal(res._status, 409);
    assert.deepEqual(res._json, { error: 'MFA_ALREADY_ENROLLED' });
  });

  test('successful enrollment returns factorId and QR code', async () => {
    const mockGotrue = {
      passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
      getUserFactors: async () => ({ ok: true, data: [] }),
      createFactor: async () => ({ ok: true, data: { id: 'fid', totp: { qr_code: '<svg></svg>' } } })
    };
    const mockDb = { checkUserOwnerRole: async () => true };
    const handlerEnroll = makeEnrollHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
    const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { email: 'owner@yorven.in', password: 'pw' } };
    const res = mockRes();
    await handlerEnroll(req, res);
    assert.equal(res._status, 200);
    assert.deepEqual(res._json, { factorId: 'fid', qrCode: '<svg></svg>' });
  });
});

describe('MFA enrollment verification flow', () => {
  test('missing enrollment cookie is rejected', async () => {
    const mockGotrue = { createFactorChallenge: async () => ({}), verifyFactorChallenge: async () => ({}) };
    const handlerVerify = makeEnrollVerifyHandler({ getGoTrueClient: () => mockGotrue, clearEnrollCookie: () => {} });
    const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { code: '123456' } };
    const res = mockRes();
    await handlerVerify(req, res);
    assert.equal(res._status, 401);
    assert.deepEqual(res._json, { error: 'ENROLLMENT_SESSION_EXPIRED' });
  });

  test('expired enrollment cookie is rejected', async () => {
    const mockGotrue = { createFactorChallenge: async () => ({}), verifyFactorChallenge: async () => ({}) };
    const handlerVerify = makeEnrollVerifyHandler({ getGoTrueClient: () => mockGotrue, clearEnrollCookie: () => {} });
    const packed = makeEnrollCookie({ createdAt: Date.now() - 400000 }); // >5 min
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_ENROLL_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();
    await handlerVerify(req, res);
    assert.equal(res._status, 401);
    assert.deepEqual(res._json, { error: 'ENROLLMENT_SESSION_EXPIRED' });
  });

  test('invalid code format is rejected', async () => {
    const mockGotrue = { createFactorChallenge: async () => ({}), verifyFactorChallenge: async () => ({}) };
    const handlerVerify = makeEnrollVerifyHandler({ getGoTrueClient: () => mockGotrue, clearEnrollCookie: () => {} });
    const packed = makeEnrollCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_ENROLL_NAME}=${packed}`
      },
      body: { code: 'abc' }
    };
    const res = mockRes();
    await handlerVerify(req, res);
    assert.equal(res._status, 400);
    assert.deepEqual(res._json, { error: 'Invalid verification code format (6 digits required)' });
  });

  test('invalid TOTP code is rejected', async () => {
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid' } }),
      verifyFactorChallenge: async () => ({ ok: false })
    };
    let clearCalled = { called: false };
    const handlerVerify = makeEnrollVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      clearEnrollCookie: () => { clearCalled.called = true; }
    });
    // Test cleanup of unverified TOTP factors before enrollment
    test('deletes unverified TOTP before enrollment', async () => {
      const mockGotrue = {
        passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
        getUserFactors: async () => ({ ok: true, data: [{ id: 'old', factor_type: 'totp', status: 'unverified' }] }),
        deleteFactor: async () => ({ ok: true, status: 204 }),
        createFactor: async () => ({ ok: true, data: { id: 'fid', totp: { qr_code: '<svg></svg>' } } })
      };
      const mockDb = { checkUserOwnerRole: async () => true };
      const handlerEnroll = makeEnrollHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
      const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { email: 'owner@yorven.in', password: 'pw' } };
      const res = mockRes();
      await handlerEnroll(req, res);
      assert.equal(res._status, 200);
      assert.deepEqual(res._json, { factorId: 'fid', qrCode: '<svg></svg>' });
    });

    // Test deletion failure aborts enrollment
    test('deletion failure aborts enrollment', async () => {
      const mockGotrue = {
        passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
        getUserFactors: async () => ({ ok: true, data: [{ id: 'old', factor_type: 'totp', status: 'unverified' }] }),
        deleteFactor: async () => ({ ok: false, status: 500 }),
        createFactor: async () => ({ ok: true, data: { id: 'fid', totp: { qr_code: '<svg></svg>' } } })
      };
      const mockDb = { checkUserOwnerRole: async () => true };
      const handlerEnroll = makeEnrollHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
      const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { email: 'owner@yorven.in', password: 'pw' } };
      const res = mockRes();
      await handlerEnroll(req, res);
      assert.equal(res._status, 500);
      assert.deepEqual(res._json, { error: 'MFA_ENROLL_FAILED' });
    });
    const packed = makeEnrollCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_ENROLL_NAME}=${packed}`
      },
      body: { code: '000000' }
    };
    const res = mockRes();
    await handlerVerify(req, res);
    assert.equal(res._status, 401);
    assert.deepEqual(res._json, { error: 'INVALID_TOTP_CODE' });
    assert.ok(clearCalled.called, 'clearEnrollCookie should be called on failure');
  });

  test('successful verification clears cookie and returns success', async () => {
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid' } }),
      verifyFactorChallenge: async () => ({ ok: true })
    };
    let cleared = false;
    const handlerVerify = makeEnrollVerifyHandler({
      getGoTrueClient: () => mockGotrue,
      clearEnrollCookie: () => { cleared = true; }
    });
    // Test cleanup of unverified TOTP factors before enrollment
    test('deletes unverified TOTP before enrollment', async () => {
      const mockGotrue = {
        passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
        getUserFactors: async () => ({ ok: true, data: [{ id: 'old', factor_type: 'totp', status: 'unverified' }] }),
        deleteFactor: async () => ({ ok: true, status: 204 }),
        createFactor: async () => ({ ok: true, data: { id: 'fid', totp: { qr_code: '<svg></svg>' } } })
      };
      const mockDb = { checkUserOwnerRole: async () => true };
      const handlerEnroll = makeEnrollHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
      const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { email: 'owner@yorven.in', password: 'pw' } };
      const res = mockRes();
      await handlerEnroll(req, res);
      assert.equal(res._status, 200);
      assert.deepEqual(res._json, { factorId: 'fid', qrCode: '<svg></svg>' });
    });

    // Test deletion failure aborts enrollment
    test('deletion failure aborts enrollment', async () => {
      const mockGotrue = {
        passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
        getUserFactors: async () => ({ ok: true, data: [{ id: 'old', factor_type: 'totp', status: 'unverified' }] }),
        deleteFactor: async () => ({ ok: false, status: 500 }),
        createFactor: async () => ({ ok: true, data: { id: 'fid', totp: { qr_code: '<svg></svg>' } } })
      };
      const mockDb = { checkUserOwnerRole: async () => true };
      const handlerEnroll = makeEnrollHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
      const req = { method: 'POST', headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' }, body: { email: 'owner@yorven.in', password: 'pw' } };
      const res = mockRes();
      await handlerEnroll(req, res);
      assert.equal(res._status, 500);
      assert.deepEqual(res._json, { error: 'MFA_ENROLL_FAILED' });
    });
    const packed = makeEnrollCookie();
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_ENROLL_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();
    await handlerVerify(req, res);
    assert.equal(res._status, 200);
    assert.deepEqual(res._json, { success: true });
    assert.ok(cleared, 'clearEnrollCookie should be called on success');
  });
});

describe('Consolidated MFA Handler & Vercel Rewrites', () => {
  test('dispatches to enrollment initiation by default when no action parameter', async () => {
    const mockGotrue = {
      passwordSignIn: async () => ({ ok: true, data: { access_token: 'AAL1', user: { id: 'uid' } } }),
      getUserFactors: async () => ({ ok: true, data: [] }),
      createFactor: async () => ({ ok: true, data: { id: 'fid-123', totp: { qr_code: '<svg>qr</svg>' } } })
    };
    const mockDb = { checkUserOwnerRole: async () => true };
    const handler = makeConsolidatedHandler({ getGoTrueClient: () => mockGotrue, getDatabaseAdapter: () => mockDb });
    const req = {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', 'x-requested-with': 'Yorven-Control' },
      body: { email: 'owner@yorven.in', password: 'pw' }
    };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.deepEqual(res._json, { factorId: 'fid-123', qrCode: '<svg>qr</svg>' });
  });

  test('dispatches to verification when req.query.action === "verify"', async () => {
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-456' } }),
      verifyFactorChallenge: async () => ({ ok: true })
    };
    let cookieCleared = false;
    const handler = makeConsolidatedHandler({
      getGoTrueClient: () => mockGotrue,
      clearEnrollCookie: () => { cookieCleared = true; }
    });
    const packed = makeEnrollCookie();
    const req = {
      method: 'POST',
      query: { action: 'verify' },
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_ENROLL_NAME}=${packed}`
      },
      body: { code: '123456' }
    };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.deepEqual(res._json, { success: true });
    assert.equal(cookieCleared, true);
  });

  test('action === "verify" rejects invalid TOTP code', async () => {
    const mockGotrue = {
      createFactorChallenge: async () => ({ ok: true, data: { id: 'cid-456' } }),
      verifyFactorChallenge: async () => ({ ok: false })
    };
    let cookieCleared = false;
    const handler = makeConsolidatedHandler({
      getGoTrueClient: () => mockGotrue,
      clearEnrollCookie: () => { cookieCleared = true; }
    });
    const packed = makeEnrollCookie();
    const req = {
      method: 'POST',
      query: { action: 'verify' },
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        cookie: `${COOKIE_ENROLL_NAME}=${packed}`
      },
      body: { code: '000000' }
    };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 401);
    assert.deepEqual(res._json, { error: 'INVALID_TOTP_CODE' });
    assert.equal(cookieCleared, true);
  });

  test('vercel.json routes /api/auth/mfa-enroll-verify to consolidated handler', () => {
    const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    assert.ok(Array.isArray(vercelConfig.rewrites), 'rewrites array must exist');
    const verifyRewrite = vercelConfig.rewrites.find(
      (r) => r.source === '/api/auth/mfa-enroll-verify'
    );
    assert.ok(verifyRewrite, 'Rewrite rule for /api/auth/mfa-enroll-verify must exist');
    assert.equal(
      verifyRewrite.destination,
      '/api/auth/mfa-enroll?action=verify',
      'Destination must route to /api/auth/mfa-enroll?action=verify'
    );

    // Verify it is placed BEFORE the SPA fallback
    const verifyIndex = vercelConfig.rewrites.indexOf(verifyRewrite);
    const spaFallbackIndex = vercelConfig.rewrites.findIndex(
      (r) => r.destination === '/'
    );
    assert.ok(
      verifyIndex < spaFallbackIndex,
      'MFA verify rewrite must precede the SPA fallback rewrite'
    );
  });
});

describe('DatabaseAdapter.checkUserOwnerRole RPC verification and diagnostics', () => {
  let originalFetch;
  let originalConsoleError;
  let loggedErrors;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalConsoleError = console.error;
    loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args);
    };
  });

  function restore() {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  test('RPC returning true: calls auth_util.check_user_owner with correct headers, parameters, and returns true without logging', async () => {
    let capturedUrl;
    let capturedOptions;

    globalThis.fetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => true
      };
    };

    try {
      const db = new DatabaseAdapter();
      const isOwner = await db.checkUserOwnerRole('test-uuid-owner-1');
      assert.strictEqual(isOwner, true);
      assert.strictEqual(loggedErrors.length, 0);

      assert.ok(capturedUrl.endsWith('/rest/v1/rpc/check_user_owner'), 'URL must target check_user_owner RPC');
      assert.strictEqual(capturedOptions.method, 'POST');
      assert.strictEqual(capturedOptions.headers['Content-Profile'], 'auth_util');
      assert.strictEqual(capturedOptions.headers['Accept-Profile'], 'auth_util');
      assert.strictEqual(capturedOptions.headers['Content-Type'], 'application/json');
      assert.ok(capturedOptions.headers.apikey, 'apikey must be set');
      assert.ok(capturedOptions.headers.Authorization.startsWith('Bearer '), 'Authorization Bearer must be set');

      const body = JSON.parse(capturedOptions.body);
      assert.deepStrictEqual(body, { p_user_id: 'test-uuid-owner-1' });
    } finally {
      restore();
    }
  });

  test('RPC returning false: returns false without error logging', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => false
    });

    try {
      const db = new DatabaseAdapter();
      const isOwner = await db.checkUserOwnerRole('test-uuid-non-owner');
      assert.strictEqual(isOwner, false);
      assert.strictEqual(loggedErrors.length, 0);
    } finally {
      restore();
    }
  });

  test('unexpected response types: never uses truthy coercion, strictly requires boolean true', async () => {
    const invalidTruthyResponses = [
      'true',
      1,
      [{ role: 'owner' }],
      { role: 'owner' },
      'owner',
      [true],
      null,
      undefined
    ];

    try {
      const db = new DatabaseAdapter();
      for (const invalidResp of invalidTruthyResponses) {
        globalThis.fetch = async () => ({
          ok: true,
          status: 200,
          json: async () => invalidResp
        });

        const isOwner = await db.checkUserOwnerRole('test-uuid-coercion-check');
        assert.strictEqual(isOwner, false, `Expected ${JSON.stringify(invalidResp)} to evaluate to false (no truthy coercion)`);
        assert.strictEqual(loggedErrors.length, 0);
      }
    } finally {
      restore();
    }
  });

  test('null or invalid user IDs: returns false immediately without making RPC call or logging', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => true };
    };

    try {
      const db = new DatabaseAdapter();
      const invalidIds = [null, undefined, '', '   ', 12345, {}, []];

      for (const id of invalidIds) {
        fetchCalled = false;
        const isOwner = await db.checkUserOwnerRole(id);
        assert.strictEqual(isOwner, false, `Expected invalid ID ${JSON.stringify(id)} to return false`);
        assert.strictEqual(fetchCalled, false, 'Fetch must not be called for invalid userId');
        assert.strictEqual(loggedErrors.length, 0);
      }
    } finally {
      restore();
    }
  });

  test('RPC errors (non-OK PostgREST response): logs OWNER_ROLE_QUERY_FAILED and returns false without leaking raw errors', async () => {
    const rawPostgrestMsg = 'SENSITIVE_INTERNAL_DATABASE_MESSAGE_THAT_MUST_NEVER_LEAK';
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ code: '42501', message: rawPostgrestMsg })
    });

    try {
      const db = new DatabaseAdapter();
      const isOwner = await db.checkUserOwnerRole('test-uuid-error-1');
      assert.strictEqual(isOwner, false);
      assert.strictEqual(loggedErrors.length, 1);
      assert.strictEqual(loggedErrors[0][0], 'OWNER_ROLE_QUERY_FAILED');
      assert.deepStrictEqual(loggedErrors[0][1], {
        status: 401,
        code: '42501',
        message: 'PostgREST owner-role request failed'
      });
      const serialized = JSON.stringify(loggedErrors[0]);
      assert.ok(!serialized.includes(rawPostgrestMsg), 'Must never leak raw PostgREST message');
      assert.ok(!serialized.includes('test-uuid-error-1'));
      assert.ok(!serialized.includes('Bearer'));
    } finally {
      restore();
    }
  });

  test('malformed error response: logs UNKNOWN_ERROR with fixed message and returns false', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('Malformed non-JSON payload');
      }
    });

    try {
      const db = new DatabaseAdapter();
      const isOwner = await db.checkUserOwnerRole('test-uuid-error-2');
      assert.strictEqual(isOwner, false);
      assert.strictEqual(loggedErrors.length, 1);
      assert.strictEqual(loggedErrors[0][0], 'OWNER_ROLE_QUERY_FAILED');
      assert.deepStrictEqual(loggedErrors[0][1], {
        status: 502,
        code: 'UNKNOWN_ERROR',
        message: 'PostgREST owner-role request failed'
      });
      const serialized = JSON.stringify(loggedErrors[0]);
      assert.ok(!serialized.includes('test-uuid-error-2'));
      assert.ok(!serialized.includes('Malformed'));
    } finally {
      restore();
    }
  });

  test('network fetch error: logs sanitized network message and returns false', async () => {
    const sensitiveNetworkMsg = 'connect ECONNREFUSED 192.168.1.1:5432 secret_internal_host';
    globalThis.fetch = async () => {
      throw new Error(sensitiveNetworkMsg);
    };

    try {
      const db = new DatabaseAdapter();
      const isOwner = await db.checkUserOwnerRole('test-uuid-network-error');
      assert.strictEqual(isOwner, false);
      assert.strictEqual(loggedErrors.length, 1);
      assert.strictEqual(loggedErrors[0][0], 'OWNER_ROLE_QUERY_FAILED');
      assert.deepStrictEqual(loggedErrors[0][1], {
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Network fetch failed'
      });
      const serialized = JSON.stringify(loggedErrors[0]);
      assert.ok(!serialized.includes(sensitiveNetworkMsg), 'Must never leak raw network error message');
      assert.ok(!serialized.includes('test-uuid-network-error'));
    } finally {
      restore();
    }
  });
});

