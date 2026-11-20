import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import contactHandler, {
  checkAtomicRateLimit,
  isMemoryRateLimited,
  ipRateLimitMap,
  pruneExpiredMemoryEntries,
  MAX_MEMORY_ENTRIES,
  MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS
} from '../../api/contact.js';

describe('Contact API Hardening Suite (SEC-01, SEC-02, SEC-03)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let capturedLogs = [];

  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(() => {
    capturedLogs = [];
    ipRateLimitMap.clear();
    console.warn = (...args) => {
      capturedLogs.push({ level: 'warn', message: args.join(' ') });
      originalConsoleWarn(...args);
    };
    console.error = (...args) => {
      capturedLogs.push({ level: 'error', message: args.join(' ') });
      originalConsoleError(...args);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    ipRateLimitMap.clear();
  });

  function createMockReqRes({
    method = 'POST',
    headers = {},
    body = {
      name: 'Alice Smith',
      email: 'alice@example.com',
      description: 'Need a custom platform developed.'
    }
  } = {}) {
    const req = {
      method,
      headers: {
        origin: 'https://yorven.in',
        'x-requested-with': 'Yorven-Control',
        'x-vercel-forwarded-for': '198.51.100.42',
        ...headers
      },
      body
    };

    let statusCode = 200;
    let responseHeaders = {};
    let responseBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      setHeader(name, val) {
        responseHeaders[name] = val;
      },
      json(data) {
        responseBody = data;
        return this;
      },
      getStatusCode: () => statusCode,
      getBody: () => responseBody,
      getHeaders: () => responseHeaders
    };

    return { req, res };
  }

  describe('SEC-01: Rate Limiter Failure Telemetry & RPC Integration', () => {
    test('checkAtomicRateLimit returns null and logs configuration_error when credentials missing', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const result = await checkAtomicRateLimit('198.51.100.1');
      assert.equal(result, null);

      const warnLog = capturedLogs.find((l) => l.message.includes('contact_rate_limit_fallback'));
      assert.ok(warnLog, 'Must emit structured telemetry log');
      assert.ok(warnLog.message.includes('"category":"configuration_error"'));
      assert.ok(!warnLog.message.includes('198.51.100.1'), 'Must NEVER log IP address');
    });

    test('checkAtomicRateLimit returns true when RPC allows the request', async () => {
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('/rest/v1/rpc/check_and_increment_rate_limit'));
        return {
          ok: true,
          status: 200,
          json: async () => true
        };
      };

      const result = await checkAtomicRateLimit('198.51.100.2');
      assert.equal(result, true);
      assert.equal(capturedLogs.length, 0, 'No warning log when RPC succeeds');
    });

    test('checkAtomicRateLimit returns false when RPC rejects the request (rate-limited)', async () => {
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => false
      });

      const result = await checkAtomicRateLimit('198.51.100.3');
      assert.equal(result, false);
      assert.equal(capturedLogs.length, 0, 'No fallback log when DB definitively rejects');
    });

    test('handler rejects with 429 when RPC returns false without invoking in-memory fallback', async () => {
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => false
      });

      const { req, res } = createMockReqRes();
      await contactHandler(req, res);

      assert.equal(res.getStatusCode(), 429);
      assert.equal(ipRateLimitMap.size, 0, 'In-memory fallback must NOT be activated when RPC returns false');
    });

    test('checkAtomicRateLimit logs http_error and sanitized code on RPC 500 / 404', async () => {
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
        json: async () => ({ code: '42883', message: 'function pg_catalog.trim(text) does not exist' })
      });

      const result = await checkAtomicRateLimit('198.51.100.4');
      assert.equal(result, null);

      const warnLog = capturedLogs.find((l) => l.message.includes('contact_rate_limit_fallback'));
      assert.ok(warnLog);
      assert.ok(warnLog.message.includes('"category":"http_error"'));
      assert.ok(warnLog.message.includes('"status":404'));
      assert.ok(warnLog.message.includes('"code":"42883"'));
      assert.ok(!warnLog.message.includes('pg_catalog.trim'), 'Must NOT log raw database error message');
      assert.ok(!warnLog.message.includes('198.51.100.4'), 'Must NOT log IP');
      assert.ok(!warnLog.message.includes('mock-service-key'), 'Must NOT log service role key');
    });

    test('checkAtomicRateLimit logs timeout on fetch abort or timeout', async () => {
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

      globalThis.fetch = async () => {
        const timeoutErr = new Error('The operation was aborted due to timeout');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      };

      const result = await checkAtomicRateLimit('198.51.100.5');
      assert.equal(result, null);

      const warnLog = capturedLogs.find((l) => l.message.includes('contact_rate_limit_fallback'));
      assert.ok(warnLog);
      assert.ok(warnLog.message.includes('"category":"timeout"'));
    });

    test('checkAtomicRateLimit logs network_error on unexpected network exception', async () => {
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

      globalThis.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      const result = await checkAtomicRateLimit('198.51.100.6');
      assert.equal(result, null);

      const warnLog = capturedLogs.find((l) => l.message.includes('contact_rate_limit_fallback'));
      assert.ok(warnLog);
      assert.ok(warnLog.message.includes('"category":"network_error"'));
    });

    test('checkAtomicRateLimit logs malformed_response when response is unparseable or not boolean', async () => {
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

      // 1. Non-boolean JSON
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: 'data' })
      });

      const result1 = await checkAtomicRateLimit('198.51.100.7');
      assert.equal(result1, null);
      let warnLog = capturedLogs.find((l) => l.message.includes('"category":"malformed_response"'));
      assert.ok(warnLog);

      // 2. Unparseable JSON
      capturedLogs = [];
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        }
      });

      const result2 = await checkAtomicRateLimit('198.51.100.7');
      assert.equal(result2, null);
      warnLog = capturedLogs.find((l) => l.message.includes('"category":"malformed_response"'));
      assert.ok(warnLog);
    });
  });

  describe('SEC-02: Bounded In-Memory Rate-Limit Fallback', () => {
    test('allows exactly 5 requests and rejects the 6th and 7th', () => {
      const ip = '203.0.113.1';
      for (let i = 1; i <= 5; i++) {
        const isLimited = isMemoryRateLimited(ip);
        assert.equal(isLimited, false, `Request ${i} should be allowed`);
      }

      // 6th and 7th requests
      assert.equal(isMemoryRateLimited(ip), true, 'Request 6 must be blocked');
      assert.equal(isMemoryRateLimited(ip), true, 'Request 7 must be blocked');

      // Verify timestamp array never exceeds 5 items
      const entry = ipRateLimitMap.get(ip);
      assert.equal(entry.length, 5, 'Timestamp array length must be strictly bounded to 5');
    });

    test('repeated blocked requests never grow timestamp array', () => {
      const ip = '203.0.113.2';
      for (let i = 0; i < 5; i++) {
        isMemoryRateLimited(ip);
      }
      for (let i = 0; i < 50; i++) {
        isMemoryRateLimited(ip);
      }
      const entry = ipRateLimitMap.get(ip);
      assert.equal(entry.length, 5, 'Timestamp array must remain bounded at 5 despite 50 blocked attempts');
    });

    test('expired timestamps stop counting and allow new requests after window', () => {
      const ip = '203.0.113.3';
      const now = Date.now();

      // Pre-fill with 5 timestamps older than 15 minutes
      const oldTimestamps = [
        now - (RATE_LIMIT_WINDOW_MS + 5000),
        now - (RATE_LIMIT_WINDOW_MS + 4000),
        now - (RATE_LIMIT_WINDOW_MS + 3000),
        now - (RATE_LIMIT_WINDOW_MS + 2000),
        now - (RATE_LIMIT_WINDOW_MS + 1000)
      ];
      ipRateLimitMap.set(ip, oldTimestamps);

      // Next request should be allowed since previous expired
      const isLimited = isMemoryRateLimited(ip);
      assert.equal(isLimited, false, 'Expired request should not count');

      const entry = ipRateLimitMap.get(ip);
      assert.equal(entry.length, 1, 'Only the new timestamp should be stored');
    });

    test('pruneExpiredMemoryEntries removes keys whose timestamps have all expired', () => {
      const now = Date.now();
      const ipActive = '203.0.113.10';
      const ipExpired = '203.0.113.20';

      ipRateLimitMap.set(ipActive, [now - 1000]);
      ipRateLimitMap.set(ipExpired, [now - (RATE_LIMIT_WINDOW_MS + 1000)]);

      assert.equal(ipRateLimitMap.size, 2);
      pruneExpiredMemoryEntries(now);

      assert.equal(ipRateLimitMap.size, 1);
      assert.ok(ipRateLimitMap.has(ipActive), 'Active IP should be retained');
      assert.ok(!ipRateLimitMap.has(ipExpired), 'Expired IP must be pruned');
    });

    test('enforces MAX_MEMORY_ENTRIES limit (5,000) with deterministic LRU eviction', () => {
      // Pre-fill to 5,000 entries
      for (let i = 0; i < MAX_MEMORY_ENTRIES; i++) {
        ipRateLimitMap.set(`10.0.${Math.floor(i / 256)}.${i % 256}`, [Date.now()]);
      }
      assert.equal(ipRateLimitMap.size, MAX_MEMORY_ENTRIES);

      // Oldest key is 10.0.0.0
      assert.ok(ipRateLimitMap.has('10.0.0.0'));

      // Add a new IP
      const newIp = '192.168.1.1';
      isMemoryRateLimited(newIp);

      // Capacity must remain at 5,000
      assert.equal(ipRateLimitMap.size, MAX_MEMORY_ENTRIES);
      assert.ok(!ipRateLimitMap.has('10.0.0.0'), 'Oldest key must be evicted under LRU');
      assert.ok(ipRateLimitMap.has(newIp), 'New IP must be present');
    });

    test('pruning expired entries takes priority over evicting active LRU entries when full', () => {
      const now = Date.now();
      // Fill to MAX_MEMORY_ENTRIES: 1st entry is expired, others active
      ipRateLimitMap.set('expired.ip', [now - (RATE_LIMIT_WINDOW_MS + 5000)]);
      for (let i = 1; i < MAX_MEMORY_ENTRIES; i++) {
        ipRateLimitMap.set(`10.1.${Math.floor(i / 256)}.${i % 256}`, [now]);
      }
      assert.equal(ipRateLimitMap.size, MAX_MEMORY_ENTRIES);

      // Add new IP
      isMemoryRateLimited('new.ip.address');

      assert.equal(ipRateLimitMap.size, MAX_MEMORY_ENTRIES);
      assert.ok(!ipRateLimitMap.has('expired.ip'), 'Expired IP was pruned to make space');
      assert.ok(ipRateLimitMap.has('new.ip.address'));
    });

    test('accessing existing IP below limit promotes it in LRU order so older untouched IP is evicted first', () => {
      const ipA = '198.51.100.10';
      const ipB = '198.51.100.20';
      const newIp = '198.51.100.99';

      // 1. Insert IP A
      isMemoryRateLimited(ipA);
      // 2. Insert IP B
      isMemoryRateLimited(ipB);

      // Verify initial order: IP A is oldest, IP B is newest
      assert.deepEqual(Array.from(ipRateLimitMap.keys()), [ipA, ipB]);

      // 3. Access IP A again while below the rate limit
      const allowedA = isMemoryRateLimited(ipA);
      assert.equal(allowedA, false, 'Second request from IP A must be allowed');

      // Verify promoted order: IP B is now oldest, IP A is newest
      assert.deepEqual(Array.from(ipRateLimitMap.keys()), [ipB, ipA]);

      // 4. Fill Map to capacity (5,000 entries)
      for (let i = 2; i < MAX_MEMORY_ENTRIES; i++) {
        ipRateLimitMap.set(`10.2.${Math.floor(i / 256)}.${i % 256}`, [Date.now()]);
      }
      assert.equal(ipRateLimitMap.size, MAX_MEMORY_ENTRIES);

      // Verify that IP B is at the head of the Map (oldest)
      assert.equal(ipRateLimitMap.keys().next().value, ipB);

      // 5. Insert a new IP
      isMemoryRateLimited(newIp);

      // 6. Assert that IP B was evicted, while promoted IP A remains intact
      assert.equal(ipRateLimitMap.size, MAX_MEMORY_ENTRIES);
      assert.ok(!ipRateLimitMap.has(ipB), 'IP B must be evicted as least recently used');
      assert.ok(ipRateLimitMap.has(ipA), 'IP A must be preserved due to access promotion');
      assert.ok(ipRateLimitMap.has(newIp), 'New IP must be inserted');
    });

    test('blocked requests preserve rate limit history without extending window or appending timestamps', () => {
      const ip = '198.51.100.50';
      const now = Date.now();
      const firstTimestamp = now - 60000; // 1 minute ago

      // Fill exactly 5 requests
      const initialTimestamps = [
        firstTimestamp,
        firstTimestamp + 1000,
        firstTimestamp + 2000,
        firstTimestamp + 3000,
        firstTimestamp + 4000
      ];
      ipRateLimitMap.set(ip, [...initialTimestamps]);

      // 6th request (blocked)
      const blocked1 = isMemoryRateLimited(ip);
      assert.equal(blocked1, true);

      // 7th request (blocked)
      const blocked2 = isMemoryRateLimited(ip);
      assert.equal(blocked2, true);

      const stored = ipRateLimitMap.get(ip);
      assert.equal(stored.length, 5, 'Must never append timestamps beyond 5');
      assert.equal(stored[0], firstTimestamp, 'Must preserve original window start');
      assert.deepEqual(stored, initialTimestamps, 'Timestamps must remain strictly unchanged on blocked requests');
    });
  });

  describe('SEC-03: Discord Webhook Fetch Timeout & Resilience', () => {
    test('configures 5-second AbortSignal timeout on Discord fetch', async () => {
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock/test';
      delete process.env.SUPABASE_URL; // Use memory rate limiting

      let capturedOptions = null;
      globalThis.fetch = async (url, opts) => {
        if (url.includes('discord')) {
          capturedOptions = opts;
          return { ok: true, status: 204 };
        }
        return { ok: true, status: 200, json: async () => true };
      };

      const { req, res } = createMockReqRes();
      await contactHandler(req, res);

      assert.equal(res.getStatusCode(), 200);
      assert.ok(capturedOptions, 'Discord fetch must be called');
      assert.ok(capturedOptions.signal, 'Signal must be configured');
      assert.ok(capturedOptions.signal instanceof AbortSignal, 'Signal must be an AbortSignal instance');
    });

    test('returns 504 Gateway Timeout when Discord fetch times out without exposing secrets', async () => {
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock/secret-token-xyz';
      delete process.env.SUPABASE_URL;

      globalThis.fetch = async (url) => {
        if (url.includes('discord')) {
          const timeoutErr = new Error('The operation was aborted due to timeout');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        return { ok: true, status: 200, json: async () => true };
      };

      const { req, res } = createMockReqRes();
      await contactHandler(req, res);

      assert.equal(res.getStatusCode(), 504);
      assert.deepEqual(res.getBody(), { error: 'Studio notification delivery timed out.' });

      // Check logs
      const errorLog = capturedLogs.find((l) => l.message.includes('Discord dispatch timeout error'));
      assert.ok(errorLog, 'Must log timeout error');
      assert.ok(!errorLog.message.includes('secret-token-xyz'), 'Must NEVER log webhook URL or secrets');
    });

    test('returns 500 when Discord fetch encounters network error without exposing secrets', async () => {
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock/secret-token-xyz';
      delete process.env.SUPABASE_URL;

      globalThis.fetch = async (url) => {
        if (url.includes('discord')) {
          throw new TypeError('Failed to fetch (ECONNREFUSED)');
        }
        return { ok: true, status: 200, json: async () => true };
      };

      const { req, res } = createMockReqRes();
      await contactHandler(req, res);

      assert.equal(res.getStatusCode(), 500);
      assert.deepEqual(res.getBody(), { error: 'Network error connecting to studio notification channel.' });

      // Check logs
      const errorLog = capturedLogs.find((l) => l.message.includes('Discord dispatch network error'));
      assert.ok(errorLog, 'Must log network error');
      assert.ok(!errorLog.message.includes('secret-token-xyz'), 'Must NEVER log webhook URL or secrets');
      assert.ok(!errorLog.message.includes('ECONNREFUSED'), 'Must not log raw error messages');
    });

    test('returns 502 when Discord returns non-2xx status without duplicate retries', async () => {
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock/test';
      delete process.env.SUPABASE_URL;

      let callCount = 0;
      globalThis.fetch = async (url) => {
        if (url.includes('discord')) {
          callCount++;
          return { ok: false, status: 500 };
        }
        return { ok: true, status: 200, json: async () => true };
      };

      const { req, res } = createMockReqRes();
      await contactHandler(req, res);

      assert.equal(res.getStatusCode(), 502);
      assert.deepEqual(res.getBody(), { error: 'Studio notification delivery failed.' });
      assert.equal(callCount, 1, 'Must NOT attempt automatic retries on failure');
    });
  });
});
