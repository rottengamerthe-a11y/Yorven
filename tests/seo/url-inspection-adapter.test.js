import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectGoogleUrl,
  mapInspectionError,
  setCustomUrlInspectionFetcher,
  getCustomUrlInspectionFetcher,
  URL_INSPECTION_ENDPOINT,
  URL_INSPECTION_OAUTH_SCOPE
} from '../../api/seo/_url_inspection_adapter.js';

test.beforeEach(() => {
  setCustomUrlInspectionFetcher(null);
  delete process.env.GSC_CLIENT_EMAIL;
  delete process.env.GSC_PRIVATE_KEY;
  delete process.env.GSC_SITE_URL;
});

// ----------------------------------------------------------------------------
// 1. ENDPOINT, SCOPE & REQUEST PAYLOAD VERIFICATION
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: passes exact endpoint, siteUrl, and inspectionUrl to fetcher', async () => {
  let capturedCall = null;

  const mockFetcher = async ({ endpoint, siteUrl, inspectionUrl, payload, signal }) => {
    capturedCall = { endpoint, siteUrl, inspectionUrl, payload, signal };
    return {
      inspectionResult: {
        indexStatusResult: {
          verdict: 'PASS'
        }
      }
    };
  };

  const res = await inspectGoogleUrl({
    siteUrl: 'https://yorven.in/',
    inspectionUrl: 'https://yorven.in/work/payper-ai',
    customFetcher: mockFetcher
  });

  assert.equal(capturedCall.endpoint, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect');
  assert.equal(capturedCall.siteUrl, 'https://yorven.in/');
  assert.equal(capturedCall.inspectionUrl, 'https://yorven.in/work/payper-ai');
  assert.deepEqual(capturedCall.payload, {
    inspectionUrl: 'https://yorven.in/work/payper-ai',
    siteUrl: 'https://yorven.in/'
  });
  assert.equal(res.success, true);
  assert.equal(res.attempt_status, 'success');
  assert.equal(res.verdict, 'PASS');
});

test('URL Inspection Adapter: defaults siteUrl to process.env.GSC_SITE_URL or https://yorven.in/', async () => {
  let capturedPayload = null;

  const mockFetcher = async ({ payload }) => {
    capturedPayload = payload;
    return {
      inspectionResult: {
        indexStatusResult: {
          verdict: 'PASS'
        }
      }
    };
  };

  process.env.GSC_SITE_URL = 'https://custom-site.in/';
  await inspectGoogleUrl({
    inspectionUrl: 'https://custom-site.in/about',
    customFetcher: mockFetcher
  });

  assert.equal(capturedPayload.siteUrl, 'https://custom-site.in/');
  assert.equal(capturedPayload.inspectionUrl, 'https://custom-site.in/about');
});

// ----------------------------------------------------------------------------
// 2. SUCCESSFUL RESPONSE MAPPING (ALL FIELDS)
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: maps all supported fields from complete Google response', async () => {
  const completeGoogleResponse = {
    inspectionResult: {
      inspectionResultLink: 'https://search.google.com/search-console/inspect?resource_id=...',
      indexStatusResult: {
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        indexingState: 'INDEXING_ALLOWED',
        robotsTxtState: 'ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        googleCanonical: 'https://yorven.in/work',
        userCanonical: 'https://yorven.in/work',
        crawledAs: 'MOBILE',
        lastCrawlTime: '2026-11-15T08:12:00.000Z'
      }
    }
  };

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => completeGoogleResponse
  });

  assert.equal(res.success, true);
  assert.equal(res.attempt_status, 'success');
  assert.equal(res.verdict, 'PASS');
  assert.equal(res.coverage_state, 'Submitted and indexed');
  assert.equal(res.indexing_state, 'INDEXING_ALLOWED');
  assert.equal(res.robots_txt_state, 'ALLOWED');
  assert.equal(res.page_fetch_state, 'SUCCESSFUL');
  assert.equal(res.google_canonical, 'https://yorven.in/work');
  assert.equal(res.user_canonical, 'https://yorven.in/work');
  assert.equal(res.crawled_as, 'MOBILE');
  assert.equal(res.google_last_crawl_time, '2026-11-15T08:12:00.000Z');
  assert.equal(res.error_code, null);
  assert.equal(res.error_message, null);
  assert.deepEqual(res.raw_response, completeGoogleResponse);
});

