import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  normalizePrivateKey,
  generateSignedJwtAssertion,
  getGoogleAccessToken,
  clearTokenCache
} from '../../api/seo/_google_auth.js';
import {
  fetchGscSearchAnalytics,
  GSC_OAUTH_SCOPE,
  setCustomGscFetcher
} from '../../api/seo/_gsc_adapter.js';
import {
  fetchGa4Metrics,
  validateGa4PropertyId,
  GA4_OAUTH_SCOPE,
  setCustomGa4Fetcher
} from '../../api/seo/_ga4_adapter.js';

// Generate a valid RSA keypair for testing
const { privateKey: testPemPrivateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const testClientEmail = 'seo-sync@yorven-prod.iam.gserviceaccount.com';

const mockPageIdMap = new Map([
  ['/', 'page-home-uuid'],
  ['/work', 'page-work-uuid'],
  ['/about', 'page-about-uuid']
]);

test.beforeEach(() => {
  clearTokenCache();
  setCustomGscFetcher(null);
  setCustomGa4Fetcher(null);
  delete process.env.GSC_CLIENT_EMAIL;
  delete process.env.GSC_PRIVATE_KEY;
  delete process.env.GA4_CLIENT_EMAIL;
  delete process.env.GA4_PRIVATE_KEY;
  delete process.env.GA4_PROPERTY_ID;
});

// ----------------------------------------------------------------------------
// 1. JWT & TOKEN EXCHANGE TESTS
// ----------------------------------------------------------------------------

test('Google Auth: normalizes escaped \\n in private keys and strips outer quotes', () => {
  const escaped = `"${testPemPrivateKey.replace(/\n/g, '\\n')}"`;
  const normalized = normalizePrivateKey(escaped);
  assert.equal(normalized, testPemPrivateKey);
});

test('Google Auth: generates signed RS256 JWT assertion with correct claims', () => {
  const scope = GSC_OAUTH_SCOPE;
  const assertion = generateSignedJwtAssertion({
    clientEmail: testClientEmail,
    privateKey: testPemPrivateKey,
    scope
  });

  assert.ok(typeof assertion === 'string');
  const parts = assertion.split('.');
  assert.equal(parts.length, 3);

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

  assert.equal(header.alg, 'RS256');
  assert.equal(header.typ, 'JWT');
  assert.equal(payload.iss, testClientEmail);
  assert.equal(payload.scope, scope);
  assert.equal(payload.aud, 'https://oauth2.googleapis.com/token');
  assert.ok(payload.exp > payload.iat);
});

test('Google Auth: successful OAuth2 token exchange and in-process token reuse', async () => {
  let exchangeCalls = 0;
  const fakeToken = 'ya29.mock_access_token_12345';

  const mockFetch = async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.method, 'POST');
    exchangeCalls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: fakeToken,
        expires_in: 3600,
        token_type: 'Bearer'
      })
    };
  };

  const token1 = await getGoogleAccessToken({
    clientEmail: testClientEmail,
    privateKey: testPemPrivateKey,
    scope: GSC_OAUTH_SCOPE,
    fetchImpl: mockFetch
  });

  assert.equal(token1, fakeToken);
  assert.equal(exchangeCalls, 1);

  // Second call must reuse cached token without hitting network
  const token2 = await getGoogleAccessToken({
    clientEmail: testClientEmail,
    privateKey: testPemPrivateKey,
    scope: GSC_OAUTH_SCOPE,
    fetchImpl: mockFetch
  });

  assert.equal(token2, fakeToken);
  assert.equal(exchangeCalls, 1);
});

test('Google Auth: rejects missing or invalid inputs', async () => {
  await assert.rejects(
    async () => getGoogleAccessToken({ clientEmail: '', privateKey: testPemPrivateKey, scope: 'scope' }),
    /CONFIG_ERROR: Missing Google client email/
  );

  await assert.rejects(
    async () => getGoogleAccessToken({ clientEmail: testClientEmail, privateKey: '', scope: 'scope' }),
    /CONFIG_ERROR: Missing Google private key/
  );

  await assert.rejects(
    async () => getGoogleAccessToken({ clientEmail: testClientEmail, privateKey: 'invalid-pem-not-key', scope: 'scope' }),
    /CONFIG_ERROR: Malformed private key/
  );
});

test('Google Auth: handles OAuth2 token exchange rejection (400/401)', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: 'invalid_grant',
      error_description: 'Invalid JWT Signature'
    })
  });

  await assert.rejects(
    async () => getGoogleAccessToken({
      clientEmail: testClientEmail,
      privateKey: testPemPrivateKey,
      scope: GSC_OAUTH_SCOPE,
      fetchImpl: mockFetch
    }),
    /AUTH_REJECTED: Google OAuth2 token exchange rejected: Invalid JWT Signature/
  );
});

