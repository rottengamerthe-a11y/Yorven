import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from '../../api/seo/inspect.js';
import {
  DatabaseAdapter,
  setDatabaseAdapter
} from '../../api/auth/_utils.js';
import {
  setCustomUrlInspectionFetcher
} from '../../api/seo/_url_inspection_adapter.js';

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
    res._headers[name] = value;
  };
  res.getHeader = (name) => res._headers[name];
  return res;
}

function makeValidToken(userId = '00000000-0000-4000-8000-000000000001') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    aal: 'aal2',
    session_id: '00000000-0000-4000-8000-000000000002',
    iss: 'https://mock.supabase.co/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const b64H = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64P = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${b64H}.${b64P}`).digest('base64url');
  return `${b64H}.${b64P}.${sig}`;
}

describe('Manual URL Inspection API (POST /api/seo/inspect)', () => {
  let originalFetch;
  let validToken;
  let mockPages;
  const targetPageId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.SUPABASE_JWT_ALGORITHM = 'HS256';
    process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

    validToken = makeValidToken();
    setCustomUrlInspectionFetcher(null);

    mockPages = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        path: '/',
        title: 'Home',
        canonical_url: 'https://yorven.in',
        is_indexed: true,
        last_crawled_at: '2026-11-01T00:00:00Z'
      },
      {
        id: targetPageId,
        path: '/work',
        title: 'Work',
        canonical_url: 'https://yorven.in/work',
        is_indexed: true,
        last_crawled_at: '2026-11-01T00:00:00Z'
      }
    ];

    globalThis.fetch = async (url) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const defaultDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({ apikey: 'mock-key' }),
      isDashboardOwner: async () => true,
      callAuthUtilRpc: async () => 'mock-default-job-id'
    };
    setDatabaseAdapter(defaultDb);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setDatabaseAdapter(new DatabaseAdapter());
    setCustomUrlInspectionFetcher(null);
  });

  function makeAuthorizedReq(body = { page_id: targetPageId }, method = 'POST') {
    return {
      method,
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        authorization: `Bearer ${validToken}`
      },
      body
    };
  }

  // 1. POST-only enforcement
  test('Method Not Allowed: rejects GET, PUT, and DELETE with 405', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const req = makeAuthorizedReq(null, method);
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 405);
      assert.equal(res.getHeader('Allow'), 'POST');
      assert.equal(res._json?.error, 'METHOD_NOT_ALLOWED');
    }
  });

  // 2. Missing authentication
  test('Authentication: rejects requests missing Bearer token with 401', async () => {
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control'
      },
      body: { page_id: targetPageId }
    };
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 401);
    assert.equal(res._json?.error, 'UNAUTHORIZED');
  });

  // 3. Invalid Origin
  test('Origin validation: rejects untrusted origin with 403', async () => {
    const req = {
      method: 'POST',
      headers: {
        origin: 'https://evil.com',
        'x-requested-with': 'Yorven-Control',
        authorization: `Bearer ${validToken}`
      },
      body: { page_id: targetPageId }
    };
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 403);
    assert.equal(res._json?.error, 'FORBIDDEN_ORIGIN');
  });

  // 4. Missing CSRF header
  test('CSRF validation: rejects missing X-Requested-With header with 403', async () => {
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        authorization: `Bearer ${validToken}`
      },
      body: { page_id: targetPageId }
    };
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 403);
    assert.equal(res._json?.error, 'INVALID_CSRF');
  });

  // 5. Non-owner rejection
  test('Role authorization: rejects authenticated non-owner with 403', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => false
    };
    setDatabaseAdapter(mockDb);

    const req = makeAuthorizedReq();
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 403);
    assert.equal(res._json?.error, 'FORBIDDEN_NOT_OWNER');
  });

  // 6. Invalid or missing page UUID
  test('Input validation: rejects missing, non-string, or malformed page UUID with 400', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true
    };
    setDatabaseAdapter(mockDb);

    const invalidBodies = [
      {},
      { page_id: '' },
      { page_id: 'not-a-valid-uuid' },
      { page_id: 12345 },
      { page_id: '12345678-1234-1234-1234-12345678901z' },
      null,
      'invalid json string'
    ];

    for (const body of invalidBodies) {
      const req = makeAuthorizedReq(body);
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 400);
      assert.ok(res._json?.error === 'INVALID_PAGE_ID' || res._json?.error === 'INVALID_INPUT');
    }
  });

  // 7. Arbitrary URL fields rejection
  test('Security: rejects arbitrary client-supplied URL fields with 400', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true
    };
    setDatabaseAdapter(mockDb);

    const forbiddenBodies = [
      { page_id: targetPageId, url: 'https://attacker.com/evil' },
      { page_id: targetPageId, inspection_url: 'https://attacker.com/evil' },
      { page_id: targetPageId, inspectionUrl: 'https://attacker.com/evil' },
      { page_id: targetPageId, site_url: 'https://attacker.com/' },
      { page_id: targetPageId, siteUrl: 'https://attacker.com/' }
    ];

    for (const body of forbiddenBodies) {
      const req = makeAuthorizedReq(body);
      const res = mockRes();
      await handler(req, res);

      assert.equal(res._status, 400);
      assert.equal(res._json?.error, 'INVALID_INPUT');
      assert.match(res._json?.message, /Arbitrary URL fields are not permitted/);
    }
  });

  // 8. Missing page returns 404
  test('Registry validation: returns 404 when page_id is missing from database', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true
    };
    setDatabaseAdapter(mockDb);

    const unknownPageId = '99999999-9999-4999-8999-999999999999';
    const req = makeAuthorizedReq({ page_id: unknownPageId });
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 404);
    assert.equal(res._json?.error, 'PAGE_NOT_FOUND');
    assert.match(res._json?.message, /No monitored route found with ID/);
  });

  // 9. Ineligible page returns 404
  test('Eligibility validation: returns 404 when page exists in raw table but is not in monitored routes registry', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true
    };
    setDatabaseAdapter(mockDb);

    // Mock registry that only contains route '/' but not targetPageId
    globalThis.fetch = async (url) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return {
          ok: true,
          status: 200,
          json: async () => [mockPages[0]] // only '/'
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const req = makeAuthorizedReq({ page_id: targetPageId });
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 404);
    assert.equal(res._json?.error, 'PAGE_NOT_FOUND');
  });

  // 10. Successful enqueue returns 202 and correct response
  test('Enqueue: successfully queues url_inspection_single job with 202 Accepted', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true,
      callAuthUtilRpc: async (name, params) => {
        return 'queued-job-uuid-555';
      }
    };
    setDatabaseAdapter(mockDb);

    const req = makeAuthorizedReq({ page_id: targetPageId });
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 202);
    assert.equal(res._json?.success, true);
    assert.equal(res._json?.job_id, 'queued-job-uuid-555');
    assert.equal(res._json?.job_type, 'url_inspection_single');
    assert.equal(res._json?.status, 'pending');
    assert.match(res._json?.message, /queued successfully/);
  });

  // 11. Correct job type, retry count, and payload passed to createSyncJob
  test('RPC parameter forwarding: passes url_inspection_single, 3 retries, and page_id payload', async () => {
    let capturedRpc = null;
    let capturedParams = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true,
      callAuthUtilRpc: async (name, params) => {
        capturedRpc = name;
        capturedParams = params;
        return 'queued-job-uuid-888';
      }
    };
    setDatabaseAdapter(mockDb);

    const req = makeAuthorizedReq({ page_id: targetPageId });
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 202);
    assert.equal(capturedRpc, 'create_sync_job');
    assert.equal(capturedParams.p_job_type, 'url_inspection_single');
    assert.equal(capturedParams.p_max_retries, 3);
    assert.deepEqual(capturedParams.p_payload, { page_id: targetPageId });
  });

  // 12. Duplicate active job returns 409
  test('Conflict: returns 409 when an inspection job is already active for the route', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true,
      callAuthUtilRpc: async () => {
        const err = new Error('duplicate key value violates unique constraint "uq_seo_sync_jobs_active_inspection_single"');
        err.status = 409;
        err.data = { code: '23505', message: 'duplicate key value violates unique constraint' };
        throw err;
      }
    };
    setDatabaseAdapter(mockDb);

    const req = makeAuthorizedReq({ page_id: targetPageId });
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 409);
    assert.equal(res._json?.error, 'CONFLICT_ACTIVE_JOB');
    assert.match(res._json?.message, /already active/);
  });

  // 13. Unexpected database failure returns sanitized 500
  test('Internal Error: unexpected database failure returns clean 500 without leaking error details', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true,
      callAuthUtilRpc: async () => {
        throw new Error('FATAL: connection to server at postgresql://postgres:secret@internal failed');
      }
    };
    setDatabaseAdapter(mockDb);

    const req = makeAuthorizedReq({ page_id: targetPageId });
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 500);
    assert.equal(res._json?.error, 'INTERNAL_ERROR');
    assert.equal(res._json?.message, 'Failed to enqueue inspection job');
    // Ensure no sensitive connection string was leaked
    assert.equal('secret' in (res._json || {}), false);
    assert.ok(!JSON.stringify(res._json).includes('postgresql'));
  });

  // 14. Endpoint never invokes Google API or claims a job
  test('Isolation: endpoint never calls Google API or claims a job directly', async () => {
    let googleApiInvoked = false;
    let claimRpcInvoked = false;

    setCustomUrlInspectionFetcher(async () => {
      googleApiInvoked = true;
      return {};
    });

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      isDashboardOwner: async () => true,
      callAuthUtilRpc: async (name) => {
        if (name === 'claim_sync_job') claimRpcInvoked = true;
        if (name === 'create_sync_job') return 'enqueued-job-1';
        return {};
      }
    };
    setDatabaseAdapter(mockDb);

    const req = makeAuthorizedReq({ page_id: targetPageId });
    const res = mockRes();
    await handler(req, res);

    assert.equal(res._status, 202);
    assert.equal(googleApiInvoked, false, 'Endpoint must not call Google API');
    assert.equal(claimRpcInvoked, false, 'Endpoint must not claim a job');
  });
});
