import { createHash } from 'node:crypto';

/**
 * Computes deterministic SHA-256 page fingerprint matching PostgreSQL auth_util.compute_page_fingerprint.
 * Uses length-prefixed framing to guarantee collision resistance across fields:
 *   v_payload := len(u):u | len(t):t | len(d):d | len(c):c | len(b):b
 * @param {object} params
 * @param {string} params.normalizedUrl
 * @param {string|null} [params.title='']
 * @param {string|null} [params.metaDescription='']
 * @param {string|null} [params.canonicalUrl='']
 * @param {string|null} [params.bodyTextHash='']
 * @returns {string} 64-character lowercase hexadecimal SHA-256 hash
 */
export function computePageFingerprint({
  normalizedUrl,
  title = '',
  metaDescription = '',
  canonicalUrl = '',
  bodyTextHash = ''
}) {
  if (normalizedUrl === null || normalizedUrl === undefined || String(normalizedUrl).trim().length === 0) {
    throw new Error('URL cannot be null or empty');
  }

  const u = String(normalizedUrl).trim();
  const t = title ? String(title).trim() : '';
  const d = metaDescription ? String(metaDescription).trim() : '';
  const c = canonicalUrl ? String(canonicalUrl).trim() : '';
  const b = bodyTextHash ? String(bodyTextHash).trim().toLowerCase() : '';

  const payload = `${u.length}:${u}|${t.length}:${t}|${d.length}:${d}|${c.length}:${c}|${b.length}:${b}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
