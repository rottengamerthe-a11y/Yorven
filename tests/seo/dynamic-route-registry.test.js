import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  normalizeGscPagePath,
  sanitizeGscRow,
  fetchGscSearchAnalytics,
  YORVEN_MONITORED_PATHS
} from '../../api/seo/_gsc_adapter.js';
import {
  normalizeGa4LandingPath,
  fetchGa4Metrics
} from '../../api/seo/_ga4_adapter.js';
import {
  loadMonitoredPages,
  executeClaimedSyncWorkload
} from '../../api/seo/_sync_service.js';
import { fetchMonitoredRoutesCount } from '../../api/seo/overview.js';

describe('Dynamic SEO Route Registry (Database-Driven SSOT)', () => {
  // All 14 registered routes seeded in public.seo_pages
  const registered14Routes = [
    '/',
    '/work',
    '/work/payper-ai',
    '/work/racers-vault',
    '/work/aurix',
    '/work/modern-classes',
    '/services',
    '/services/websites',
    '/services/digital-products',
    '/services/systems',
    '/about',
    '/contact',
    '/privacy',
    '/terms'
  ];

  const full14PageIdMap = new Map(
    registered14Routes.map((r) => [r, crypto.randomUUID()])
  );

  test('All 14 registered routes are accepted by both GSC and GA4 normalizers', () => {
    for (const route of registered14Routes) {
      // Relative path
      const gscNormalized = normalizeGscPagePath(route, full14PageIdMap);
      const ga4Normalized = normalizeGa4LandingPath(route, full14PageIdMap);
      assert.equal(gscNormalized, route, `GSC should accept registered route ${route}`);
      assert.equal(ga4Normalized, route, `GA4 should accept registered route ${route}`);

      // Absolute URL (https://yorven.in)
      const absUrl = `https://yorven.in${route === '/' ? '' : route}`;
      const gscAbs = normalizeGscPagePath(absUrl, full14PageIdMap);
      const ga4Abs = normalizeGa4LandingPath(absUrl, full14PageIdMap);
      assert.equal(gscAbs, route, `GSC should accept absolute URL for ${route}`);
      assert.equal(ga4Abs, route, `GA4 should accept absolute URL for ${route}`);
    }
  });

  test('Existing behavior for the original 9 routes remains fully intact', () => {
    const original9Routes = Array.from(YORVEN_MONITORED_PATHS);
    assert.equal(original9Routes.length, 9);

    for (const route of original9Routes) {
      assert.equal(normalizeGscPagePath(route, full14PageIdMap), route);
      assert.equal(normalizeGa4LandingPath(route, full14PageIdMap), route);
      assert.equal(normalizeGscPagePath(`https://yorven.in${route === '/' ? '' : route}`, full14PageIdMap), route);
      assert.equal(normalizeGa4LandingPath(`https://yorven.in${route === '/' ? '' : route}`, full14PageIdMap), route);
    }
  });

  test('GA4 and GSC reject deceptive origins, protocol-relative, backslashes, and credentials', () => {
    const deceptiveInputs = [
      '//evil.com/work',
      '/\\evil.com/work',
      '\\\\evil.com/work',
      'https://user:pass@yorven.in/work',
      'http://user:pass@yorven.in/work',
      'https://user@yorven.in/work',
      'https://evil.com/work',
      'http://evil.com/work',
      'https://yorven.in.evil.com/work',
      'https://yorven.in:8080/work'
    ];

    for (const badInput of deceptiveInputs) {
      assert.equal(
        normalizeGa4LandingPath(badInput, full14PageIdMap),
        null,
        `GA4 should reject deceptive URL: ${badInput}`
      );
      assert.equal(
        normalizeGscPagePath(badInput, full14PageIdMap),
        null,
        `GSC should reject deceptive URL: ${badInput}`
      );
    }
  });

  test('Unknown and unregistered routes are rejected by both adapters', () => {
    const unknownPaths = [
      '/unknown',
      '/pricing',
      '/careers',
      '/services/consulting',
      '/work/secret-project',
      '/admin',
      '/api/seo/pages'
    ];

    for (const badPath of unknownPaths) {
      assert.equal(normalizeGscPagePath(badPath, full14PageIdMap), null);
      assert.equal(normalizeGa4LandingPath(badPath, full14PageIdMap), null);
    }
  });

  test('URL normalization rules are consistent between GSC and GA4 adapters', () => {
    const cases = [
      // [input, expected]
      ['/services/', '/services'],
      ['/work/modern-classes/', '/work/modern-classes'],
      ['/', '/'],
      ['https://yorven.in/', '/'],
      ['https://yorven.in', '/'],
      ['/services?utm_source=google&ref=chat', '/services'],
      ['/work/aurix#gallery', '/work/aurix'],
      ['/work/payper%2Dai', '/work/payper-ai'],
      ['/services/digital%2Dproducts?track=1', '/services/digital-products'],
      // Prefix attacks that must be strictly rejected
      ['/services-extra', null],
      ['/services/websites/nested', null],
      ['/work-portfolio', null],
      ['/about-us', null],
      // Malformed or foreign inputs
      ['https://malicious.com/services', null],
      ['https://evil.org/work', null],
      ['javascript:alert(1)', null],
      ['(not set)', null],
      ['', null],
      [null, null],
      [undefined, null],
      [12345, null]
    ];

    for (const [input, expected] of cases) {
      const gscResult = normalizeGscPagePath(input, full14PageIdMap);
      const ga4Result = normalizeGa4LandingPath(input, full14PageIdMap);

      assert.equal(
        gscResult,
        expected,
        `GSC normalization for ${String(input)} should be ${String(expected)}, got ${String(gscResult)}`
      );
      assert.equal(
        ga4Result,
        expected,
        `GA4 normalization for ${String(input)} should be ${String(expected)}, got ${String(ga4Result)}`
      );
    }
  });

  test('Both adapters fail closed and reject all paths when route registry is missing or empty', () => {
    const emptyMap = new Map();

    // Normalizers reject without registry
    assert.equal(normalizeGscPagePath('/services', null), null);
    assert.equal(normalizeGscPagePath('/services', emptyMap), null);
    assert.equal(normalizeGa4LandingPath('/services', null), null);
    assert.equal(normalizeGa4LandingPath('/services', emptyMap), null);

    // sanitizeGscRow rejects without registry
    const mockRow = { page: 'https://yorven.in/services', clicks: 1, impressions: 5, date: '2026-11-10' };
    assert.equal(sanitizeGscRow(mockRow, null), null);
    assert.equal(sanitizeGscRow(mockRow, emptyMap), null);
  });

  test('fetchGscSearchAnalytics and fetchGa4Metrics throw CONFIG_ERROR on missing or empty pageIdMap', async () => {
    process.env.GSC_CLIENT_EMAIL = 'test@example.com';
    process.env.GSC_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----';
    process.env.GA4_CLIENT_EMAIL = 'test@example.com';
    process.env.GA4_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----';
    process.env.GA4_PROPERTY_ID = '314159265';

    await assert.rejects(
      async () => fetchGscSearchAnalytics({
        profile: 'manual',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        pageIdMap: null
      }),
      /CONFIG_ERROR: Valid non-empty pageIdMap route registry is required/
    );

    await assert.rejects(
      async () => fetchGscSearchAnalytics({
        profile: 'manual',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        pageIdMap: new Map()
      }),
      /CONFIG_ERROR: Valid non-empty pageIdMap route registry is required/
    );

    await assert.rejects(
      async () => fetchGa4Metrics({
        profile: 'manual',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        pageIdMap: null
      }),
      /CONFIG_ERROR: Valid non-empty pageIdMap route registry is required/
    );

    await assert.rejects(
      async () => fetchGa4Metrics({
        profile: 'manual',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        pageIdMap: new Map()
      }),
      /CONFIG_ERROR: Valid non-empty pageIdMap route registry is required/
    );
  });

  test('loadMonitoredPages fails closed on HTTP error, empty registry, or invalid records', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({})
    };

    const originalFetch = globalThis.fetch;

    try {
      // 1. HTTP 500 error
      globalThis.fetch = async () => ({
        ok: false,
        status: 500
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Failed to load monitored pages: HTTP 500/
      );

      // 2. Empty array returned
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => []
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Failed to load monitored pages: Route registry is empty or invalid/
      );

      // 3. Invalid UUID
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: 'not-a-valid-uuid', path: '/work' }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Invalid UUID in registry/
      );

      // 4. Null ID
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: null, path: '/work' }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Invalid UUID in registry/
      );

      // 5. Missing / non-string path
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: crypto.randomUUID(), path: null }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Non-string path/
      );

      // 6. Whitespace-only path
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: crypto.randomUUID(), path: '   ' }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Path must be non-empty and start with "\/"/
      );

      // 7. Path with query string
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: crypto.randomUUID(), path: '/work?ref=google' }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Path contains query, fragment, or backslash/
      );

      // 8. Path with fragment
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: crypto.randomUUID(), path: '/work#about' }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Path contains query, fragment, or backslash/
      );

      // 9. Path with backslash
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: crypto.randomUUID(), path: '/work\\about' }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Path contains query, fragment, or backslash/
      );

      // 10. Path with control characters
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: crypto.randomUUID(), path: '/work\x00' }]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Path contains whitespace or control characters/
      );

      // 11. Duplicate normalized paths
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [
          { id: crypto.randomUUID(), path: '/work' },
          { id: crypto.randomUUID(), path: '/work/' }
        ]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Duplicate route detected in registry: \/work/
      );

      // 12. Non-object row
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [null]
      });

      await assert.rejects(
        async () => loadMonitoredPages(mockDb),
        /Malformed row in registry/
      );

      // 13. Successful load with 14 valid pages
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => registered14Routes.map((path) => ({ id: crypto.randomUUID(), path }))
      });

      const loaded = await loadMonitoredPages(mockDb);
      assert.equal(loaded.pageIdMap.size, 14);
      assert.equal(loaded.pages.length, 14);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('executeClaimedSyncWorkload aborts immediately when route registry cannot be loaded', async () => {
    let completedStatus = null;
    let completedError = null;
    let logTypeRecorded = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        completedStatus = params.p_status;
        completedError = params.p_error_message;
        return { success: true };
      }
    };

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: false, status: 503, text: async () => 'Service Unavailable' };
      }
      if (url.includes('/rest/v1/seo_sync_logs')) {
        logTypeRecorded = 'SYNC_JOB_FAILED';
        return { ok: true, status: 201, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      const result = await executeClaimedSyncWorkload({
        db: mockDb,
        jobId: 'job-123',
        jobType: 'full_resync',
        generation: 1,
        leaseAttemptId: 'lease-abc',
        workerId: 'worker-1',
        profile: 'manual'
      });

      assert.equal(result.success, false);
      assert.match(result.error, /HTTP 503/);
      assert.equal(result.gscPersistedRows, 0);
      assert.equal(result.ga4PersistedRows, 0);
      assert.equal(completedStatus, 'failed');
      assert.match(completedError, /HTTP 503/);
      assert.equal(logTypeRecorded, 'SYNC_JOB_FAILED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Overview fetchMonitoredRoutesCount derives count dynamically and handles failures', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({})
    };

    const originalFetch = globalThis.fetch;

    try {
      // 1. Success with 14 routes
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => registered14Routes.map(() => ({ id: crypto.randomUUID() }))
      });

      const count = await fetchMonitoredRoutesCount(mockDb);
      assert.equal(count, 14);

      // Verify disclaimer formatting
      const scopeNote = `Sessions represent organic visits landing on one of Yorven's ${count} monitored routes. Active users represent the sum of daily landing users and is not cross-day de-duplicated.`;
      assert.equal(
        scopeNote,
        "Sessions represent organic visits landing on one of Yorven's 14 monitored routes. Active users represent the sum of daily landing users and is not cross-day de-duplicated."
      );

      // 2. HTTP failure returns 502 error
      globalThis.fetch = async () => ({
        ok: false,
        status: 500
      });

      await assert.rejects(
        async () => fetchMonitoredRoutesCount(mockDb),
        (err) => err.code === 'ROUTE_REGISTRY_ERROR' && err.status === 502
      );

      // 3. Empty route registry returns 502 error
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => []
      });

      await assert.rejects(
        async () => fetchMonitoredRoutesCount(mockDb),
        (err) => err.code === 'ROUTE_REGISTRY_ERROR' && err.status === 502
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