test('Google Auth: never exposes private keys or raw tokens in error messages', async () => {
  try {
    normalizePrivateKey('INVALID_KEY_CONTENTS_HERE');
  } catch (err) {
    assert.ok(!err.message.includes('INVALID_KEY_CONTENTS_HERE'));
    assert.ok(err.message.includes('CONFIG_ERROR'));
  }
});

// ----------------------------------------------------------------------------
// 2. GSC ADAPTER AUTHENTICATED REQUEST TESTS
// ----------------------------------------------------------------------------

test('GSC Adapter: fails closed when GSC credentials are missing', async () => {
  delete process.env.GSC_CLIENT_EMAIL;
  delete process.env.GSC_PRIVATE_KEY;

  await assert.rejects(
    async () => fetchGscSearchAnalytics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    }),
    /CONFIG_ERROR: GSC_CLIENT_EMAIL must be configured/
  );

  process.env.GSC_CLIENT_EMAIL = testClientEmail;
  delete process.env.GSC_PRIVATE_KEY;

  await assert.rejects(
    async () => fetchGscSearchAnalytics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    }),
    /CONFIG_ERROR: GSC_PRIVATE_KEY must be configured/
  );
});

test('GSC Adapter: successful authenticated request with correct scope', async () => {
  process.env.GSC_CLIENT_EMAIL = testClientEmail;
  process.env.GSC_PRIVATE_KEY = testPemPrivateKey;

  const originalFetch = globalThis.fetch;
  let oauthScopeRequested = null;
  let authHeaderUsed = null;

  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const bodyParams = new URLSearchParams(options.body);
      const assertion = bodyParams.get('assertion');
      const payload = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'));
      oauthScopeRequested = payload.scope;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'gsc_mock_access_token_abc',
          expires_in: 3600
        })
      };
    }

    if (url.includes('searchconsole.googleapis.com')) {
      authHeaderUsed = options.headers?.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rows: [
            {
              keys: ['2026-11-10', 'https://yorven.in/work', 'digital agency'],
              clicks: 12,
              impressions: 150,
              ctr: 0.08,
              position: 4.2
            }
          ]
        })
      };
    }

    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await fetchGscSearchAnalytics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    });

    assert.equal(oauthScopeRequested, GSC_OAUTH_SCOPE);
    assert.equal(authHeaderUsed, 'Bearer gsc_mock_access_token_abc');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].clicks, 12);
    assert.equal(result.rows[0].page_id, 'page-work-uuid');
    assert.equal(result.truncationStatus, 'complete');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GSC Adapter: legitimate zero-row response succeeds with 0 rows', async () => {
  process.env.GSC_CLIENT_EMAIL = testClientEmail;
  process.env.GSC_PRIVATE_KEY = testPemPrivateKey;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test_token', expires_in: 3600 })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}) // No rows returned by Google Search Console
    };
  };

  try {
    const result = await fetchGscSearchAnalytics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    });

    assert.equal(result.rows.length, 0);
    assert.equal(result.truncationStatus, 'complete');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GSC Adapter: handles 401 and 403 API errors without retrying endlessly', async () => {
  process.env.GSC_CLIENT_EMAIL = testClientEmail;
  process.env.GSC_PRIVATE_KEY = testPemPrivateKey;

  const originalFetch = globalThis.fetch;
  let apiAttempts = 0;

  globalThis.fetch = async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test_token', expires_in: 3600 })
      };
    }
    apiAttempts++;
    return {
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'User does not have sufficient permission for site' } })
    };
  };

  try {
    await assert.rejects(
      async () => fetchGscSearchAnalytics({
        profile: 'worker', // worker profile normally has 3 retries, but 403 must fail immediately
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        pageIdMap: mockPageIdMap
      }),
      /GSC API HTTP 403: User does not have sufficient permission/
    );
    assert.equal(apiAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ----------------------------------------------------------------------------
// 3. GA4 ADAPTER AUTHENTICATED REQUEST & VALIDATION TESTS
// ----------------------------------------------------------------------------

test('GA4 Adapter: validateGa4PropertyId validates and strips prefix', () => {
  assert.equal(validateGa4PropertyId('123456789'), '123456789');
  assert.equal(validateGa4PropertyId('properties/987654321'), '987654321');
  assert.equal(validateGa4PropertyId('  456789012  '), '456789012');

  assert.throws(() => validateGa4PropertyId(''), /CONFIG_ERROR: GA4_PROPERTY_ID is required/);
  assert.throws(() => validateGa4PropertyId(null), /CONFIG_ERROR: GA4_PROPERTY_ID is required/);
  assert.throws(() => validateGa4PropertyId('abc-not-num'), /CONFIG_ERROR: Malformed GA4_PROPERTY_ID/);
  assert.throws(() => validateGa4PropertyId('properties/invalid'), /CONFIG_ERROR: Malformed GA4_PROPERTY_ID/);
});

test('GA4 Adapter: fails closed when GA4_PROPERTY_ID or credentials are missing', async () => {
  delete process.env.GA4_PROPERTY_ID;
  delete process.env.GA4_CLIENT_EMAIL;
  delete process.env.GA4_PRIVATE_KEY;

  await assert.rejects(
    async () => fetchGa4Metrics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    }),
    /CONFIG_ERROR: GA4_PROPERTY_ID is required/
  );

  process.env.GA4_PROPERTY_ID = '314159265';
  await assert.rejects(
    async () => fetchGa4Metrics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    }),
    /CONFIG_ERROR: GA4_CLIENT_EMAIL must be configured/
  );

  process.env.GA4_CLIENT_EMAIL = testClientEmail;
  await assert.rejects(
    async () => fetchGa4Metrics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    }),
    /CONFIG_ERROR: GA4_PRIVATE_KEY must be configured/
  );
});

