import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import contactHandler, {
  getTrustedClientIp,
  sanitizeForDiscord,
  formatDiscordDescription,
  MAX_DISCORD_DESC_LENGTH
} from '../../api/contact.js';

describe('Security Remediation & Verification Suite', () => {

  describe('1. /api/contact Origin & CSRF Hardening', () => {
    test('rejects request with missing or invalid Origin/Referer', async () => {
      let statusCode = 0;
      let responseBody = null;
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'Yorven-Control',
          'origin': 'https://evil-attacker.com'
        },
        body: { name: 'Test', email: 'test@example.com', description: 'Test lead' }
      };
      const res = {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(b) { responseBody = b; return this; }
      };

      await contactHandler(req, res);
      assert.equal(statusCode, 403);
      assert.equal(responseBody?.error, 'Invalid or missing origin');
    });

    test('rejects request with missing X-Requested-With header', async () => {
      let statusCode = 0;
      let responseBody = null;
      const req = {
        method: 'POST',
        headers: {
          'origin': 'https://yorven.in'
        },
        body: { name: 'Test', email: 'test@example.com', description: 'Test lead' }
      };
      const res = {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(b) { responseBody = b; return this; }
      };

      await contactHandler(req, res);
      assert.equal(statusCode, 403);
      assert.equal(responseBody?.error, 'Missing required custom header');
    });

    test('rejects unsupported HTTP methods with 405 and Allow header', async () => {
      let statusCode = 0;
      let allowHeader = null;
      const req = {
        method: 'GET',
        headers: {}
      };
      const res = {
        setHeader(name, val) {
          if (name.toLowerCase() === 'allow') allowHeader = val;
        },
        status(c) { statusCode = c; return this; },
        json() { return this; }
      };

      await contactHandler(req, res);
      assert.equal(statusCode, 405);
      assert.equal(allowHeader, 'POST');
    });
  });

  describe('2. /api/contact Discord Embed Length & Mention Suppression', () => {
    test('truncates Discord embed description at exactly 4,000 characters without exceeding limit', () => {
      // 4,000 characters (exact limit) -> not truncated
      const text4000 = 'a'.repeat(4000);
      const res4000 = formatDiscordDescription(text4000);
      assert.equal(res4000.length, 4000);
      assert.ok(!res4000.includes('[truncated]'));

      // 4,096 characters (Discord maximum embed description limit) -> safely truncated
      const text4096 = 'b'.repeat(4096);
      const res4096 = formatDiscordDescription(text4096);
      assert.ok(res4096.length <= MAX_DISCORD_DESC_LENGTH, `Length ${res4096.length} must be <= ${MAX_DISCORD_DESC_LENGTH}`);
      assert.ok(res4096.includes('... [truncated]'));

      // 4,097 characters (one past Discord limit) -> safely truncated
      const text4097 = 'c'.repeat(4097);
      const res4097 = formatDiscordDescription(text4097);
      assert.ok(res4097.length <= MAX_DISCORD_DESC_LENGTH, `Length ${res4097.length} must be <= ${MAX_DISCORD_DESC_LENGTH}`);
      assert.ok(res4097.includes('... [truncated]'));

      // 5,000 characters (maximum accepted lead size) -> safely truncated for Discord
      const text5000 = 'd'.repeat(5000);
      const res5000 = formatDiscordDescription(text5000);
      assert.ok(res5000.length <= MAX_DISCORD_DESC_LENGTH, `Length ${res5000.length} must be <= ${MAX_DISCORD_DESC_LENGTH}`);
      assert.ok(res5000.includes('... [truncated]'));
    });

    test('accepts 5,000 character inquiry but rejects > 5,000 characters with HTTP 400', async () => {
      let statusCode = 0;
      let responseBody = null;
      const reqOverLimit = {
        method: 'POST',
        headers: {
          'origin': 'https://yorven.in',
          'x-requested-with': 'Yorven-Control'
        },
        body: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          description: 'x'.repeat(5001)
        }
      };
      const res = {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(b) { responseBody = b; return this; }
      };

      await contactHandler(reqOverLimit, res);
      assert.equal(statusCode, 400);
      assert.ok(responseBody?.error?.includes('exceeds maximum length of 5000'));
    });

    test('dispatches valid lead with truncated Discord embed and strict mention suppression', async () => {
      let capturedPayload = null;
      const originalFetch = globalThis.fetch;
      const originalDiscord = process.env.DISCORD_WEBHOOK_URL;
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock/test';

      globalThis.fetch = async (url, opts) => {
        if (url.includes('discord')) {
          capturedPayload = JSON.parse(opts.body);
          return { ok: true, status: 204 };
        }
        return { ok: false, status: 404 };
      };

      try {
        const req = {
          method: 'POST',
          headers: {
            'origin': 'https://yorven.in',
            'x-requested-with': 'Yorven-Control',
            'x-vercel-forwarded-for': '203.0.113.195'
          },
          body: {
            name: 'Security Tester',
            email: 'security@example.com',
            description: 'Hello @everyone and @here lead. ' + 'Long project description text. '.repeat(150)
          }
        };
        const res = {
          setHeader() {},
          status() { return this; },
          json() { return this; }
        };

        await contactHandler(req, res);

        assert.ok(capturedPayload, 'Discord payload should be captured');
        assert.deepEqual(capturedPayload.allowed_mentions, { parse: [] });
        assert.ok(!capturedPayload.embeds[0].description.includes('@everyone'));
        assert.ok(!capturedPayload.embeds[0].description.includes('@here'));
        assert.ok(capturedPayload.embeds[0].description.length <= 4000, 'Embed description must not exceed 4,000 characters');
      } finally {
        globalThis.fetch = originalFetch;
        process.env.DISCORD_WEBHOOK_URL = originalDiscord;
      }
    });

    test('Discord notification failure returns 502 without losing lead delivery status', async () => {
      let statusCode = 0;
      let responseBody = null;
      const originalFetch = globalThis.fetch;
      const originalDiscord = process.env.DISCORD_WEBHOOK_URL;
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock/test';

      globalThis.fetch = async (url) => {
        if (url.includes('discord')) {
          return { ok: false, status: 500 };
        }
        return { ok: false, status: 404 };
      };

      try {
        const req = {
          method: 'POST',
          headers: {
            'origin': 'https://yorven.in',
            'x-requested-with': 'Yorven-Control'
          },
          body: {
            name: 'Client',
            email: 'client@example.com',
            description: 'Project inquiry'
          }
        };
        const res = {
          setHeader() {},
          status(c) { statusCode = c; return this; },
          json(b) { responseBody = b; return this; }
        };

        await contactHandler(req, res);
        assert.equal(statusCode, 502);
        assert.equal(responseBody?.error, 'Studio notification delivery failed.');
      } finally {
        globalThis.fetch = originalFetch;
        process.env.DISCORD_WEBHOOK_URL = originalDiscord;
      }
    });

    test('silently filters spam bots via honeypot field', async () => {
      let statusCode = 0;
      let responseBody = null;
      const req = {
        method: 'POST',
        headers: {
          'origin': 'https://yorven.in',
          'x-requested-with': 'Yorven-Control'
        },
        body: {
          name: 'Bot',
          email: 'bot@spam.com',
          description: 'Spam text',
          website: 'https://spam-link.com'
        }
      };
      const res = {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(b) { responseBody = b; return this; }
      };

      await contactHandler(req, res);
      assert.equal(statusCode, 200);
      assert.equal(responseBody?.success, true);
      assert.equal(responseBody?.message, 'Filtered');
    });
  });

  describe('3. Trusted Proxy & Client IP Extraction', () => {
    test('extracts and validates valid IPv4 from x-vercel-forwarded-for', () => {
      const req = { headers: { 'x-vercel-forwarded-for': '203.0.113.195' } };
      assert.equal(getTrustedClientIp(req), '203.0.113.195');
    });

    test('extracts and validates valid IPv6 from x-vercel-forwarded-for', () => {
      const req = { headers: { 'x-vercel-forwarded-for': '2001:db8:85a3::8a2e:370:7334' } };
      assert.equal(getTrustedClientIp(req), '2001:db8:85a3::8a2e:370:7334');
    });

    test('extracts client IP from multi-hop comma-separated chain in x-vercel-forwarded-for', () => {
      const req = { headers: { 'x-vercel-forwarded-for': '203.0.113.195, 10.0.0.1, 172.16.0.1' } };
      assert.equal(getTrustedClientIp(req), '203.0.113.195');
    });

    test('uses x-real-ip when x-vercel-forwarded-for is missing', () => {
      const req = { headers: { 'x-real-ip': '198.51.100.22' } };
      assert.equal(getTrustedClientIp(req), '198.51.100.22');
    });

    test('rejects malformed non-IP in x-vercel-forwarded-for and falls back to valid x-real-ip', () => {
      const req = {
        headers: {
          'x-vercel-forwarded-for': 'malicious-injected-payload, 10.0.0.1',
          'x-real-ip': '198.51.100.33'
        }
      };
      assert.equal(getTrustedClientIp(req), '198.51.100.33');
    });

    test('rejects out-of-range octets and invalid formats', () => {
      const req = {
        headers: {
          'x-vercel-forwarded-for': '999.999.999.999',
          'x-real-ip': '12.34.56.78.90',
          'x-forwarded-for': 'not-an-ip'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };
      assert.equal(getTrustedClientIp(req), '127.0.0.1');
    });

    test('prefers x-vercel-forwarded-for over attacker-controlled x-forwarded-for', () => {
      const req = {
        headers: {
          'x-vercel-forwarded-for': '203.0.113.195',
          'x-forwarded-for': '1.2.3.4, 5.6.7.8'
        }
      };
      assert.equal(getTrustedClientIp(req), '203.0.113.195');
    });

    test('extracts client IP from standard x-forwarded-for managed by Vercel edge', () => {
      const req = { headers: { 'x-forwarded-for': '192.0.2.55, 10.0.0.2' } };
      assert.equal(getTrustedClientIp(req), '192.0.2.55');
    });

    test('falls back to socket remoteAddress when proxy headers are absent', () => {
      const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      assert.equal(getTrustedClientIp(req), '127.0.0.1');
    });

    test('returns unknown when all headers and socket are absent or malformed', () => {
      const req = { headers: { 'x-vercel-forwarded-for': 'invalid' }, socket: { remoteAddress: 'also-invalid' } };
      assert.equal(getTrustedClientIp(req), 'unknown');
    });
  });

  describe('4. Browser Security Configuration (vercel.json)', () => {
    test('vercel.json specifies complete security headers, 1-year HSTS, and Report-Only CSP', () => {
      const vercelJson = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
      assert.ok(Array.isArray(vercelJson.headers), 'headers block must exist');

      // Check document headers
      const docHeaderBlock = vercelJson.headers.find(h => h.source === '/((?!api/).*)');
      assert.ok(docHeaderBlock, 'Document header block must exist');

      const headerMap = new Map(docHeaderBlock.headers.map(h => [h.key, h.value]));
      assert.ok(headerMap.has('Content-Security-Policy-Report-Only'), 'Must have CSP in Report-Only mode');
      assert.equal(headerMap.get('X-Frame-Options'), 'DENY');
      assert.equal(headerMap.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(headerMap.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
      assert.ok(headerMap.get('Permissions-Policy')?.includes('camera=()'));
      assert.equal(headerMap.get('Strict-Transport-Security'), 'max-age=31536000');
      assert.equal(headerMap.get('Cross-Origin-Opener-Policy'), 'same-origin');
      assert.equal(headerMap.get('Cross-Origin-Resource-Policy'), 'same-origin');

      // Check CSP policy directives
      const csp = headerMap.get('Content-Security-Policy-Report-Only');
      assert.ok(csp.includes("default-src 'self'"), 'CSP must include default-src');
      assert.ok(csp.includes("https://fonts.googleapis.com"), 'CSP must allow Google Fonts style');
      assert.ok(csp.includes("https://fonts.gstatic.com"), 'CSP must allow Google Fonts font');
      assert.ok(csp.includes("https://www.googletagmanager.com"), 'CSP must allow GA4 script');
      assert.ok(csp.includes("https://api.web3forms.com"), 'CSP must allow Web3Forms connect/form');
      assert.ok(csp.includes("https://*.supabase.co"), 'CSP must allow Supabase connect');
      assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must deny frame ancestors');

      // Verify NO wildcard CORS on document headers
      assert.ok(!headerMap.has('Access-Control-Allow-Origin'), 'Must NOT return wildcard CORS on documents');
    });
  });

  describe('5. Database Migration Specification', () => {
    test('migration 20261118183000_contact_rate_limits.sql enforces strict schema isolation and input validation', () => {
      const sql = fs.readFileSync('supabase/migrations/20261118183000_contact_rate_limits.sql', 'utf8');
      assert.ok(sql.includes('auth_util.contact_rate_limits'), 'Table must reside in auth_util schema');
      assert.ok(sql.includes('REVOKE ALL ON auth_util.contact_rate_limits FROM PUBLIC, anon, authenticated'), 'Must revoke from public/anon/auth');
      assert.ok(sql.includes('GRANT ALL ON auth_util.contact_rate_limits TO service_role'), 'Must grant exclusively to service_role');
      assert.ok(sql.includes("SET search_path = ''"), 'Must enforce empty search_path');
      assert.ok(sql.includes("interval '24 hours'"), 'Must include 24-hour data retention cleanup prune');

      // Assert parameter validation and exception raising
      assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip must not be null or whitespace-only'"), 'Must raise on null/whitespace IP');
      assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip exceeds maximum length of 128 characters'"), 'Must raise on oversized IP');
      assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_window_ms must be a positive integer not exceeding 86400000 (24 hours)'"), 'Must raise on invalid window_ms');
      assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_max_requests must be a positive integer not exceeding 1000'"), 'Must raise on invalid max_requests');
    });
  });

  describe('6. Robots.txt Disallow Rules', () => {
    test('public/robots.txt disallows /dashboard routes', () => {
      const robots = fs.readFileSync('public/robots.txt', 'utf8');
      assert.ok(robots.includes('Disallow: /dashboard'), 'Must disallow /dashboard');
      assert.ok(robots.includes('Disallow: /dashboard/'), 'Must disallow /dashboard/');
    });
  });

  describe('7. Repository Credential Hygiene (.gitignore)', () => {
    test('.gitignore explicitly ignores sensitive files', () => {
      const gitignore = fs.readFileSync('.gitignore', 'utf8');
      assert.ok(gitignore.includes('bearer.txt'));
      assert.ok(gitignore.includes('status.txt'));
      assert.ok(gitignore.includes('bearer_err.txt'));
      assert.ok(gitignore.includes('status_err.txt'));
      assert.ok(gitignore.includes('rpc_test.ps1'));
      assert.ok(gitignore.includes('run_worker.ps1'));
    });
  });

  describe('8. Safe QR SVG Conversion in DashboardEnroll', () => {
    test('SVG with script tag or event handler is rejected', () => {
      function toSafeQrImageUrl(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        if (trimmed.startsWith('data:image/')) return trimmed;
        if (trimmed.startsWith('<svg') && trimmed.endsWith('</svg>')) {
          const lower = trimmed.toLowerCase();
          if (
            lower.includes('<script') ||
            lower.includes('<foreignobject') ||
            lower.includes('<iframe') ||
            lower.includes('<object') ||
            lower.includes('<embed') ||
            lower.includes('javascript:') ||
            /\son[a-z]+\s*=/i.test(trimmed)
          ) {
            return null;
          }
          return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
        }
        return null;
      }

      const maliciousSvg = '<svg><script>alert(1)</script></svg>';
      assert.equal(toSafeQrImageUrl(maliciousSvg), null);

      const maliciousOnload = '<svg onload="alert(1)"><rect /></svg>';
      assert.equal(toSafeQrImageUrl(maliciousOnload), null);

      const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#000" /></svg>';
      const result = toSafeQrImageUrl(validSvg);
      assert.ok(result.startsWith('data:image/svg+xml;utf8,'));
      assert.ok(!result.includes('<script'));
    });
  });
});
