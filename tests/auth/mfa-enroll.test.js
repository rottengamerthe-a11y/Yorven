// Tests for MFA enrollment and verification endpoints using Node's built-in test runner
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.AUTH_SECRET = 'a'.repeat(64);

import {
  makeEnrollHandler,
  makeEnrollVerifyHandler,
  makeConsolidatedHandler
} from '../../api/auth/mfa-enroll.js';
import { packMfaPayload, COOKIE_ENROLL_NAME } from '../../api/auth/_utils.js';

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
