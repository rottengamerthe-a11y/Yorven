import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SafeHttpFetcher } from '../../src/fetcher/fetcher.js';

test('Fetcher: rejects non-HTTPS schemes', () => {
  const fetcher = new SafeHttpFetcher();
  assert.throws(
    () => fetcher.validateTargetUrl('http://yorven.in/about'),
    /DISALLOWED_SCHEME/
  );
  assert.throws(
    () => fetcher.validateTargetUrl('ftp://yorven.in/files'),
    /DISALLOWED_SCHEME/
  );
});

test('Fetcher: rejects external hostnames', () => {
  const fetcher = new SafeHttpFetcher();
  assert.throws(
    () => fetcher.validateTargetUrl('https://example.com/'),
    /EXTERNAL_HOST_DISALLOWED/
  );
  assert.throws(
    () => fetcher.validateTargetUrl('https://attacker.yorven.in.evil.com/'),
    /EXTERNAL_HOST_DISALLOWED/
  );
  assert.throws(
    () => fetcher.validateTargetUrl('https://subdomain.yorven.in/'),
    /EXTERNAL_HOST_DISALLOWED/
  );
});

test('Fetcher: rejects userinfo in target URLs', () => {
  const fetcher = new SafeHttpFetcher();
  assert.throws(
    () => fetcher.validateTargetUrl('https://admin:secret@yorven.in/login'),
    /USERINFO_DISALLOWED/
  );
});

test('Fetcher: enforces 500 KB response body limit with stream abort', async () => {
  // Setup local mock HTTP server serving 600 KB
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const chunk = 'A'.repeat(64 * 1024); // 64 KB chunk
    for (let i = 0; i < 10; i++) {
      res.write(chunk); // 640 KB total
    }
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/large-page`;

  const fetcher = new SafeHttpFetcher({ allowLocalTest: true });

  try {
    await assert.rejects(
      () => fetcher.fetch(targetUrl),
      (err) => {
        assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
        assert.ok(err.message.includes('512000 bytes'));
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test('Fetcher: manual redirect following records chain and detects circular loops', async () => {
  // Server creating circular loop A -> B -> A
  const server = http.createServer((req, res) => {
    if (req.url === '/page-a') {
      res.writeHead(301, { 'Location': '/page-b' });
      res.end();
    } else if (req.url === '/page-b') {
      res.writeHead(302, { 'Location': '/page-a' });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const startUrl = `http://127.0.0.1:${port}/page-a`;

  const fetcher = new SafeHttpFetcher({ allowLocalTest: true });

  try {
    await assert.rejects(
      () => fetcher.fetch(startUrl),
      (err) => {
        assert.equal(err.code, 'ERR_REDIRECT_CHAIN_LOOP');
        assert.ok(err.redirectChain.length >= 2);
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test('Fetcher: successful response returns status, body, and load time', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><head><title>Test Page</title></head><body><h1>Hello</h1></body></html>');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/test`;

  const fetcher = new SafeHttpFetcher({ allowLocalTest: true });

  try {
    const res = await fetcher.fetch(targetUrl);
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('<title>Test Page</title>'));
    assert.ok(res.loadTimeMs >= 0);
    assert.equal(res.redirectChain.length, 0);
  } finally {
    server.close();
  }
});

test('Fetcher: redirect chain exceeding 5 hops throws ERR_REDIRECT_CHAIN_LOOP', async () => {
  // Server creating linear 6-hop redirect chain: /hop-0 -> /hop-1 -> ... -> /hop-6
  const server = http.createServer((req, res) => {
    const match = req.url.match(/\/hop-(\d+)/);
    if (match) {
      const hopNum = parseInt(match[1], 10);
      res.writeHead(301, { 'Location': `/hop-${hopNum + 1}` });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const startUrl = `http://127.0.0.1:${port}/hop-0`;

  const fetcher = new SafeHttpFetcher({ allowLocalTest: true });

  try {
    await assert.rejects(
      () => fetcher.fetch(startUrl),
      (err) => {
        assert.equal(err.code, 'ERR_REDIRECT_CHAIN_LOOP');
        assert.ok(err.message.includes('Redirect hops exceeded maximum'));
        assert.ok(err.redirectChain.length > 5);
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test('Fetcher: transparently decompresses gzip payloads', async () => {
  const zlib = await import('node:zlib');
  const payload = '<html><body><h1>Decompressed Gzip Content</h1></body></html>';
  const compressed = zlib.gzipSync(Buffer.from(payload, 'utf-8'));

  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Encoding': 'gzip'
    });
    res.end(compressed);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/gzip-page`;

  const fetcher = new SafeHttpFetcher({ allowLocalTest: true });

  try {
    const res = await fetcher.fetch(targetUrl);
    assert.equal(res.status, 200);
    assert.equal(res.body, payload);
  } finally {
    server.close();
  }
});

test('Fetcher: DNS rebinding regression — pinned lookup prevents unpinned second resolution to private IP', async () => {
  let dnsCallCount = 0;
  const mockDnsLookup = async (hostname, opts) => {
    dnsCallCount++;
    if (dnsCallCount === 1) {
      // First call (initial verification) returns public safe IP
      return [{ address: '93.184.216.34', family: 4 }];
    }
    // Any secondary DNS query attempt (e.g. rebinding) returns private IP
    return [{ address: '127.0.0.1', family: 4 }];
  };

  const fetcher = new SafeHttpFetcher({
    allowLocalTest: false,
    dnsLookupFn: mockDnsLookup
  });

  // Target URL is valid https://yorven.in/test
  const parsed = fetcher.validateTargetUrl('https://yorven.in/test');

  // Verify that resolveAndVerifyDns resolves the first IP safely
  const { resolveAndVerifyDns, createPinnedLookup } = await import('../../src/fetcher/ssrf.js');
  const verifiedIps = await resolveAndVerifyDns(parsed.hostname, mockDnsLookup);
  assert.deepEqual(verifiedIps, ['93.184.216.34']);

  // Pinned lookup function is generated strictly from the verified IP
  const pinnedLookup = createPinnedLookup(verifiedIps[0]);

  // Even if the hostname is queried again on the socket, pinnedLookup yields ONLY the verified IP
  await new Promise((resolve, reject) => {
    pinnedLookup('yorven.in', { all: true }, (err, addresses) => {
      if (err) return reject(err);
      try {
        assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
        // DNS lookup count remains 1 because pinned lookup does not query DNS!
        assert.equal(dnsCallCount, 1);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
});

test('Fetcher: connected socket remote address verification aborts if prohibited private IP is reached', async () => {
  const fetcher = new SafeHttpFetcher({ allowLocalTest: false });

  // When allowLocalTest is false, if a socket somehow connects to 127.0.0.1, it must be rejected immediately
  const parsed = new URL('https://yorven.in/fake');
  await assert.rejects(
    () => fetcher._executeRequest({
      parsedUrl: parsed,
      pinnedIp: '127.0.0.1', // Attempting to use a prohibited IP
      verifiedIps: ['127.0.0.1']
    }),
    /SSRF_PROHIBITED_DESTINATION/
  );
});