test('URL Inspection Adapter: supports NEUTRAL, FAIL, and VERDICT_UNSPECIFIED verdicts', async () => {
  for (const verdict of ['NEUTRAL', 'FAIL', 'VERDICT_UNSPECIFIED']) {
    const res = await inspectGoogleUrl({
      inspectionUrl: 'https://yorven.in/test',
      customFetcher: async () => ({
        inspectionResult: {
          indexStatusResult: { verdict }
        }
      })
    });

    assert.equal(res.success, true);
    assert.equal(res.attempt_status, 'success');
    assert.equal(res.verdict, verdict);
    assert.equal(res.error_code, null);
  }
});

// ----------------------------------------------------------------------------
// 3. MISSING OPTIONAL FIELDS
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: missing optional fields normalize cleanly to null', async () => {
  const minimalResponse = {
    inspectionResult: {
      indexStatusResult: {
        verdict: 'PASS'
      }
    }
  };

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => minimalResponse
  });

  assert.equal(res.success, true);
  assert.equal(res.attempt_status, 'success');
  assert.equal(res.verdict, 'PASS');
  assert.equal(res.coverage_state, null);
  assert.equal(res.indexing_state, null);
  assert.equal(res.robots_txt_state, null);
  assert.equal(res.page_fetch_state, null);
  assert.equal(res.google_canonical, null);
  assert.equal(res.user_canonical, null);
  assert.equal(res.crawled_as, null);
  assert.equal(res.google_last_crawl_time, null);
  assert.equal(res.error_code, null);
  assert.equal(res.error_message, null);
});

// ----------------------------------------------------------------------------
// 4. HTTP ERROR MAPPING (429, 403, 5xx)
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: HTTP 429 maps to HTTP_429_QUOTA', async () => {
  const err = new Error('Quota exceeded');
  err.status = 429;

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => { throw err; }
  });

  assert.equal(res.success, false);
  assert.equal(res.attempt_status, 'failed');
  assert.equal(res.verdict, null);
  assert.equal(res.error_code, 'HTTP_429_QUOTA');
  assert.match(res.error_message, /Quota exceeded/);
});

test('URL Inspection Adapter: HTTP 403 maps to HTTP_403_FORBIDDEN', async () => {
  const err = new Error('Forbidden: Caller not verified for property');
  err.status = 403;

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => { throw err; }
  });

  assert.equal(res.success, false);
  assert.equal(res.attempt_status, 'failed');
  assert.equal(res.verdict, null);
  assert.equal(res.error_code, 'HTTP_403_FORBIDDEN');
  assert.match(res.error_message, /Forbidden/);
});

test('URL Inspection Adapter: HTTP 500, 502, 503, 504 map to HTTP_5XX_UPSTREAM', async () => {
  for (const status of [500, 502, 503, 504]) {
    const err = new Error(`Upstream error ${status}`);
    err.status = status;

    const res = await inspectGoogleUrl({
      inspectionUrl: 'https://yorven.in/work',
      customFetcher: async () => { throw err; }
    });

    assert.equal(res.success, false);
    assert.equal(res.attempt_status, 'failed');
    assert.equal(res.verdict, null);
    assert.equal(res.error_code, 'HTTP_5XX_UPSTREAM');
  }
});

// ----------------------------------------------------------------------------
// 5. TIMEOUT AND ABORT MAPPING
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: pre-aborted signal maps to NETWORK_TIMEOUT', async () => {
  const controller = new AbortController();
  controller.abort();

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    signal: controller.signal,
    customFetcher: async () => ({})
  });

  assert.equal(res.success, false);
  assert.equal(res.attempt_status, 'failed');
  assert.equal(res.verdict, null);
  assert.equal(res.error_code, 'NETWORK_TIMEOUT');
});

test('URL Inspection Adapter: AbortError or ETIMEDOUT maps to NETWORK_TIMEOUT', async () => {
  const abortErr = new Error('This operation was aborted');
  abortErr.name = 'AbortError';

  const res1 = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => { throw abortErr; }
  });
  assert.equal(res1.error_code, 'NETWORK_TIMEOUT');

  const timeoutErr = new Error('Socket timeout');
  timeoutErr.code = 'ETIMEDOUT';

  const res2 = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => { throw timeoutErr; }
  });
  assert.equal(res2.error_code, 'NETWORK_TIMEOUT');
});

// ----------------------------------------------------------------------------
// 6. MALFORMED JSON AND RESPONSE STRUCTURE MAPPING
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: non-object response maps to MALFORMED_RESPONSE', async () => {
  for (const invalid of [null, 'string response', 123, []]) {
    const res = await inspectGoogleUrl({
      inspectionUrl: 'https://yorven.in/work',
      customFetcher: async () => invalid
    });

    assert.equal(res.success, false);
    assert.equal(res.attempt_status, 'failed');
    assert.equal(res.verdict, null);
    assert.equal(res.error_code, 'MALFORMED_RESPONSE');
  }
});

