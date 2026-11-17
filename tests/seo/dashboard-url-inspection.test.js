import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pagesHandler from '../../api/seo/pages.js';
import {
  DatabaseAdapter,
  setDatabaseAdapter
} from '../../api/auth/_utils.js';
import {
  inspectUrlApi,
  getPagesApi
} from '../../src/dashboard/api/dashboardClient.js';

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

describe('Dashboard URL Inspection Integration (Step 6)', () => {
  let originalFetch;
  let validToken;
  const targetPageId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.SUPABASE_JWT_ALGORITHM = 'HS256';
    process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

    validToken = makeValidToken();

    const defaultDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({ apikey: 'mock-key' }),
      isDashboardOwner: async () => true,
      callAuthUtilRpc: async () => true
    };
    setDatabaseAdapter(defaultDb);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setDatabaseAdapter(new DatabaseAdapter());
  });

  function makeAuthorizedReq(query = {}, method = 'GET') {
    return {
      method,
      headers: {
        origin: 'http://localhost:5173',
        'x-requested-with': 'Yorven-Control',
        authorization: `Bearer ${validToken}`
      },
      query
    };
  }

  // --------------------------------------------------------------------------
  // 1. Dashboard API Client: inspectUrlApi
  // --------------------------------------------------------------------------
  describe('inspectUrlApi Client Helper', () => {
    test('sends POST /api/seo/inspect with page_id, CSRF header, and Bearer token', async () => {
      let capturedUrl = null;
      let capturedOptions = null;

      globalThis.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          status: 202,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            job_id: 'job-inspect-123',
            status: 'pending',
            message: 'Inspection queued'
          })
        };
      };

      const res = await inspectUrlApi(validToken, targetPageId);

      assert.equal(capturedUrl, '/api/seo/inspect');
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['X-Requested-With'], 'Yorven-Control');
      assert.equal(capturedOptions.headers['Authorization'], `Bearer ${validToken}`);
      assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
      assert.equal(capturedOptions.credentials, 'same-origin');

      const body = JSON.parse(capturedOptions.body);
      assert.equal(body.page_id, targetPageId);
      assert.equal('url' in body, false, 'Client must never supply arbitrary URLs');

      assert.equal(res.status, 202);
      assert.equal(res.enqueued, true);
      assert.equal(res.data.job_id, 'job-inspect-123');
    });

    test('handles HTTP 409 conflict gracefully with CONFLICT_ACTIVE_JOB code', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'CONFLICT_ACTIVE_JOB',
          message: 'An inspection job is already active for this route.'
        })
      });

      await assert.rejects(
        async () => {
          await inspectUrlApi(validToken, targetPageId);
        },
        (err) => {
          assert.equal(err.status, 409);
          assert.equal(err.code, 'CONFLICT_ACTIVE_JOB');
          assert.match(err.message, /already active/i);
          return true;
        }
      );
    });

    test('handles upstream 500 error gracefully without leaking server details', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'INTERNAL_ERROR',
          message: 'Failed to enqueue inspection job'
        })
      });

      await assert.rejects(
        async () => {
          await inspectUrlApi(validToken, targetPageId);
        },
        (err) => {
          assert.equal(err.status, 500);
          assert.match(err.message, /Failed to enqueue inspection job/);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Dashboard API Client: getPagesApi
  // --------------------------------------------------------------------------
  describe('getPagesApi Client Helper', () => {
    test('fetches all monitored routes with GET /api/seo/pages', async () => {
      let capturedUrl = null;
      globalThis.fetch = async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ pages: [{ id: targetPageId, path: '/services' }] })
        };
      };

      const res = await getPagesApi(validToken);
      assert.equal(capturedUrl, '/api/seo/pages');
      assert.equal(res.pages.length, 1);
    });

    test('fetches single route detail with query parameter ?id=<UUID>', async () => {
      let capturedUrl = null;
      globalThis.fetch = async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ page: { id: targetPageId, path: '/services' } })
        };
      };

      const res = await getPagesApi(validToken, targetPageId);
      assert.equal(capturedUrl, `/api/seo/pages?id=${targetPageId}`);
      assert.equal(res.page.id, targetPageId);
    });
  });

  // --------------------------------------------------------------------------
  // 3. API Handler GET /api/seo/pages with Live Inspection Metadata
  // --------------------------------------------------------------------------
  describe('GET /api/seo/pages Backend Endpoint', () => {
    test('strictly enforces GET method (rejects POST/PUT with 405)', async () => {
      const req = makeAuthorizedReq({}, 'POST');
      const res = mockRes();

      await pagesHandler(req, res);
      assert.equal(res._status, 405);
      assert.equal(res._json.error, 'METHOD_NOT_ALLOWED');
      assert.equal(res._headers['Allow'], 'GET');
    });

    test('rejects unauthenticated request with 401', async () => {
      const req = {
        method: 'GET',
        headers: {
          origin: 'http://localhost:5173',
          'x-requested-with': 'Yorven-Control'
        }
      };
      const res = mockRes();

      await pagesHandler(req, res);
      assert.equal(res._status, 401);
    });

    test('returns live inspection metadata from seo_monitored_pages_view', async () => {
      const mockViewRows = [
        {
          page_id: targetPageId,
          path: '/services',
          title: 'Services',
          canonical_url: 'https://yorven.in/services',
          active_job_id: null,
          active_job_type: null,
          active_job_status: null,
          is_pending: false,
          is_processing: false,
          latest_attempt_status: 'success',
          latest_attempt_verdict: 'PASS',
          latest_attempt_coverage_state: 'Submitted and indexed',
          latest_attempt_error_code: null,
          latest_attempt_error_message: null,
          latest_attempt_time: '2026-11-17T12:05:00Z',
          last_successful_verdict: 'PASS',
          last_successful_coverage_state: 'Submitted and indexed',
          last_successful_google_crawl_time: '2026-11-17T11:45:00Z',
          last_successful_inspected_at: '2026-11-17T12:05:00Z',
          computed_state: 'success',
          is_never_inspected: false
        }
      ];

      globalThis.fetch = async (url) => {
        if (url.includes('seo_monitored_pages_view')) {
          return { ok: true, status: 200, json: async () => mockViewRows };
        }
        if (url.includes('seo_search_console_metrics') || url.includes('seo_ga4_metrics')) {
          return { ok: true, status: 200, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => [] };
      };

      const req = makeAuthorizedReq();
      const res = mockRes();

      await pagesHandler(req, res);

      assert.equal(res._status, 200);
      assert.equal(res._json.pages.length, 1);

      const page = res._json.pages[0];
      assert.equal(page.id, targetPageId);
      assert.equal(page.path, '/services');
      assert.equal(page.is_indexed, true);
      assert.equal(page.indexing_status_verified, true);
      assert.equal(page.inspection_verdict, 'PASS');
      assert.equal(page.coverage_state, 'Submitted and indexed');
      assert.equal(page.google_last_crawl_time, '2026-11-17T11:45:00Z');
      assert.equal(page.last_inspected_at, '2026-11-17T12:05:00Z');
      assert.equal(page.is_pending, false);
      assert.equal(page.is_processing, false);
      assert.equal(page.computed_state, 'success');
    });

    test('exposes pending and processing flags when inspection job is active in queue', async () => {
      const mockActiveViewRows = [
        {
          page_id: targetPageId,
          path: '/services',
          title: 'Services',
          canonical_url: 'https://yorven.in/services',
          active_job_id: 'job-active-888',
          active_job_type: 'url_inspection_single',
          active_job_status: 'processing',
          is_pending: false,
          is_processing: true,
          latest_attempt_status: null,
          latest_attempt_verdict: null,
          latest_attempt_coverage_state: null,
          latest_attempt_error_code: null,
          latest_attempt_error_message: null,
          latest_attempt_time: null,
          last_successful_verdict: null,
          last_successful_coverage_state: null,
          last_successful_google_crawl_time: null,
          last_successful_inspected_at: null,
          computed_state: 'processing',
          is_never_inspected: false
        }
      ];

      globalThis.fetch = async (url) => {
        if (url.includes('seo_monitored_pages_view')) {
          return { ok: true, status: 200, json: async () => mockActiveViewRows };
        }
        return { ok: true, status: 200, json: async () => [] };
      };

      const req = makeAuthorizedReq();
      const res = mockRes();

      await pagesHandler(req, res);

      assert.equal(res._status, 200);
      const page = res._json.pages[0];
      assert.equal(page.is_processing, true);
      assert.equal(page.computed_state, 'processing');
      assert.equal(page.active_job.id, 'job-active-888');
      assert.equal(page.active_job.status, 'processing');
    });

    test('single route detail returns inspection_history array and top queries', async () => {
      const mockHistoryRows = [
        {
          id: 'hist-1',
          attempt_status: 'success',
          verdict: 'PASS',
          coverage_state: 'Submitted and indexed',
          indexing_state: 'INDEXING_ALLOWED',
          robots_txt_state: 'ALLOWED',
          page_fetch_state: 'SUCCESSFUL',
          google_canonical: 'https://yorven.in/services',
          user_canonical: 'https://yorven.in/services',
          crawled_as: 'MOBILE',
          google_last_crawl_time: '2026-11-17T11:45:00Z',
          error_code: null,
          error_message: null,
          inspected_at: '2026-11-17T12:05:00Z'
        },
        {
          id: 'hist-2',
          attempt_status: 'failed',
          verdict: null,
          coverage_state: null,
          indexing_state: null,
          robots_txt_state: null,
          page_fetch_state: null,
          google_canonical: null,
          user_canonical: null,
          crawled_as: null,
          google_last_crawl_time: null,
          error_code: 'HTTP_429_QUOTA',
          error_message: 'Quota exceeded',
          inspected_at: '2026-11-10T03:00:00Z'
        }
      ];

      const mockQueries = [
        { query: 'web design services', clicks: 42, impressions: 850, ctr: 0.0494, position: 4.2 }
      ];

      globalThis.fetch = async (url) => {
        if (url.includes('seo_monitored_pages_view')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                page_id: targetPageId,
                path: '/services',
                title: 'Services',
                meta_description: 'Top services',
                canonical_url: 'https://yorven.in/services',
                last_successful_verdict: 'PASS'
              }
            ]
          };
        }
        if (url.includes('seo_url_inspections')) {
          return { ok: true, status: 200, json: async () => mockHistoryRows };
        }
        if (url.includes('seo_search_console_metrics')) {
          return { ok: true, status: 200, json: async () => mockQueries };
        }
        return { ok: true, status: 200, json: async () => [] };
      };

      const req = makeAuthorizedReq({ id: targetPageId });
      const res = mockRes();

      await pagesHandler(req, res);

      assert.equal(res._status, 200);
      const detail = res._json.page;
      assert.equal(detail.id, targetPageId);
      assert.equal(detail.meta_description, 'Top services');
      assert.equal(detail.top_queries_30d.length, 1);
      assert.equal(detail.top_queries_30d[0].query, 'web design services');

      assert.ok(Array.isArray(detail.inspection_history));
      assert.equal(detail.inspection_history.length, 2);
      assert.equal(detail.inspection_history[0].verdict, 'PASS');
      assert.equal(detail.inspection_history[0].coverage_state, 'Submitted and indexed');
      assert.equal(detail.inspection_history[1].attempt_status, 'failed');
      assert.equal(detail.inspection_history[1].error_code, 'HTTP_429_QUOTA');
    });

    test('single route detail validates pageId UUID and returns 400 if malformed', async () => {
      const req = makeAuthorizedReq({ id: 'not-a-uuid' });
      const res = mockRes();

      await pagesHandler(req, res);
      assert.equal(res._status, 400);
      assert.equal(res._json.error, 'INVALID_PAGE_ID');
    });

    test('single route detail returns 404 if page does not exist in registry', async () => {
      globalThis.fetch = async (url) => {
        if (url.includes('seo_monitored_pages_view') || url.includes('seo_pages')) {
          return { ok: true, status: 200, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => [] };
      };

      const req = makeAuthorizedReq({ id: targetPageId });
      const res = mockRes();

      await pagesHandler(req, res);
      assert.equal(res._status, 404);
      assert.equal(res._json.error, 'PAGE_NOT_FOUND');
    });

    test('gracefully falls back to seo_pages when seo_monitored_pages_view is unavailable', async () => {
      const mockBasePages = [
        {
          id: targetPageId,
          path: '/services',
          title: 'Services',
          canonical_url: 'https://yorven.in/services',
          is_indexed: true,
          last_crawled_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z'
        }
      ];

      globalThis.fetch = async (url) => {
        if (url.includes('seo_monitored_pages_view')) {
          // Simulate 404 on view in test or legacy environments
          return { ok: false, status: 404, json: async () => ({}) };
        }
        if (url.includes('seo_pages')) {
          return { ok: true, status: 200, json: async () => mockBasePages };
        }
        return { ok: true, status: 200, json: async () => [] };
      };

      const req = makeAuthorizedReq();
      const res = mockRes();

      await pagesHandler(req, res);

      assert.equal(res._status, 200);
      assert.equal(res._json.pages.length, 1);
      const page = res._json.pages[0];
      assert.equal(page.id, targetPageId);
      assert.equal(page.path, '/services');
      assert.equal(page.is_indexed, true);
    });
  });
});