test('GA4 Adapter: successful authenticated request with correct scope', async () => {
  process.env.GA4_PROPERTY_ID = '314159265';
  process.env.GA4_CLIENT_EMAIL = testClientEmail;
  process.env.GA4_PRIVATE_KEY = testPemPrivateKey;

  const originalFetch = globalThis.fetch;
  let oauthScopeRequested = null;
  let targetEndpoint = null;
  let authHeaderUsed = null;

  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const bodyParams = new URLSearchParams(options.body);
      const assertion = bodyParams.get('assertion');
      const payload = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'));
      oauthScopeRequested = payload.scope;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'ga4_mock_access_token_xyz',
          expires_in: 3600
        })
      };
    }

    if (url.includes('analyticsdata.googleapis.com')) {
      targetEndpoint = url;
      authHeaderUsed = options.headers?.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rows: [
            {
              dimensionValues: [
                { value: '20261110' },
                { value: '/about' }
              ],
              metricValues: [
                { value: '45' }, // sessions
                { value: '38' }, // activeUsers
                { value: '0.25' }, // bounceRate
                { value: '0.75' }, // engagementRate
                { value: '62.4' }, // averageSessionDuration
                { value: '3' } // conversions
              ]
            }
          ]
        })
      };
    }

    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await fetchGa4Metrics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    });

    assert.equal(oauthScopeRequested, GA4_OAUTH_SCOPE);
    assert.equal(targetEndpoint, 'https://analyticsdata.googleapis.com/v1beta/properties/314159265:runReport');
    assert.equal(authHeaderUsed, 'Bearer ga4_mock_access_token_xyz');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].page_id, 'page-about-uuid');
    assert.equal(result.rows[0].sessions, 45);
    assert.equal(result.rows[0].active_users, 38);
    assert.equal(result.rows[0].conversions, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GA4 Adapter: legitimate zero-row response succeeds with 0 rows', async () => {
  process.env.GA4_PROPERTY_ID = '314159265';
  process.env.GA4_CLIENT_EMAIL = testClientEmail;
  process.env.GA4_PRIVATE_KEY = testPemPrivateKey;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test_token', expires_in: 3600 })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ rows: [] })
    };
  };

  try {
    const result = await fetchGa4Metrics({
      profile: 'manual',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      pageIdMap: mockPageIdMap
    });

    assert.equal(result.rows.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GA4 Adapter: handles 401 and 403 API errors without retrying endlessly', async () => {
  process.env.GA4_PROPERTY_ID = '314159265';
  process.env.GA4_CLIENT_EMAIL = testClientEmail;
  process.env.GA4_PRIVATE_KEY = testPemPrivateKey;

  const originalFetch = globalThis.fetch;
  let apiAttempts = 0;

  globalThis.fetch = async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test_token', expires_in: 3600 })
      };
    }
    apiAttempts++;
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Request had invalid authentication credentials.' } })
    };
  };

  try {
    await assert.rejects(
      async () => fetchGa4Metrics({
        profile: 'worker',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        pageIdMap: mockPageIdMap
      }),
      /GA4 API HTTP 401: Request had invalid authentication credentials/
    );
    assert.equal(apiAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
