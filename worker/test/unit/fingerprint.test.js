import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { computePageFingerprint } from '../../src/parser/fingerprint.js';
import { createDatabaseClient } from '../../src/db/client.js';

test('Fingerprint: rejects null or empty URL', () => {
  assert.throws(
    () => computePageFingerprint({ normalizedUrl: null }),
    /URL cannot be null or empty/
  );
  assert.throws(
    () => computePageFingerprint({ normalizedUrl: '   ' }),
    /URL cannot be null or empty/
  );
});

test('Fingerprint: formats length-prefixed payload and computes SHA-256', () => {
  const url = 'https://yorven.in/test';
  const title = 'Test Title';
  const meta = 'Test Meta Description';
  const canonical = 'https://yorven.in/test';
  const bodyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const expectedPayload = `${url.length}:${url}|${title.length}:${title}|${meta.length}:${meta}|${canonical.length}:${canonical}|${bodyHash.length}:${bodyHash}`;
  const expectedHash = createHash('sha256').update(expectedPayload, 'utf8').digest('hex');

  const actualHash = computePageFingerprint({
    normalizedUrl: url,
    title,
    metaDescription: meta,
    canonicalUrl: canonical,
    bodyTextHash: bodyHash
  });

  assert.equal(actualHash, expectedHash);
  assert.equal(actualHash.length, 64);
});

test('Fingerprint: lowercases bodyTextHash and trims inputs', () => {
  const hash1 = computePageFingerprint({
    normalizedUrl: 'https://yorven.in/test',
    title: '  Title  ',
    bodyTextHash: 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890'
  });

  const hash2 = computePageFingerprint({
    normalizedUrl: 'https://yorven.in/test',
    title: 'Title',
    bodyTextHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
  });

  assert.equal(hash1, hash2);
});

test('Fingerprint: exact parity against PostgreSQL auth_util.compute_page_fingerprint', async () => {
  const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  const client = createDatabaseClient(supabaseUrl, serviceRoleKey);

  const testCases = [
    {
      normalizedUrl: 'https://yorven.in',
      title: 'Yorven — Official Website',
      metaDescription: 'Modern web engineering and software systems.',
      canonicalUrl: 'https://yorven.in',
      bodyTextHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    {
      normalizedUrl: 'https://yorven.in/services',
      title: 'Services',
      metaDescription: null,
      canonicalUrl: null,
      bodyTextHash: null
    },
    {
      normalizedUrl: 'https://yorven.in/insights/post-1',
      title: '',
      metaDescription: 'Some description',
      canonicalUrl: 'https://yorven.in/insights/post-1',
      bodyTextHash: 'AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899'
    }
  ];

  for (const tc of testCases) {
    const nodeFingerprint = computePageFingerprint(tc);

    const { data: sqlFingerprint, error } = await client.rpc('compute_page_fingerprint', {
      p_normalized_url: tc.normalizedUrl,
      p_title: tc.title,
      p_meta_description: tc.metaDescription,
      p_canonical_url: tc.canonicalUrl,
      p_body_text_hash: tc.bodyTextHash
    });

    assert.equal(error, null, `SQL compute_page_fingerprint failed: ${error?.message}`);
    assert.equal(nodeFingerprint, sqlFingerprint, `Fingerprint mismatch for ${tc.normalizedUrl}`);
  }
});