test('URL Inspection Adapter: missing inspectionResult or indexStatusResult maps to MALFORMED_RESPONSE', async () => {
  const res1 = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => ({ unexpected: {} })
  });
  assert.equal(res1.error_code, 'MALFORMED_RESPONSE');

  const res2 = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => ({ inspectionResult: {} })
  });
  assert.equal(res2.error_code, 'MALFORMED_RESPONSE');
});

test('URL Inspection Adapter: invalid or missing verdict maps to MALFORMED_RESPONSE', async () => {
  const res1 = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => ({
      inspectionResult: {
        indexStatusResult: { verdict: 'INVALID_STATUS_VALUE' }
      }
    })
  });
  assert.equal(res1.error_code, 'MALFORMED_RESPONSE');

  const res2 = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => ({
      inspectionResult: {
        indexStatusResult: {}
      }
    })
  });
  assert.equal(res2.error_code, 'MALFORMED_RESPONSE');
});

// ----------------------------------------------------------------------------
// 7. UNEXPECTED EXCEPTION & INPUT VALIDATION
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: empty or non-string inspectionUrl fails closed without network call', async () => {
  let called = false;
  const mockFetcher = async () => { called = true; return {}; };

  for (const badUrl of ['', '   ', null, undefined, 123]) {
    const res = await inspectGoogleUrl({
      inspectionUrl: badUrl,
      customFetcher: mockFetcher
    });

    assert.equal(res.success, false);
    assert.equal(res.attempt_status, 'failed');
    assert.equal(res.error_code, 'UNKNOWN_ERROR');
    assert.match(res.error_message, /INVALID_INPUT/);
  }
  assert.equal(called, false);
});

test('URL Inspection Adapter: missing credentials fails closed when no custom fetcher is provided', async () => {
  delete process.env.GSC_CLIENT_EMAIL;
  delete process.env.GSC_PRIVATE_KEY;

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work'
  });

  assert.equal(res.success, false);
  assert.equal(res.attempt_status, 'failed');
  assert.equal(res.error_code, 'UNKNOWN_ERROR');
  assert.match(res.error_message, /CONFIG_ERROR: Missing GSC_CLIENT_EMAIL/);
});

test('URL Inspection Adapter: generic unexpected error maps to UNKNOWN_ERROR', async () => {
  const genericErr = new Error('DNS resolution failure or system error');

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/work',
    customFetcher: async () => { throw genericErr; }
  });

  assert.equal(res.success, false);
  assert.equal(res.attempt_status, 'failed');
  assert.equal(res.error_code, 'UNKNOWN_ERROR');
  assert.equal(res.error_message, 'DNS resolution failure or system error');
});

// ----------------------------------------------------------------------------
// 8. MODULE-LEVEL FETCHER INJECTION
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: setCustomUrlInspectionFetcher registers global mock fetcher', async () => {
  setCustomUrlInspectionFetcher(async ({ inspectionUrl }) => ({
    inspectionResult: {
      indexStatusResult: {
        verdict: 'PASS',
        googleCanonical: inspectionUrl
      }
    }
  }));

  const res = await inspectGoogleUrl({
    inspectionUrl: 'https://yorven.in/services'
  });

  assert.equal(res.success, true);
  assert.equal(res.verdict, 'PASS');
  assert.equal(res.google_canonical, 'https://yorven.in/services');
});

// ----------------------------------------------------------------------------
// 9. MAP ERROR DIRECT FUNCTION COVERAGE
// ----------------------------------------------------------------------------

test('URL Inspection Adapter: mapInspectionError correctly maps all statuses and error types', () => {
  assert.equal(mapInspectionError(null, 429), 'HTTP_429_QUOTA');
  assert.equal(mapInspectionError(null, 403), 'HTTP_403_FORBIDDEN');
  assert.equal(mapInspectionError(null, 500), 'HTTP_5XX_UPSTREAM');
  assert.equal(mapInspectionError(null, 503), 'HTTP_5XX_UPSTREAM');
  assert.equal(mapInspectionError({ name: 'AbortError' }), 'NETWORK_TIMEOUT');
  assert.equal(mapInspectionError({ code: 'ETIMEDOUT' }), 'NETWORK_TIMEOUT');
  assert.equal(mapInspectionError({ name: 'SyntaxError' }), 'MALFORMED_RESPONSE');
  assert.equal(mapInspectionError({ message: 'MALFORMED_RESPONSE: bad json' }), 'MALFORMED_RESPONSE');
  assert.equal(mapInspectionError(new Error('something else'), 404), 'UNKNOWN_ERROR');
});
