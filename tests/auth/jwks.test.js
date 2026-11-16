// Comprehensive cryptographic unit tests for Supabase dynamic JWKS verification
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  verifySupabaseJwt,
  SupabaseJwksClient,
  resetGlobalJwksClient,
  validateAndNormalizeJwksOrigin
} from '../../api/auth/_utils.js';

const MOCK_SUPABASE_URL = 'https://lenkfmllsfaijeqafhaz.supabase.co';

function generateEcKeypair(kid = 'key-test-1') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = kid;
  jwk.use = 'sig';
  jwk.alg = 'ES256';
  return { privateKey, publicKey, jwk, kid };
}

function signEs256Jwt(payload, privateKey, headerOverrides = {}) {
  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: 'key-test-1',
    ...headerOverrides
  };
  const b64H = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64P = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signed = `${b64H}.${b64P}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signed);
  const sig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${signed}.${sig}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('Dynamic Supabase JWKS ES256 Verification & Hardening', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    resetGlobalJwksClient();
    process.env.SUPABASE_JWT_ALGORITHM = 'ES256';
    process.env.SUPABASE_URL = MOCK_SUPABASE_URL;
  });

  afterEach(() => {
    resetGlobalJwksClient();
    process.env = { ...origEnv };
  });

  test('valid ES256 JWT verifies successfully against resolved JWKS key', async () => {
    const keypair = generateEcKeypair('active-key-1');
    const jwksData = { keys: [keypair.jwk] };

    const mockFetch = async (url) => {
      assert.equal(url, `${MOCK_SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
      return jsonResponse(jwksData);
    };

    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'active-key-1' });

    const verified = await verifySupabaseJwt(token, { jwksClient });
    assert.equal(verified.sub, payload.sub);
    assert.equal(verified.aud, 'authenticated');
    assert.equal(verified.iss, payload.iss);
  });

  test('modified payload is rejected with Invalid JWT signature', async () => {
    const keypair = generateEcKeypair('active-key-1');
    const jwksData = { keys: [keypair.jwk] };

    const mockFetch = async () => jsonResponse(jwksData);
    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'active-key-1' });
    const parts = token.split('.');

    // Tamper with payload
    const tamperedPayload = { ...payload, sub: '87654321-4321-4321-4321-cba987654321' };
    const b64Tampered = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
    const tamperedToken = `${parts[0]}.${b64Tampered}.${parts[2]}`;

    await assert.rejects(
      () => verifySupabaseJwt(tamperedToken, { jwksClient }),
      /Invalid JWT signature/
    );
  });

  test('tampered signature is rejected with Invalid JWT signature', async () => {
    const keypair = generateEcKeypair('active-key-1');
    const jwksData = { keys: [keypair.jwk] };

    const mockFetch = async () => jsonResponse(jwksData);
    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'active-key-1' });
    const parts = token.split('.');

    // Corrupt signature
    const corruptSig = Buffer.from('a'.repeat(64)).toString('base64url');
    const corruptToken = `${parts[0]}.${parts[1]}.${corruptSig}`;

    await assert.rejects(
      () => verifySupabaseJwt(corruptToken, { jwksClient }),
      /Invalid JWT signature/
    );
  });

  test('different unknown kids cannot cause back-to-back upstream requests (cooldown enforced)', async () => {
    const key1 = generateEcKeypair('known-key-1');
    let fetchCount = 0;

    const mockFetch = async () => {
      fetchCount++;
      return jsonResponse({ keys: [key1.jwk] });
    };

    // 1000ms cooldown
    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch, minRefreshIntervalMs: 1000, backoffMs: 0 });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    // 1. First unknown kid triggers initial fetch
    const tokenUnknown1 = signEs256Jwt(payload, key1.privateKey, { kid: 'unknown-kid-1' });
    await assert.rejects(
      () => verifySupabaseJwt(tokenUnknown1, { jwksClient }),
      /Key ID unknown-kid-1 not found in Supabase JWKS/
    );
    assert.equal(fetchCount, 1);

    // 2. Second unknown kid immediately after is blocked by cooldown (NO second fetch)
    const tokenUnknown2 = signEs256Jwt(payload, key1.privateKey, { kid: 'unknown-kid-2' });
    await assert.rejects(
      () => verifySupabaseJwt(tokenUnknown2, { jwksClient }),
      /refresh cooldown active/
    );
    assert.equal(fetchCount, 1, 'Fetch count must remain 1 due to active cooldown');
  });

  test('legitimate rotation is discovered after cooldown', async () => {
    const key1 = generateEcKeypair('key-1');
    const key2 = generateEcKeypair('key-2');

    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      if (fetchCount === 1) {
        return jsonResponse({ keys: [key1.jwk] });
      }
      return jsonResponse({ keys: [key1.jwk, key2.jwk] });
    };

    // Short cooldown of 20ms for testing
    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch, minRefreshIntervalMs: 20, backoffMs: 0 });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    // 1. Token 1 verifies with key-1
    const token1 = signEs256Jwt(payload, key1.privateKey, { kid: 'key-1' });
    await verifySupabaseJwt(token1, { jwksClient });
    assert.equal(fetchCount, 1);

    // 2. Token 2 with rotated key-2 immediately blocked by 20ms cooldown
    const token2 = signEs256Jwt(payload, key2.privateKey, { kid: 'key-2' });
    await assert.rejects(
      () => verifySupabaseJwt(token2, { jwksClient }),
      /refresh cooldown active/
    );
    assert.equal(fetchCount, 1);

    // 3. Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 25));

    // 4. Token 2 now triggers refresh and succeeds
    const verified2 = await verifySupabaseJwt(token2, { jwksClient });
    assert.equal(fetchCount, 2);
    assert.equal(verified2.sub, payload.sub);
  });

  test('concurrent requests for unknown kid deduplicate and share a single in-flight refresh', async () => {
    const keypair = generateEcKeypair('active-key-concurrent');
    let fetchCount = 0;

    const mockFetch = async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 25));
      return jsonResponse({ keys: [keypair.jwk] });
    };

    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'active-key-concurrent' });

    // Execute 5 concurrent verifications
    const results = await Promise.all([
      verifySupabaseJwt(token, { jwksClient }),
      verifySupabaseJwt(token, { jwksClient }),
      verifySupabaseJwt(token, { jwksClient }),
      verifySupabaseJwt(token, { jwksClient }),
      verifySupabaseJwt(token, { jwksClient })
    ]);

    assert.equal(results.length, 5);
    for (const r of results) {
      assert.equal(r.sub, payload.sub);
    }
    assert.equal(fetchCount, 1, 'Concurrent requests must share exactly 1 in-flight refresh');
  });

  test('malformed JWKS payload fails closed with CONFIG_ERROR', async () => {
    const keypair = generateEcKeypair('bad-jwks-key');
    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'bad-jwks-key' });

    // 1. Non-JSON response
    {
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => new Response('<html>Not Found</html>', { status: 200 }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /CONFIG_ERROR: Failed to fetch JWKS/
      );
    }

    // 2. Missing keys array
    {
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ wrong: true }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /CONFIG_ERROR: Failed to fetch JWKS/
      );
    }

    // 3. Empty keys array
    {
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /CONFIG_ERROR: Failed to fetch JWKS/
      );
    }
  });

  test('JWK with conflicting or invalid attributes (kty, crv, alg, use) is rejected', async () => {
    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    // 1. Wrong kty (e.g. RSA)
    {
      const keypair = generateEcKeypair('wrong-kty');
      const badJwk = { ...keypair.jwk, kty: 'RSA' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'wrong-kty' });
      await assert.rejects(() => verifySupabaseJwt(token, { jwksClient }), /CONFIG_ERROR/);
    }

    // 2. Wrong crv (e.g. secp256k1)
    {
      const keypair = generateEcKeypair('wrong-crv');
      const badJwk = { ...keypair.jwk, crv: 'secp256k1' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'wrong-crv' });
      await assert.rejects(() => verifySupabaseJwt(token, { jwksClient }), /CONFIG_ERROR/);
    }

    // 3. Conflicting alg (e.g. RS256)
    {
      const keypair = generateEcKeypair('conflicting-alg');
      const badJwk = { ...keypair.jwk, alg: 'RS256' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'conflicting-alg' });
      await assert.rejects(() => verifySupabaseJwt(token, { jwksClient }), /CONFIG_ERROR/);
    }

    // 4. Conflicting use (e.g. enc)
    {
      const keypair = generateEcKeypair('conflicting-use');
      const badJwk = { ...keypair.jwk, use: 'enc' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'conflicting-use' });
      await assert.rejects(() => verifySupabaseJwt(token, { jwksClient }), /CONFIG_ERROR/);
    }
  });

  test('noncanonical coordinates (dirty padding bits, padding chars, illegal chars) are rejected', async () => {
    const keypair = generateEcKeypair('coord-test');
    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    // 1. Dirty padding bits (43rd char has non-zero unused bits)
    const dirtyCoord = 'a'.repeat(42) + 'B';
    const badJwk1 = { ...keypair.jwk, x: dirtyCoord };
    const jwksClient1 = new SupabaseJwksClient({
      fetch: async () => jsonResponse({ keys: [badJwk1] }),
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });
    const token1 = signEs256Jwt(payload, keypair.privateKey, { kid: 'coord-test' });
    await assert.rejects(() => verifySupabaseJwt(token1, { jwksClient1 }), /CONFIG_ERROR/);

    // 2. Padding '=' character
    const badJwk2 = { ...keypair.jwk, x: 'a'.repeat(42) + '=' };
    const jwksClient2 = new SupabaseJwksClient({
      fetch: async () => jsonResponse({ keys: [badJwk2] }),
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });
    await assert.rejects(() => verifySupabaseJwt(token1, { jwksClient2 }), /CONFIG_ERROR/);

    // 3. Illegal non-base64url characters ('+' or '/')
    const badJwk3 = { ...keypair.jwk, x: 'a'.repeat(42) + '+' };
    const jwksClient3 = new SupabaseJwksClient({
      fetch: async () => jsonResponse({ keys: [badJwk3] }),
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });
    await assert.rejects(() => verifySupabaseJwt(token1, { jwksClient3 }), /CONFIG_ERROR/);

    // 4. Incorrect length (e.g. 42 chars or 'short')
    const badJwk4 = { ...keypair.jwk, x: 'short' };
    const jwksClient4 = new SupabaseJwksClient({
      fetch: async () => jsonResponse({ keys: [badJwk4] }),
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });
    await assert.rejects(() => verifySupabaseJwt(token1, { jwksClient4 }), /CONFIG_ERROR/);
  });

  test('duplicate kid values fail closed with CONFIG_ERROR across valid and invalid combinations', async () => {
    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    // 1. Both entries are valid ES256
    {
      const key1 = generateEcKeypair('dup-valid-valid');
      const key2 = generateEcKeypair('dup-valid-valid');
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [key1.jwk, key2.jwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, key1.privateKey, { kid: 'dup-valid-valid' });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /JWKS contains duplicate key ID: dup-valid-valid/
      );
    }

    // 2. Entry 1 valid ES256, entry 2 invalid kty ('RSA')
    {
      const key1 = generateEcKeypair('dup-valid-badkty');
      const badJwk = { ...generateEcKeypair('dup-valid-badkty').jwk, kty: 'RSA' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [key1.jwk, badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, key1.privateKey, { kid: 'dup-valid-badkty' });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /JWKS contains duplicate key ID: dup-valid-badkty/
      );
    }

    // 3. Entry 1 valid ES256, entry 2 invalid crv ('P-384')
    {
      const key1 = generateEcKeypair('dup-valid-badcrv');
      const badJwk = { ...generateEcKeypair('dup-valid-badcrv').jwk, crv: 'P-384' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [key1.jwk, badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, key1.privateKey, { kid: 'dup-valid-badcrv' });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /JWKS contains duplicate key ID: dup-valid-badcrv/
      );
    }

    // 4. Entry 1 valid ES256, entry 2 conflicting alg ('RS256')
    {
      const key1 = generateEcKeypair('dup-valid-badalg');
      const badJwk = { ...generateEcKeypair('dup-valid-badalg').jwk, alg: 'RS256' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [key1.jwk, badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, key1.privateKey, { kid: 'dup-valid-badalg' });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /JWKS contains duplicate key ID: dup-valid-badalg/
      );
    }

    // 5. Entry 1 valid ES256, entry 2 malformed coordinates
    {
      const key1 = generateEcKeypair('dup-valid-badcoord');
      const badJwk = { ...generateEcKeypair('dup-valid-badcoord').jwk, x: 'invalid-coordinate' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [key1.jwk, badJwk] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, key1.privateKey, { kid: 'dup-valid-badcoord' });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /JWKS contains duplicate key ID: dup-valid-badcoord/
      );
    }

    // 6. Both entries invalid, same kid
    {
      const badJwk1 = { ...generateEcKeypair('dup-bad-bad').jwk, kty: 'RSA' };
      const badJwk2 = { ...generateEcKeypair('dup-bad-bad').jwk, kty: 'oct' };
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => jsonResponse({ keys: [badJwk1, badJwk2] }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      const token = signEs256Jwt(payload, generateEcKeypair('dup-bad-bad').privateKey, { kid: 'dup-bad-bad' });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /JWKS contains duplicate key ID: dup-bad-bad/
      );
    }
  });

  test('more than 50 keys in JWKS fails closed with CONFIG_ERROR', async () => {
    const keys = [];
    for (let i = 0; i < 51; i++) {
      const kp = generateEcKeypair(`key-${i}`);
      keys.push(kp.jwk);
    }

    const jwksClient = new SupabaseJwksClient({
      fetch: async () => jsonResponse({ keys }),
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, generateEcKeypair('key-0').privateKey, { kid: 'key-0' });

    await assert.rejects(
      () => verifySupabaseJwt(token, { jwksClient }),
      /JWKS keys count exceeds maximum allowable limit/
    );
  });

  test('oversized streamed response (> 100 KB) is canceled and rejected', async () => {
    let canceled = false;
    const chunk = new Uint8Array(32 * 1024); // 32 KB chunk
    chunk.fill(65);

    // Stream produces chunks continuously until canceled
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        canceled = true;
      }
    });

    const res = {
      ok: true,
      status: 200,
      body: stream
    };

    const jwksClient = new SupabaseJwksClient({
      fetch: async () => res,
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, generateEcKeypair('any-key').privateKey, { kid: 'any-key' });

    await assert.rejects(
      () => verifySupabaseJwt(token, { jwksClient }),
      /JWKS response exceeded maximum allowable size/
    );
    assert.equal(canceled, true, 'Stream reader must be canceled immediately upon exceeding limit');
  });

  test('response body byte limit is enforced on actual bytes, not string length', async () => {
    // 2-byte UTF-8 character (e.g. '©' is 2 bytes: 0xC2, 0xA9)
    // 55,000 chars * 2 bytes = 110,000 bytes (> 100 KB byte limit, but chars <= 100k)
    const multiByteString = '©'.repeat(55000);
    const rawBuffer = Buffer.from(multiByteString, 'utf8');
    assert.ok(rawBuffer.length > 100 * 1024);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(rawBuffer);
        controller.close();
      }
    });

    const jwksClient = new SupabaseJwksClient({
      fetch: async () => ({ ok: true, status: 200, body: stream }),
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, generateEcKeypair('any').privateKey, { kid: 'any' });

    await assert.rejects(
      () => verifySupabaseJwt(token, { jwksClient }),
      /JWKS response exceeded maximum allowable size/
    );
  });

  test('stalled response body times out and fails closed', async () => {
    let canceled = false;
    const stream = new ReadableStream({
      async pull() {
        // Stall for 200ms
        await new Promise((r) => setTimeout(r, 200));
      },
      cancel() {
        canceled = true;
      }
    });

    // 50ms timeout
    const jwksClient = new SupabaseJwksClient({
      fetch: async () => ({ ok: true, status: 200, body: stream }),
      timeoutMs: 50,
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, generateEcKeypair('stall').privateKey, { kid: 'stall' });

    await assert.rejects(
      () => verifySupabaseJwt(token, { jwksClient }),
      /JWKS fetch aborted due to timeout/
    );
    assert.equal(canceled, true, 'Stalled stream must be canceled on timeout');
  });

  test('non-streamable response body fails closed', async () => {
    const jwksClient = new SupabaseJwksClient({
      fetch: async () => ({ ok: true, status: 200, body: null }),
      backoffMs: 0,
      minRefreshIntervalMs: 0
    });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, generateEcKeypair('nostream').privateKey, { kid: 'nostream' });

    await assert.rejects(
      () => verifySupabaseJwt(token, { jwksClient }),
      /JWKS response body is not streamable/
    );
  });

  test('different Supabase origins cannot share cached keys or in-flight refreshes', async () => {
    const keypairA = generateEcKeypair('shared-kid');
    const keypairB = generateEcKeypair('shared-kid'); // same kid, different keys

    const originA = 'https://project-a.supabase.co';
    const originB = 'https://project-b.supabase.co';

    const mockFetch = async (url) => {
      if (url.startsWith(originA)) {
        return jsonResponse({ keys: [keypairA.jwk] });
      }
      if (url.startsWith(originB)) {
        return jsonResponse({ keys: [keypairB.jwk] });
      }
      throw new Error(`Unexpected origin: ${url}`);
    };

    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch });

    // 1. Fetch key for origin A
    const keyA = await jwksClient.getSigningKey('shared-kid', originA);
    assert.ok(keyA);

    // 2. Fetch key for origin B with same kid: must trigger separate fetch and return keyB
    const keyB = await jwksClient.getSigningKey('shared-kid', originB);
    assert.ok(keyB);

    // Compare exported SPKI PEMs to prove they are distinct keys
    const pemA = keyA.export({ type: 'spki', format: 'pem' });
    const pemB = keyB.export({ type: 'spki', format: 'pem' });
    assert.notEqual(pemA, pemB, 'Keys from different origins must not collide or overwrite');
  });

  test('origin eviction enforces genuine LRU ordering and prevents cross-origin reuse', async () => {
    let fetchOrigins = [];
    const mockFetch = async (url) => {
      const match = url.match(/https:\/\/(project-[0-9]+)\.supabase\.co/);
      const name = match ? match[1] : 'unknown';
      fetchOrigins.push(name);
      const kp = generateEcKeypair(`key-${name}`);
      return jsonResponse({ keys: [kp.jwk] });
    };

    const jwksClient = new SupabaseJwksClient({ fetch: mockFetch });

    // 1. Populate cache with 10 origins: project-0 through project-9
    for (let i = 0; i < 10; i++) {
      await jwksClient.getSigningKey(`key-project-${i}`, `https://project-${i}.supabase.co`);
    }
    assert.equal(fetchOrigins.length, 10);
    assert.equal(jwksClient.origins.size, 10);

    // 2. Access project-0 again (refreshes recency, making project-1 the least recently used)
    await jwksClient.getSigningKey('key-project-0', 'https://project-0.supabase.co');
    assert.equal(fetchOrigins.length, 10, 'project-0 should hit cache without network fetch');

    // 3. Add 11th origin: project-10 (triggers eviction of project-1)
    await jwksClient.getSigningKey('key-project-10', 'https://project-10.supabase.co');
    assert.equal(jwksClient.origins.size, 10);
    assert.ok(jwksClient.origins.has('https://project-0.supabase.co'), 'project-0 must remain cached due to LRU refresh');
    assert.ok(!jwksClient.origins.has('https://project-1.supabase.co'), 'project-1 must be evicted as LRU');
    assert.ok(jwksClient.origins.has('https://project-10.supabase.co'), 'project-10 must be added');

    // 4. Accessing evicted project-1 must refetch and cannot reuse old keys
    await jwksClient.getSigningKey('key-project-1', 'https://project-1.supabase.co');
    assert.equal(fetchOrigins.length, 12, 'Evicted project-1 must trigger a fresh fetch');
  });

  test('URL validation rejects non-HTTPS, credentials, query strings, and fragments', () => {
    // 1. HTTP non-local
    assert.throws(
      () => validateAndNormalizeJwksOrigin('http://insecure.supabase.co'),
      /CONFIG_ERROR: SUPABASE_URL must use HTTPS protocol/
    );

    // 2. Localhost HTTP allowed
    assert.equal(
      validateAndNormalizeJwksOrigin('http://localhost:54321'),
      'http://localhost:54321'
    );
    assert.equal(
      validateAndNormalizeJwksOrigin('http://127.0.0.1:54321'),
      'http://127.0.0.1:54321'
    );

    // 3. Embedded credentials
    assert.throws(
      () => validateAndNormalizeJwksOrigin('https://user:pass@project.supabase.co'),
      /CONFIG_ERROR: SUPABASE_URL must not contain credentials/
    );

    // 4. Query string
    assert.throws(
      () => validateAndNormalizeJwksOrigin('https://project.supabase.co?token=secret'),
      /CONFIG_ERROR: SUPABASE_URL must not contain query parameters/
    );

    // 5. Fragment / hash
    assert.throws(
      () => validateAndNormalizeJwksOrigin('https://project.supabase.co#fragment'),
      /CONFIG_ERROR: SUPABASE_URL must not contain query parameters or fragments/
    );

    // 6. Extra path component
    assert.throws(
      () => validateAndNormalizeJwksOrigin('https://project.supabase.co/extra/path'),
      /CONFIG_ERROR: SUPABASE_URL must not contain a path component/
    );

    // 7. Trailing slash normalized
    assert.equal(
      validateAndNormalizeJwksOrigin('https://lenkfmllsfaijeqafhaz.supabase.co/'),
      'https://lenkfmllsfaijeqafhaz.supabase.co'
    );
  });

  test('network timeout and HTTP error fail closed with CONFIG_ERROR', async () => {
    const keypair = generateEcKeypair('fail-closed-key');
    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };
    const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'fail-closed-key' });

    // 1. HTTP 500 error
    {
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => new Response('Internal Server Error', { status: 500 }),
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /CONFIG_ERROR: Failed to fetch JWKS: JWKS endpoint returned HTTP status 500/
      );
    }

    // 2. Network exception / timeout
    {
      const jwksClient = new SupabaseJwksClient({
        fetch: async () => { throw new TypeError('fetch failed: network timeout'); },
        backoffMs: 0,
        minRefreshIntervalMs: 0
      });
      await assert.rejects(
        () => verifySupabaseJwt(token, { jwksClient }),
        /CONFIG_ERROR: Failed to fetch JWKS: fetch failed/
      );
    }
  });

  test('embedded jwk, jku, and x5c headers are strictly rejected', async () => {
    const keypair = generateEcKeypair('embedded-keys');
    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    // 1. Embedded jwk header
    const tokenJwk = signEs256Jwt(payload, keypair.privateKey, { kid: 'embedded-keys', jwk: keypair.jwk });
    await assert.rejects(
      () => verifySupabaseJwt(tokenJwk),
      /CONFIG_ERROR: Embedded key material or key-source headers are forbidden/
    );

    // 2. Embedded jku header
    const tokenJku = signEs256Jwt(payload, keypair.privateKey, { kid: 'embedded-keys', jku: 'https://evil.com/jwks.json' });
    await assert.rejects(
      () => verifySupabaseJwt(tokenJku),
      /CONFIG_ERROR: Embedded key material or key-source headers are forbidden/
    );

    // 3. Embedded x5c header
    const tokenX5c = signEs256Jwt(payload, keypair.privateKey, { kid: 'embedded-keys', x5c: ['cert'] });
    await assert.rejects(
      () => verifySupabaseJwt(tokenX5c),
      /CONFIG_ERROR: Embedded key material or key-source headers are forbidden/
    );
  });

  test('existing RS256 verification behavior remains intact', async () => {
    process.env.SUPABASE_JWT_ALGORITHM = 'RS256';

    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = rsa.publicKey.export({ type: 'spki', format: 'pem' });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    const header = { alg: 'RS256', typ: 'JWT' };
    const b64H = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64P = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signed = `${b64H}.${b64P}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signed);
    const sig = signer.sign(rsa.privateKey, 'base64url');
    const rsaToken = `${signed}.${sig}`;

    // Verify using options.publicKey
    const verified = await verifySupabaseJwt(rsaToken, { publicKey: publicKeyPem });
    assert.equal(verified.sub, payload.sub);

    // Test tamper rejection
    const corruptRsaToken = `${signed}.${Buffer.from('corrupt-sig').toString('base64url')}`;
    await assert.rejects(
      () => verifySupabaseJwt(corruptRsaToken, { publicKey: publicKeyPem }),
      /Invalid JWT signature/
    );
  });

  test('options.publicKey override works for ES256 tests without network access', async () => {
    const keypair = generateEcKeypair('test-override-key');
    const publicKeyPem = keypair.publicKey.export({ type: 'spki', format: 'pem' });

    const payload = {
      sub: '12345678-1234-1234-1234-123456789abc',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: `${MOCK_SUPABASE_URL}/auth/v1`
    };

    const token = signEs256Jwt(payload, keypair.privateKey, { kid: 'test-override-key' });

    // Verifies with options.publicKey override (does not make any JWKS fetch call)
    const verified = await verifySupabaseJwt(token, { publicKey: publicKeyPem });
    assert.equal(verified.sub, payload.sub);
  });
});
