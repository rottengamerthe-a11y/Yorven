import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, redact, TARGET_ORIGIN, TARGET_HOSTNAME } from '../../src/config.js';

test('Config: TARGET_ORIGIN and TARGET_HOSTNAME are constants', () => {
  assert.equal(TARGET_ORIGIN, 'https://yorven.in');
  assert.equal(TARGET_HOSTNAME, 'yorven.in');
});

test('Config: loadConfig throws if required variables are missing', () => {
  assert.throws(
    () => loadConfig({}),
    /Missing required worker environment variable\(s\): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID/
  );

  assert.throws(
    () => loadConfig({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'key' }),
    /Missing required worker environment variable\(s\): WORKER_ID/
  );
});

test('Config: loadConfig validates URL format', () => {
  assert.throws(
    () => loadConfig({
      SUPABASE_URL: 'not-a-valid-url',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      WORKER_ID: 'worker-1'
    }),
    /Invalid SUPABASE_URL format/
  );
});

test('Config: loadConfig succeeds with valid inputs', () => {
  const config = loadConfig({
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-key',
    WORKER_ID: 'worker-1'
  });

  assert.equal(config.supabaseUrl, 'http://127.0.0.1:54321');
  assert.equal(config.serviceRoleKey, 'secret-service-role-key');
  assert.equal(config.workerId, 'worker-1');
  assert.equal(config.targetOrigin, 'https://yorven.in');
  assert.equal(config.targetHostname, 'yorven.in');
});

test('Config: redact masks service role keys and JWT patterns', () => {
  const secretKey = 'secret-key-1234567890';
  const text = `Connecting with key: ${secretKey} to server`;
  const sanitized = redact(text, [secretKey]);
  assert.ok(!sanitized.includes(secretKey));
  assert.ok(sanitized.includes('[REDACTED]'));

  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozGz_w_w_w_w_w_w_w_w';
  const jwtText = `Bearer ${jwt}`;
  const sanitizedJwt = redact(jwtText);
  assert.ok(!sanitizedJwt.includes(jwt));
  assert.ok(sanitizedJwt.includes('[REDACTED_JWT]'));
});
